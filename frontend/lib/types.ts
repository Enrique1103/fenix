export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  ord: number
  active: boolean
  created_at: string
}

export type HabitState = 'done' | 'rest' | 'failed'

export interface DayRecords {
  [habitId: string]: HabitState
}

export interface MonthSummary {
  [date: string]: number
}

export interface HabitMonthStats {
  [habitId: string]: number
}

export interface Goal {
  id: number
  title: string
  description: string | null
  commitment: string | null
  deadline: string | null
  image_url: string | null
  created_at: string
  habit_ids: string[]
  goal_type: "action" | "mindset"
  horizon: "short" | "long"
  completed_at: string | null
}

export type GoalProgress =
  | { goal_type: "action"; pct: number; perfect_days: number; active_days: number; streak_current: number; streak_best: number }
  | { goal_type: "mindset"; streak_current: number; streak_best: number }

export interface GoalsGraph {
  goals: Goal[]
  deps: { goal_id: number; depends_on_goal_id: number }[]
}

export interface Reminder {
  id: number
  label: string
  time: string      // "HH:MM"
  days: number[]    // 0=Sun … 6=Sat
  active: boolean
  created_at: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  type: "daily" | "weekly" | "monthly"
  deadline: string | null
  completed: boolean
  created_at: string
  parent_task_id: number | null
  dep_ids: number[]
}

// ── Rutina ────────────────────────────────────────────────────────────────────

export interface RoutineTemplate {
  id: number
  name: string
  color: string
  created_at: string
}

export interface RoutineBlock {
  id: number
  template_id: number
  title: string
  start_time: string
  end_time: string
  category: string
  category_label: string
  category_color: string
  habit_id: string | null
  task_id: number | null
  notes: string | null
  ord: number
  completed?: boolean
  effective_task_id?: number | null
  task?: { id: number; title: string; completed: boolean } | null
}

export interface RoutineDayBlock {
  id: number
  date: string
  title: string
  start_time: string
  end_time: string
  category: string
  category_label: string
  category_color: string
  habit_id: string | null
  task_id: number | null
  notes: string | null
  completed: boolean
}

export interface RoutineCategory {
  id: number
  label: string
  color: string
}

export interface RoutineDayView {
  template: RoutineTemplate | null
  template_blocks: (RoutineBlock & { completed: boolean })[]
  day_blocks: RoutineDayBlock[]
  habits: { id: string; name: string; state: string | null }[]
}
