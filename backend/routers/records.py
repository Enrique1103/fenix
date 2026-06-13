from fastapi import APIRouter, Depends
from database import get_db
from models import RecordSet
from auth import get_user_id
from datetime import date as date_type, timedelta
from dateutil.relativedelta import relativedelta
import calendar

router = APIRouter(prefix="/records", tags=["records"])


def _month_range(year: int, month: int) -> tuple[str, str]:
    start = f"{year:04d}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end = f"{year:04d}-{month:02d}-{last_day:02d}"
    return start, end


@router.get("/day/{date}")
def get_day(date: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("records").select("habit_id, state").eq("date", date).eq("user_id", user_id).execute()
    return {r["habit_id"]: r["state"] for r in res.data}


@router.get("/day-score/{date}")
def day_score(date: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    habits = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_ids = [h["id"] for h in habits.data]
    habit_count = len(habit_ids)
    if habit_count == 0:
        return {"habit_count": 0, "done": 0, "rest": 0, "failed": 0, "is_perfect": False, "is_rest_day": False}

    records = db.table("records").select("habit_id, state")\
        .eq("date", date).eq("user_id", user_id).execute()

    state_map = {str(r["habit_id"]): r["state"] for r in records.data}
    done   = sum(1 for hid in habit_ids if state_map.get(str(hid)) == "done")
    rest   = sum(1 for hid in habit_ids if state_map.get(str(hid)) == "rest")
    failed = sum(1 for hid in habit_ids if state_map.get(str(hid)) == "failed")
    active_count = habit_count - rest

    return {
        "habit_count": habit_count,
        "done": done,
        "rest": rest,
        "failed": failed,
        "is_perfect": active_count > 0 and done == active_count,
        "is_rest_day": rest == habit_count,
    }


@router.get("/streak")
def get_streak(user_id: str = Depends(get_user_id)):
    db = get_db()
    habits = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_ids = [str(h["id"]) for h in habits.data]
    habit_count = len(habit_ids)
    if habit_count == 0:
        return {"streak_current": 0, "streak_best": 0}

    first_res = db.table("records").select("date").eq("user_id", user_id).order("date").limit(1).execute()
    if not first_res.data:
        return {"streak_current": 0, "streak_best": 0}

    start = date_type.fromisoformat(str(first_res.data[0]["date"])[:10])
    today = date_type.today()

    records = db.table("records").select("date, habit_id, state")\
        .eq("user_id", user_id).gte("date", str(start)).lte("date", str(today)).execute()

    by_date: dict[str, dict[str, str]] = {}
    for r in records.data:
        d = str(r["date"])[:10]
        by_date.setdefault(d, {})[str(r["habit_id"])] = r["state"]

    streak_best = 0
    run = 0
    cur = start
    while cur <= today:
        key = str(cur)
        day = by_date.get(key, {})
        has_rest = any(day.get(hid) == "rest" for hid in habit_ids)
        if has_rest:
            cur += timedelta(days=1)
            continue
        all_done = all(day.get(hid) == "done" for hid in habit_ids)
        if all_done:
            run += 1
            streak_best = max(streak_best, run)
        else:
            run = 0
        cur += timedelta(days=1)

    streak_current = 0
    check = today
    while check >= start:
        key = str(check)
        day = by_date.get(key, {})
        has_rest = any(day.get(hid) == "rest" for hid in habit_ids)
        if has_rest:
            check -= timedelta(days=1)
            continue
        if all(day.get(hid) == "done" for hid in habit_ids):
            streak_current += 1
            check -= timedelta(days=1)
        else:
            break

    return {"streak_current": streak_current, "streak_best": streak_best}


@router.get("/month/{year}/{month}")
def get_month(year: int, month: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    start, end = _month_range(year, month)
    res = (db.table("records")
           .select("date")
           .gte("date", start)
           .lte("date", end)
           .eq("state", "done")
           .eq("user_id", user_id)
           .execute())
    summary: dict[str, int] = {}
    for r in res.data:
        d = str(r["date"])
        summary[d] = summary.get(d, 0) + 1

    habits_count_res = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_count = len(habits_count_res.data)

    rest_res = db.table("records").select("date").gte("date", start).lte("date", end)\
        .eq("state", "rest").eq("user_id", user_id).execute()
    rest_by_date: dict[str, int] = {}
    for r in rest_res.data:
        d = str(r["date"])
        rest_by_date[d] = rest_by_date.get(d, 0) + 1

    today_str = str(date_type.today())
    days_elapsed = min(int(end[-2:]), int(today_str[-2:]) if today_str[:7] == start[:7] else int(end[-2:]))
    total_slots = days_elapsed * habit_count - sum(rest_by_date.values())
    total_done = sum(summary.values())
    pct = round(total_done / total_slots * 100, 1) if total_slots > 0 else 0

    return {"summary": summary, "pct": pct, "habit_count": habit_count}


@router.get("/month/{year}/{month}/habits")
def get_month_by_habit(year: int, month: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    start, end = _month_range(year, month)
    res = (db.table("records")
           .select("habit_id")
           .gte("date", start)
           .lte("date", end)
           .eq("state", "done")
           .eq("user_id", user_id)
           .execute())
    stats: dict[str, int] = {}
    for r in res.data:
        hid = str(r["habit_id"])
        stats[hid] = stats.get(hid, 0) + 1
    return stats


@router.get("/month-all/{year}/{month}")
def get_month_all(year: int, month: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    start, end = _month_range(year, month)
    res = (db.table("records")
           .select("date, habit_id, state")
           .gte("date", start)
           .lte("date", end)
           .eq("user_id", user_id)
           .execute())
    return [{"date": str(r["date"]), "habit_id": r["habit_id"], "state": r["state"]} for r in res.data]


@router.post("/set")
def set_record(body: RecordSet, user_id: str = Depends(get_user_id)):
    db = get_db()
    if body.state is None:
        db.table("records").delete().eq("date", body.date).eq("habit_id", body.habit_id).eq("user_id", user_id).execute()
        return {"state": None}
    existing = db.table("records").select("id").eq("date", body.date).eq("habit_id", body.habit_id).eq("user_id", user_id).execute()
    if existing.data:
        db.table("records").update({"state": body.state}).eq("id", existing.data[0]["id"]).execute()
    else:
        db.table("records").insert({
            "date": body.date,
            "habit_id": body.habit_id,
            "state": body.state,
            "user_id": user_id,
        }).execute()
    return {"state": body.state}


def _week_label(ws: date_type) -> str:
    thursday = ws + timedelta(days=3)
    m = date_type(thursday.year, thursday.month, 1)
    while m.weekday() != 0:
        m += timedelta(days=1)
    week_num = max(1, (ws - m).days // 7 + 1) if ws >= m else 1
    return f"S{week_num}/{thursday.month}/{str(thursday.year)[2:]}"


@router.get("/weekly-trend")
def weekly_trend(user_id: str = Depends(get_user_id)):
    db = get_db()
    habits_res = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_count = len(habits_res.data)
    if habit_count == 0:
        return []

    first_res = (db.table("records").select("date").eq("user_id", user_id).order("date").limit(1).execute())
    if not first_res.data:
        return []

    first_date = date_type.fromisoformat(str(first_res.data[0]["date"]))
    first_monday = first_date - timedelta(days=first_date.weekday())
    today = date_type.today()
    current_monday = today - timedelta(days=today.weekday())

    res = (db.table("records")
           .select("date, state")
           .eq("user_id", user_id)
           .gte("date", str(first_monday))
           .lte("date", str(today))
           .execute())

    done_by_date: dict[str, int] = {}
    rest_by_date: dict[str, int] = {}
    for r in res.data:
        d = str(r["date"])
        if r["state"] == "done":
            done_by_date[d] = done_by_date.get(d, 0) + 1
        elif r["state"] == "rest":
            rest_by_date[d] = rest_by_date.get(d, 0) + 1

    result = []
    ws = first_monday
    while ws <= current_monday:
        days = [str(ws + timedelta(days=j)) for j in range(7) if (ws + timedelta(days=j)) <= today]
        done = sum(done_by_date.get(d, 0) for d in days)
        rest = sum(rest_by_date.get(d, 0) for d in days)
        total = len(days) * habit_count - rest
        pct = round(done / total * 100, 1) if total else 0
        if done > 0 or ws == current_monday:
            result.append({"week_start": str(ws), "label": _week_label(ws), "pct": pct})
        ws += timedelta(weeks=1)

    return result


@router.get("/weekday-avg")
def weekday_avg(months: int = 3, user_id: str = Depends(get_user_id)):
    db = get_db()
    habits_res = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_count = len(habits_res.data)
    if habit_count == 0:
        return {}

    today = date_type.today()
    range_start = today - relativedelta(months=months)

    res = (db.table("records")
           .select("date, state")
           .eq("user_id", user_id)
           .gte("date", str(range_start))
           .lte("date", str(today))
           .execute())

    wd_done  = [0] * 7
    wd_rest  = [0] * 7
    wd_total = [0] * 7
    seen_dates: set[str] = set()

    for r in res.data:
        d = str(r["date"])
        wd = date_type.fromisoformat(d).weekday()
        if r["state"] == "done":
            wd_done[wd] += 1
        elif r["state"] == "rest":
            wd_rest[wd] += 1
        if d not in seen_dates:
            wd_total[wd] += habit_count
            seen_dates.add(d)

    return {
        str(wd): round(wd_done[wd] / (wd_total[wd] - wd_rest[wd]) * 100, 1)
        if (wd_total[wd] - wd_rest[wd]) > 0 else 0
        for wd in range(7)
    }


MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]


@router.get("/monthly-trend")
def monthly_trend(user_id: str = Depends(get_user_id)):
    db = get_db()
    habits_res = db.table("habits").select("id").eq("user_id", user_id).eq("active", True).execute()
    habit_count = len(habits_res.data)
    if habit_count == 0:
        return []

    first_res = db.table("records").select("date").eq("user_id", user_id).order("date").limit(1).execute()
    if not first_res.data:
        return []

    first_date = date_type.fromisoformat(str(first_res.data[0]["date"]))
    today = date_type.today()

    result = []
    y, m = first_date.year, first_date.month

    while (y, m) <= (today.year, today.month):
        start, end = _month_range(y, m)
        cap = str(today) if (y, m) == (today.year, today.month) else end

        res = (db.table("records")
               .select("state")
               .gte("date", start)
               .lte("date", cap)
               .eq("user_id", user_id)
               .execute())

        done = sum(1 for r in res.data if r["state"] == "done")
        rest = sum(1 for r in res.data if r["state"] == "rest")
        days_elapsed = today.day if (y, m) == (today.year, today.month) else calendar.monthrange(y, m)[1]
        total = days_elapsed * habit_count - rest
        pct = round(done / total * 100, 1) if total > 0 else 0

        result.append({"label": f"{MONTHS_ES[m - 1]} {str(y)[2:]}", "pct": pct})

        m += 1
        if m > 12:
            m = 1
            y += 1

    return result


@router.delete("/month/{year}/{month}", status_code=204)
def reset_month(year: int, month: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    start, end = _month_range(year, month)
    db.table("records").delete().gte("date", start).lte("date", end).eq("user_id", user_id).execute()


@router.delete("/all", status_code=204)
def reset_all(user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("records").delete().eq("user_id", user_id).execute()
