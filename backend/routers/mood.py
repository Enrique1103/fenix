from fastapi import APIRouter, Depends
import calendar
from database import get_db
from auth import get_user_id
from pydantic import BaseModel

router = APIRouter(prefix="/mood", tags=["mood"])


class MoodSet(BaseModel):
    date: str
    level: int  # 0 = borrar, 1-10 = nivel


@router.get("/{year}/{month}")
def get_month_mood(year: int, month: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    start = f"{year:04d}-{month:02d}-01"
    end   = f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"
    res = (db.table("daily_mood")
             .select("date, level")
             .gte("date", start)
             .lte("date", end)
             .eq("user_id", user_id)
             .execute())
    return {str(r["date"]): r["level"] for r in res.data}


@router.get("/{year}/{month}/avg")
def get_mood_avg(year: int, month: int, user_id: str = Depends(get_user_id)):
    import calendar as cal
    db = get_db()
    start = f"{year:04d}-{month:02d}-01"
    last_day = cal.monthrange(year, month)[1]
    end = f"{year:04d}-{month:02d}-{last_day:02d}"
    res = db.table("daily_mood").select("level").gte("date", start).lte("date", end)\
        .eq("user_id", user_id).execute()
    if not res.data:
        return {"avg": None}
    avg = round(sum(r["level"] for r in res.data) / len(res.data), 1)
    return {"avg": avg}


@router.post("/set")
def set_mood(body: MoodSet, user_id: str = Depends(get_user_id)):
    db = get_db()
    if body.level == 0:
        db.table("daily_mood").delete().eq("date", body.date).eq("user_id", user_id).execute()
        return {"level": 0}
    existing = (db.table("daily_mood")
                  .select("id")
                  .eq("date", body.date)
                  .eq("user_id", user_id)
                  .execute())
    if existing.data:
        db.table("daily_mood").update({"level": body.level}).eq("id", existing.data[0]["id"]).execute()
    else:
        db.table("daily_mood").insert({
            "date": body.date,
            "level": body.level,
            "user_id": user_id,
        }).execute()
    return {"level": body.level}
