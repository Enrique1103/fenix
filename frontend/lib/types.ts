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
}

export interface GoalProgress {
  pct: number
  perfect_days: number
  active_days: number
  streak_current: number
  streak_best: number
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
