from fastapi import APIRouter, Depends, HTTPException
from database import get_db
from auth import get_user_id
from models import (
    TemplateCreate, TemplateUpdate,
    BlockCreate, BlockUpdate,
    CategoryCreate,
    DayBlockCreate, DayBlockUpdate,
    BlockCompletion, DayOverride,
)

router = APIRouter(prefix="/routine", tags=["routine"])


# ── Plantillas ────────────────────────────────────────────────────────────────

@router.get("/templates")
def get_templates(user_id: str = Depends(get_user_id)):
    db = get_db()
    return db.table("routine_templates").select("*")\
        .eq("user_id", user_id).order("created_at").execute().data

@router.post("/templates")
def create_template(body: TemplateCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("routine_templates").insert({
        "user_id": user_id,
        "name": body.name,
        "color": body.color,
    }).execute()
    return res.data[0]

@router.patch("/templates/{tid}")
def update_template(tid: int, body: TemplateUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    res = db.table("routine_templates").update(data)\
        .eq("id", tid).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Template not found")
    return res.data[0]

@router.delete("/templates/{tid}", status_code=204)
def delete_template(tid: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("routine_templates").delete()\
        .eq("id", tid).eq("user_id", user_id).execute()


# ── Bloques de plantilla ──────────────────────────────────────────────────────

@router.get("/templates/{tid}/blocks")
def get_blocks(tid: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    return db.table("routine_blocks").select("*")\
        .eq("template_id", tid).eq("user_id", user_id)\
        .order("start_time").execute().data

@router.post("/blocks")
def create_block(body: BlockCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("routine_blocks").insert({
        "user_id": user_id,
        **body.model_dump(),
    }).execute()
    return res.data[0]

@router.patch("/blocks/{bid}")
def update_block(bid: int, body: BlockUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    res = db.table("routine_blocks").update(data)\
        .eq("id", bid).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Block not found")
    return res.data[0]

@router.delete("/blocks/{bid}", status_code=204)
def delete_block(bid: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("routine_blocks").delete()\
        .eq("id", bid).eq("user_id", user_id).execute()

@router.put("/templates/{tid}/blocks/reorder")
def reorder_blocks(tid: int, ordered_ids: list[int], user_id: str = Depends(get_user_id)):
    db = get_db()
    for i, bid in enumerate(ordered_ids):
        db.table("routine_blocks").update({"ord": i})\
            .eq("id", bid).eq("user_id", user_id).execute()
    return {"ok": True}


# ── Categorías personalizadas ─────────────────────────────────────────────────

@router.get("/categories")
def get_categories(user_id: str = Depends(get_user_id)):
    db = get_db()
    return db.table("routine_categories").select("*")\
        .eq("user_id", user_id).order("created_at").execute().data

@router.post("/categories")
def create_category(body: CategoryCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("routine_categories").insert({
        "user_id": user_id,
        "label": body.label,
        "color": body.color,
    }).execute()
    return res.data[0]

@router.delete("/categories/{cid}", status_code=204)
def delete_category(cid: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("routine_categories").delete()\
        .eq("id", cid).eq("user_id", user_id).execute()


# ── Vista del día ─────────────────────────────────────────────────────────────

@router.get("/day/{date}")
def get_day(date: str, user_id: str = Depends(get_user_id)):
    db = get_db()

    override = db.table("routine_day_overrides").select("template_id")\
        .eq("date", date).eq("user_id", user_id).execute().data
    template_id = override[0]["template_id"] if override else None

    if template_id is None:
        templates = db.table("routine_templates").select("id")\
            .eq("user_id", user_id).order("created_at").limit(1).execute().data
        if templates:
            template_id = templates[0]["id"]

    template = None
    template_blocks = []
    if template_id:
        tmpl_res = db.table("routine_templates").select("*")\
            .eq("id", template_id).eq("user_id", user_id).execute().data
        template = tmpl_res[0] if tmpl_res else None

        blocks_res = db.table("routine_blocks").select("*")\
            .eq("template_id", template_id).eq("user_id", user_id)\
            .order("start_time").execute().data

        block_ids = [b["id"] for b in blocks_res]
        completions = {}
        if block_ids:
            comp_res = db.table("routine_block_completions").select("block_id, completed")\
                .in_("block_id", block_ids).eq("date", date).eq("user_id", user_id).execute().data
            completions = {c["block_id"]: c["completed"] for c in comp_res}

        template_blocks = [{**b, "completed": completions.get(b["id"], False)} for b in blocks_res]

    day_blocks = db.table("routine_day_blocks").select("*")\
        .eq("date", date).eq("user_id", user_id).order("start_time").execute().data

    habit_states = db.table("records").select("habit_id, state")\
        .eq("date", date).eq("user_id", user_id).execute().data
    habit_map = {str(r["habit_id"]): r["state"] for r in habit_states}

    habits = db.table("habits").select("id, name, active")\
        .eq("user_id", user_id).eq("active", True).order("ord").execute().data
    habits_with_state = [{**h, "state": habit_map.get(str(h["id"]))} for h in habits]

    return {
        "template": template,
        "template_blocks": template_blocks,
        "day_blocks": day_blocks,
        "habits": habits_with_state,
    }

@router.post("/day/override")
def set_day_override(body: DayOverride, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = db.table("routine_day_overrides").select("id")\
        .eq("date", body.date).eq("user_id", user_id).execute().data
    if existing:
        db.table("routine_day_overrides").update({"template_id": body.template_id})\
            .eq("id", existing[0]["id"]).execute()
    else:
        db.table("routine_day_overrides").insert({
            "user_id": user_id,
            "date": body.date,
            "template_id": body.template_id,
        }).execute()
    return {"ok": True}


# ── Bloques extra del día ─────────────────────────────────────────────────────

@router.post("/day/blocks")
def create_day_block(body: DayBlockCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("routine_day_blocks").insert({
        "user_id": user_id,
        **body.model_dump(),
    }).execute()
    return res.data[0]

@router.patch("/day/blocks/{bid}")
def update_day_block(bid: int, body: DayBlockUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    res = db.table("routine_day_blocks").update(data)\
        .eq("id", bid).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Day block not found")
    return res.data[0]

@router.delete("/day/blocks/{bid}", status_code=204)
def delete_day_block(bid: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("routine_day_blocks").delete()\
        .eq("id", bid).eq("user_id", user_id).execute()


# ── Completar bloques ─────────────────────────────────────────────────────────

@router.post("/complete")
def complete_block(body: BlockCompletion, user_id: str = Depends(get_user_id)):
    db = get_db()

    existing = db.table("routine_block_completions").select("id")\
        .eq("block_id", body.block_id).eq("date", body.date)\
        .eq("user_id", user_id).execute().data

    if existing:
        db.table("routine_block_completions").update({"completed": body.completed})\
            .eq("id", existing[0]["id"]).execute()
    else:
        db.table("routine_block_completions").insert({
            "user_id": user_id,
            "block_id": body.block_id,
            "date": body.date,
            "completed": body.completed,
        }).execute()

    block = db.table("routine_blocks").select("habit_id")\
        .eq("id", body.block_id).execute().data
    if block and block[0].get("habit_id"):
        habit_id = block[0]["habit_id"]
        new_state = "done" if body.completed else None
        existing_rec = db.table("records").select("id")\
            .eq("date", body.date).eq("habit_id", habit_id)\
            .eq("user_id", user_id).execute().data
        if new_state is None:
            if existing_rec:
                db.table("records").delete()\
                    .eq("id", existing_rec[0]["id"]).execute()
        elif existing_rec:
            db.table("records").update({"state": new_state})\
                .eq("id", existing_rec[0]["id"]).execute()
        else:
            db.table("records").insert({
                "date": body.date,
                "habit_id": habit_id,
                "state": new_state,
                "user_id": user_id,
            }).execute()

    return {"ok": True}
