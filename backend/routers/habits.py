from fastapi import APIRouter, Depends
from database import get_db
from models import HabitCreate, HabitUpdate
from auth import get_user_id

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get("")
def list_habits(user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("habits").select("*").eq("user_id", user_id).eq("active", True).order("ord").execute()
    return res.data


@router.post("", status_code=201)
def create_habit(body: HabitCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = db.table("habits").select("ord").eq("user_id", user_id).order("ord", desc=True).limit(1).execute()
    next_ord = (existing.data[0]["ord"] + 1) if existing.data else 0
    res = db.table("habits").insert({
        "name": body.name.strip(),
        "ord": next_ord,
        "active": True,
        "user_id": user_id,
    }).execute()
    return res.data[0]


@router.patch("/{habit_id}")
def update_habit(habit_id: str, body: HabitUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    res = db.table("habits").update(data).eq("id", habit_id).eq("user_id", user_id).execute()
    return res.data[0]


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("habits").update({"active": False}).eq("id", habit_id).eq("user_id", user_id).execute()


@router.put("/reorder")
def reorder_habits(ordered_ids: list[str], user_id: str = Depends(get_user_id)):
    db = get_db()
    if not ordered_ids:
        return {"ok": True}
    owned = db.table("habits").select("id").eq("user_id", user_id).in_("id", ordered_ids).execute()
    owned_ids = {r["id"] for r in owned.data}
    rows = [{"id": hid, "ord": i, "user_id": user_id} for i, hid in enumerate(ordered_ids) if hid in owned_ids]
    if rows:
        db.table("habits").upsert(rows).execute()
    return {"ok": True}
