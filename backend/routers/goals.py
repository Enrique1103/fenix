from fastapi import APIRouter, Depends
from database import get_db
from auth import get_user_id
from pydantic import BaseModel
from typing import Optional
from datetime import date as date_type

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    commitment: Optional[str] = None
    deadline: Optional[str] = None
    image_url: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    commitment: Optional[str] = None
    deadline: Optional[str] = None
    image_url: Optional[str] = None


@router.get("")
def list_goals(user_id: str = Depends(get_user_id)):
    db = get_db()
    goals = db.table("goals").select("*").eq("user_id", user_id).order("created_at").execute().data
    if not goals:
        return goals
    goal_ids = [g["id"] for g in goals]
    all_gh = (
        db.table("goal_habits")
        .select("goal_id, habit_id")
        .in_("goal_id", goal_ids)
        .execute()
        .data
    )
    gh_map: dict[int, list[str]] = {}
    for row in all_gh:
        gh_map.setdefault(row["goal_id"], []).append(row["habit_id"])
    for goal in goals:
        goal["habit_ids"] = gh_map.get(goal["id"], [])
    return goals


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
        db.table("goals")
        .select("*")
        .eq("id", goal_id)
        .eq("user_id", user_id)
        .execute()
        .data[0]
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


@router.get("/{goal_id}/progress")
def goal_progress(goal_id: int, user_id: str = Depends(get_user_id)):
    """
    Calcula el progreso de una meta basado en sus hábitos vinculados.

    Reglas:
    - Un día cuenta como "perfecto" si TODOS los hábitos vinculados están en 'done'.
    - Los días donde algún hábito está en 'rest' se excluyen del denominador.
    - Retorna: pct (0-100), perfect_days, active_days, streak_current, streak_best.
    """
    db = get_db()

    goal = (
        db.table("goals").select("created_at")
        .eq("id", goal_id).eq("user_id", user_id)
        .execute().data
    )
    if not goal:
        return {"pct": 0, "perfect_days": 0, "active_days": 0, "streak_current": 0, "streak_best": 0}

    gh_rows = db.table("goal_habits").select("habit_id, linked_at")\
        .eq("goal_id", goal_id).execute().data
    if not gh_rows:
        return {"pct": 0, "perfect_days": 0, "active_days": 0, "streak_current": 0, "streak_best": 0}
    habit_ids = [r["habit_id"] for r in gh_rows]
    linked_dates = [str(r["linked_at"])[:10] for r in gh_rows if r.get("linked_at")]
    start_date = min(linked_dates) if linked_dates else str(goal[0]["created_at"])[:10]
    today = str(date_type.today())

    records = (
        db.table("records")
        .select("date, habit_id, state")
        .eq("user_id", user_id)
        .in_("habit_id", habit_ids)
        .gte("date", start_date)
        .lte("date", today)
        .execute().data
    )

    # Agrupar por fecha
    by_date: dict[str, dict[str, str]] = {}
    for r in records:
        d = str(r["date"])[:10]
        by_date.setdefault(d, {})[str(r["habit_id"])] = r["state"]

    # Iterar día a día desde start_date hasta hoy
    from datetime import timedelta
    current = date_type.fromisoformat(start_date)
    end = date_type.fromisoformat(today)

    perfect_days = 0
    active_days = 0
    streak_current = 0
    streak_best = 0
    run = 0

    while current <= end:
        key = str(current)
        day_states = by_date.get(key, {})

        # Si algún hábito tiene 'rest' ese día se excluye del denominador
        has_rest = any(day_states.get(hid) == "rest" for hid in habit_ids)
        if has_rest:
            current += timedelta(days=1)
            continue

        active_days += 1
        all_done = all(day_states.get(hid) == "done" for hid in habit_ids)

        if all_done:
            perfect_days += 1
            run += 1
            streak_best = max(streak_best, run)
        else:
            run = 0

        current += timedelta(days=1)

    # Racha actual (desde hoy hacia atrás)
    check = end
    while check >= date_type.fromisoformat(start_date):
        key = str(check)
        day_states = by_date.get(key, {})
        has_rest = any(day_states.get(hid) == "rest" for hid in habit_ids)
        if has_rest:
            check -= timedelta(days=1)
            continue
        if all(day_states.get(hid) == "done" for hid in habit_ids):
            streak_current += 1
            check -= timedelta(days=1)
        else:
            break

    pct = round(perfect_days / active_days * 100) if active_days else 0

    return {
        "pct": pct,
        "perfect_days": perfect_days,
        "active_days": active_days,
        "streak_current": streak_current,
        "streak_best": streak_best,
    }
