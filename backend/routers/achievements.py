from fastapi import APIRouter, Depends
from database import get_db
from auth import get_user_id
from pydantic import BaseModel
from typing import Optional
from datetime import date as date_type, timedelta

router = APIRouter(prefix="/achievements", tags=["achievements"])


class AchievementUpsert(BaseModel):
    type: str            # 'perfect_day' | 'best_week' | 'tasks_uptodate'
    date: str            # ISO date string
    meta: Optional[dict] = None


@router.get("")
def list_achievements(user_id: str = Depends(get_user_id)):
    db = get_db()
    cutoff = str(date_type.today() - timedelta(days=30))
    res = (
        db.table("achievements")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", cutoff)
        .order("date", desc=True)
        .execute()
    )
    return res.data


@router.post("")
def upsert_achievement(body: AchievementUpsert, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = (
        db.table("achievements")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", body.type)
        .eq("date", body.date)
        .execute()
    )
    if existing.data:
        db.table("achievements").update({"meta": body.meta})\
            .eq("id", existing.data[0]["id"]).execute()
    else:
        db.table("achievements").insert({
            "user_id": user_id,
            "type": body.type,
            "date": body.date,
            "meta": body.meta,
        }).execute()
    return {"ok": True}
