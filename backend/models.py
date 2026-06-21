from pydantic import BaseModel
from typing import Optional


class HabitCreate(BaseModel):
    name: str


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    ord: Optional[int] = None


class RecordSet(BaseModel):
    date: str
    habit_id: str
    state: Optional[str] = None  # 'done' | 'rest' | 'failed' | None = borrar


class TaskCreate(BaseModel):
    title: str
    type: str = "general"
    deadline: Optional[str] = None
    parent_task_id: Optional[int] = None
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    deadline: Optional[str] = None
    description: Optional[str] = None


# ── Metas ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    commitment: Optional[str] = None
    deadline: Optional[str] = None
    image_url: Optional[str] = None
    goal_type: str = "action"   # 'action' | 'mindset'
    horizon: str = "long"        # 'short' | 'long'

class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    commitment: Optional[str] = None
    deadline: Optional[str] = None
    image_url: Optional[str] = None
    goal_type: Optional[str] = None
    horizon: Optional[str] = None
    completed_at: Optional[str] = None

class GoalDepCreate(BaseModel):
    depends_on_goal_id: int


# ── Rutina ────────────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    color: Optional[str] = "#22c55e"

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class BlockCreate(BaseModel):
    template_id: int
    title: str
    start_time: str
    end_time: str
    category: str
    category_label: str
    category_color: str = "#6366f1"
    habit_id: Optional[str] = None
    task_id: Optional[int] = None
    notes: Optional[str] = None
    ord: int = 0

class BlockUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[str] = None
    category_label: Optional[str] = None
    category_color: Optional[str] = None
    habit_id: Optional[str] = None
    task_id: Optional[int] = None
    notes: Optional[str] = None
    ord: Optional[int] = None

class CategoryCreate(BaseModel):
    label: str
    color: str

class DayBlockCreate(BaseModel):
    date: str
    title: str
    start_time: str
    end_time: str
    category: str
    category_label: str
    category_color: str = "#6366f1"
    habit_id: Optional[str] = None
    task_id: Optional[int] = None
    notes: Optional[str] = None

class DayBlockUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[str] = None
    category_label: Optional[str] = None
    category_color: Optional[str] = None
    habit_id: Optional[str] = None
    task_id: Optional[int] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None

class BlockCompletion(BaseModel):
    block_id: int
    date: str
    completed: bool

class DayOverride(BaseModel):
    date: str
    template_id: Optional[int] = None

class BlockDayTaskSet(BaseModel):
    block_id: int
    date: str
    task_id: Optional[int] = None
