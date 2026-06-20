from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import get_user_id
from models import GoalCreate, GoalUpdate, GoalDepCreate
from datetime import date as date_type, timedelta

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("")
def list_goals(user_id: str = Depends(get_user_id)):
    db = get_db()
    goals = (
        db.table("goals").select("*")
        .eq("user_id", user_id)
        .is_("completed_at", "null")
        .order("created_at")
        .execute().data
    )
    if not goals:
        return goals
    goal_ids = [g["id"] for g in goals]
    all_gh = (
        db.table("goal_habits")
        .select("goal_id, habit_id")
        .in_("goal_id", goal_ids)
        .execute().data
    )
    gh_map: dict[int, list[str]] = {}
    for row in all_gh:
        gh_map.setdefault(row["goal_id"], []).append(row["habit_id"])
    for goal in goals:
        goal["habit_ids"] = gh_map.get(goal["id"], [])
    return goals


@router.get("/graph")
def get_goals_graph(user_id: str = Depends(get_user_id)):
    db = get_db()
    goals = (
        db.table("goals").select("*")
        .eq("user_id", user_id)
        .is_("completed_at", "null")
        .execute().data
    )
    goal_ids = [g["id"] for g in goals]
    deps = []
    if goal_ids:
        deps = (
            db.table("goal_deps")
            .select("goal_id, depends_on_goal_id")
            .in_("goal_id", goal_ids)
            .execute().data
        )
    return {"goals": goals, "deps": deps}


@router.get("/achievements")
def get_achievements_goals(user_id: str = Depends(get_user_id)):
    db = get_db()
    return (
        db.table("goals").select("*")
        .eq("user_id", user_id)
        .not_.is_("completed_at", "null")
        .order("completed_at", desc=True)
        .execute().data
    )


