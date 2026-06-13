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
