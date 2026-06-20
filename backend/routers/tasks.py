from fastapi import APIRouter, Depends
from typing import Optional
from database import get_db
from models import TaskCreate, TaskUpdate
from auth import get_user_id

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/")
def get_tasks(type: Optional[str] = None, user_id: str = Depends(get_user_id)):
    db = get_db()
    q = db.table("tasks").select("*").eq("user_id", user_id).order("created_at", desc=True)
    if type:
        q = q.eq("type", type)
    tasks = q.execute().data

    deps_map: dict[int, list[int]] = {}
    task_ids = [t["id"] for t in tasks]
    if task_ids:
        deps = (
            db.table("task_deps")
            .select("task_id, depends_on_task_id")
            .in_("task_id", task_ids)
            .execute()
            .data
        )
        for d in deps:
            deps_map.setdefault(d["task_id"], []).append(d["depends_on_task_id"])

    for task in tasks:
        task["dep_ids"] = deps_map.get(task["id"], [])

    return tasks


@router.post("/")
def create_task(body: TaskCreate, user_id: str = Depends(get_user_id)):
    db = get_db()
    res = db.table("tasks").insert({
        "title": body.title,
        "type": body.type,
        "deadline": body.deadline,
        "completed": False,
        "user_id": user_id,
        "parent_task_id": body.parent_task_id,
        "description": body.description,
    }).execute()
    task = res.data[0]
    task["dep_ids"] = []
    return task


@router.patch("/{task_id}")
def update_task(task_id: int, body: TaskUpdate, user_id: str = Depends(get_user_id)):
    db = get_db()
    data = body.model_dump(exclude_unset=True)
    if data:
        db.table("tasks").update(data).eq("id", task_id).eq("user_id", user_id).execute()
    task = (
        db.table("tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .execute()
        .data[0]
    )
    deps = db.table("task_deps").select("depends_on_task_id").eq("task_id", task_id).execute().data
    task["dep_ids"] = [d["depends_on_task_id"] for d in deps]
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    owned = db.table("tasks").select("id").eq("id", task_id).eq("user_id", user_id).execute()
    if not owned.data:
        return
    all_user_tasks = db.table("tasks").select("id, parent_task_id").eq("user_id", user_id).execute().data

    def collect_descendants(tid: int) -> list[int]:
        children = [t["id"] for t in all_user_tasks if t["parent_task_id"] == tid]
        result = list(children)
        for child_id in children:
            result.extend(collect_descendants(child_id))
        return result

    all_ids = [task_id] + collect_descendants(task_id)
    db.table("task_deps").delete().in_("task_id", all_ids).execute()
    db.table("task_deps").delete().in_("depends_on_task_id", all_ids).execute()
    db.table("tasks").delete().in_("id", all_ids).eq("user_id", user_id).execute()


@router.post("/{task_id}/deps/{dep_id}", status_code=201)
def add_dep(task_id: int, dep_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    existing = db.table("task_deps").select("id").eq("task_id", task_id).eq("depends_on_task_id", dep_id).execute()
    if not existing.data:
        db.table("task_deps").insert({"task_id": task_id, "depends_on_task_id": dep_id}).execute()
    return {"ok": True}


@router.delete("/{task_id}/deps/{dep_id}", status_code=204)
def remove_dep(task_id: int, dep_id: int, user_id: str = Depends(get_user_id)):
    db = get_db()
    db.table("task_deps").delete().eq("task_id", task_id).eq("depends_on_task_id", dep_id).execute()


@router.get("/suggested")
def get_suggested_task(user_id: str = Depends(get_user_id)):
    from datetime import date as date_type
    db = get_db()

    tasks_res = db.table("tasks").select("*").eq("user_id", user_id).eq("completed", False).execute()
    tasks = tasks_res.data
    if not tasks:
        return {"task": None, "reason": None}

    deps_res = db.table("task_deps").select("task_id, depends_on_task_id").execute()
    blocks_count: dict[int, int] = {}
    for d in deps_res.data:
        dep_id = d["depends_on_task_id"]
        blocks_count[dep_id] = blocks_count.get(dep_id, 0) + 1

    today = date_type.today()
    scored = []

    for t in tasks:
        score = 0
        reasons = []

        if t.get("deadline"):
            deadline = date_type.fromisoformat(t["deadline"])
            days_left = (deadline - today).days
            if days_left < 0:
                score += 100
                reasons.append(f"venció hace {abs(days_left)} día(s)")
            elif days_left == 0:
                score += 90
                reasons.append("vence hoy")
            elif days_left <= 3:
                score += 70 - days_left * 5
                reasons.append(f"vence en {days_left} día(s)")
            elif days_left <= 7:
                score += 30
                reasons.append(f"vence en {days_left} días")

        created = date_type.fromisoformat(str(t["created_at"])[:10])
        age_days = (today - created).days
        if age_days >= 14:
            score += 25
            reasons.append(f"está pendiente desde hace {age_days} días")
        elif age_days >= 7:
            score += 10

        unblocks = blocks_count.get(t["id"], 0)
        if unblocks > 0:
            score += unblocks * 15
            reasons.append(f"desbloquea {unblocks} tarea(s) más")

        if score > 0:
            scored.append((score, t, reasons))

    if not scored:
        return {"task": None, "reason": None}

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_task, best_reasons = scored[0]
    return {"task": best_task, "reason": " · ".join(best_reasons[:2])}