@router.post("", status_code=201)
def create_goal(body: GoalCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("goals").insert({
        "user_id": user_id,
        "title": body.title,
        "description": body.description,
        "commitment": body.commitment,
        "deadline": body.deadline,
        "image_url": body.image_url,
        "goal_type": body.goal_type,
        "horizon": body.horizon,
    }).execute()
    goal = res.data[0]
    goal["habit_ids"] = []
    return goal


@router.patch("/{goal_id}")
def update_goal(goal_id: int, body: GoalUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    if data:
        db.table("goals").update(data).eq("id", goal_id).eq("user_id", user_id).execute()
    goal = (
        db.table("goals").select("*")
        .eq("id", goal_id).eq("user_id", user_id)
        .execute().data[0]
    )
    gh = db.table("goal_habits").select("habit_id").eq("goal_id", goal_id).execute().data
    goal["habit_ids"] = [r["habit_id"] for r in gh]
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("goals").delete().eq("id", goal_id).eq("user_id", user_id).execute()


@router.post("/{goal_id}/habits/{habit_id}", status_code=201)
def attach_habit(goal_id: int, habit_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = db.table("goal_habits").select("id").eq("goal_id", goal_id).eq("habit_id", habit_id).execute()
    if not existing.data:
        db.table("goal_habits").insert({
            "goal_id": goal_id,
            "habit_id": habit_id,
            "linked_at": str(date_type.today()),
        }).execute()
    return {"ok": True}


@router.delete("/{goal_id}/habits/{habit_id}", status_code=204)
def detach_habit(goal_id: int, habit_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("goal_habits").delete().eq("goal_id", goal_id).eq("habit_id", habit_id).execute()


@router.get("/{goal_id}/deps")
def get_goal_deps(goal_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    rows = db.table("goal_deps").select("depends_on_goal_id").eq("goal_id", goal_id).execute().data
    return [r["depends_on_goal_id"] for r in rows]


@router.post("/{goal_id}/deps", status_code=201)
def add_goal_dep(goal_id: int, body: GoalDepCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = (
        db.table("goal_deps").select("id")
        .eq("goal_id", goal_id)
        .eq("depends_on_goal_id", body.depends_on_goal_id)
        .execute().data
    )
    if not existing:
        db.table("goal_deps").insert({
            "goal_id": goal_id,
            "depends_on_goal_id": body.depends_on_goal_id,
        }).execute()
    return {"ok": True}


@router.delete("/{goal_id}/deps/{dep_id}", status_code=204)
def remove_goal_dep(goal_id: int, dep_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("goal_deps").delete().eq("goal_id", goal_id).eq("depends_on_goal_id", dep_id).execute()


@router.post("/{goal_id}/complete")
def complete_goal(goal_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("goals").update({"completed_at": str(date_type.today())})\
        .eq("id", goal_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Goal not found")
    return res.data[0]


@router.post("/{goal_id}/reopen")
def reopen_goal(goal_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("goals").update({"completed_at": None})\
        .eq("id", goal_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Goal not found")
    return res.data[0]


@router.get("/{goal_id}/progress")
def goal_progress(goal_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()

    goal_res = db.table("goals").select("goal_type").eq("id", goal_id).execute().data
    if not goal_res:
        raise HTTPException(404, "Goal not found")
    goal_type = goal_res[0].get("goal_type", "action")

    gh_rows = db.table("goal_habits").select("habit_id, linked_at").eq("goal_id", goal_id).execute().data
    if not gh_rows:
        return {"goal_type": goal_type, "pct": 0, "perfect_days": 0,
                "active_days": 0, "streak_current": 0, "streak_best": 0}

    habit_ids = [r["habit_id"] for r in gh_rows]
    linked_dates = [str(r["linked_at"])[:10] for r in gh_rows if r.get("linked_at")]
    start_date = min(linked_dates) if linked_dates else str(date_type.today())
    today = date_type.today()
    start = date_type.fromisoformat(start_date)

    records_res = (
        db.table("records").select("date, habit_id, state")
        .in_("habit_id", habit_ids)
        .gte("date", str(start)).lte("date", str(today))
        .eq("user_id", user_id).execute()
    )

    by_date: dict[str, dict[str, str]] = {}
    for r in records_res.data:
        d = str(r["date"])[:10]
        by_date.setdefault(d, {})[str(r["habit_id"])] = r["state"]

    if goal_type == "mindset":
        streak_current = 0
        check = today
        while check >= start:
            day = by_date.get(str(check), {})
            if any(day.get(hid) == "done" for hid in habit_ids):
                streak_current += 1
                check -= timedelta(days=1)
            else:
                break

        streak_best = 0
        run = 0
        cur = start
        while cur <= today:
            day = by_date.get(str(cur), {})
            if any(day.get(hid) == "done" for hid in habit_ids):
                run += 1
                streak_best = max(streak_best, run)
            else:
                run = 0
            cur += timedelta(days=1)

        return {"goal_type": "mindset", "streak_current": streak_current, "streak_best": streak_best}

    else:
        total_pct = 0.0
        active_days = 0
        perfect_days = 0

        cur = start
        while cur <= today:
            day = by_date.get(str(cur), {})
            rest_count = sum(1 for hid in habit_ids if day.get(hid) == "rest")
            active_habits = len(habit_ids) - rest_count
            if active_habits <= 0:
                cur += timedelta(days=1)
                continue
            done_count = sum(1 for hid in habit_ids if day.get(hid) == "done")
            day_pct = done_count / active_habits
            total_pct += day_pct
            active_days += 1
            if day_pct == 1.0:
                perfect_days += 1
            cur += timedelta(days=1)

        pct = round((total_pct / active_days) * 100, 1) if active_days > 0 else 0

        streak_current = 0
        check = today
        while check >= start:
            day = by_date.get(str(check), {})
            rest_count = sum(1 for hid in habit_ids if day.get(hid) == "rest")
            active_habits = len(habit_ids) - rest_count
            if active_habits <= 0:
                check -= timedelta(days=1)
                continue
            done_count = sum(1 for hid in habit_ids if day.get(hid) == "done")
            if done_count == active_habits:
                streak_current += 1
                check -= timedelta(days=1)
            else:
                break

        streak_best = 0
        run = 0
        cur = start
        while cur <= today:
            day = by_date.get(str(cur), {})
            rest_count = sum(1 for hid in habit_ids if day.get(hid) == "rest")
            active_habits = len(habit_ids) - rest_count
            if active_habits <= 0:
                cur += timedelta(days=1)
                continue
            done_count = sum(1 for hid in habit_ids if day.get(hid) == "done")
            if done_count == active_habits:
                run += 1
                streak_best = max(streak_best, run)
            else:
                run = 0
            cur += timedelta(days=1)

        return {
            "goal_type": "action",
            "pct": pct,
            "perfect_days": perfect_days,
            "active_days": active_days,
            "streak_current": streak_current,
            "streak_best": streak_best,
        }
