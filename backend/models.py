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
    type: str
    deadline: Optional[str] = None
    parent_task_id: Optional[int] = None
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    deadline: Optional[str] = None
    description: Optional[str] = None
