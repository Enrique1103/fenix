import { Habit, DayRecords, MonthSummary, HabitMonthStats, Task, Goal, GoalProgress, Reminder, RoutineTemplate, RoutineBlock, RoutineDayBlock, RoutineCategory, RoutineDayView } from "./types"
import { supabase } from "./supabase"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) return session.access_token
  const { data } = await supabase.auth.refreshSession()
  return data.session?.access_token ?? null
}

async function req<T>(path: string, options?: RequestInit, retry = true): Promise<T> {
  const token = await getToken()

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })

  if (res.status === 401 && retry) {
    await supabase.auth.refreshSession()
    return req<T>(path, options, false)
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Habits ────────────────────────────────────────────────────────────────────

export const getHabits = (): Promise<Habit[]> =>
  req("/habits")

export const createHabit = (name: string): Promise<Habit> =>
  req("/habits", { method: "POST", body: JSON.stringify({ name }) })

export const updateHabit = (id: string, data: { name?: string; active?: boolean }): Promise<Habit> =>
  req(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteHabit = (id: string): Promise<void> =>
  req(`/habits/${id}`, { method: "DELETE" })

export const reorderHabits = (orderedIds: string[]): Promise<void> =>
  req("/habits/reorder", { method: "PUT", body: JSON.stringify(orderedIds) })

// ── Records ───────────────────────────────────────────────────────────────────

export const getDayRecords = (date: string): Promise<DayRecords> =>
  req(`/records/day/${date}`)

export const getMonthSummary = (year: number, month: number): Promise<{
  summary: MonthSummary; pct: number; habit_count: number
}> => req(`/records/month/${year}/${month}`)

export const getMonthByHabit = (year: number, month: number): Promise<HabitMonthStats> =>
  req(`/records/month/${year}/${month}/habits`)

export const getWeeklyTrend = (): Promise<{ week_start: string; label: string; pct: number }[]> =>
  req(`/records/weekly-trend`)

export const getMonthlyTrend = (): Promise<{ label: string; pct: number }[]> =>
  req(`/records/monthly-trend`)

export const getWeekdayAvg = (months = 3): Promise<Record<string, number>> =>
  req(`/records/weekday-avg?months=${months}`)

export const getMonthAll = (year: number, month: number): Promise<{ date: string; habit_id: number; state: string }[]> =>
  req(`/records/month-all/${year}/${month}`)

export const getStreak = (): Promise<{ streak_current: number; streak_best: number }> =>
  req("/records/streak")

export const getDayScore = (date: string): Promise<{
  habit_count: number; done: number; rest: number; failed: number;
  is_perfect: boolean; is_rest_day: boolean;
}> => req(`/records/day-score/${date}`)

export const setRecord = (date: string, habitId: string, state: string | null): Promise<{ state: string | null }> =>
  req("/records/set", {
    method: "POST",
    body: JSON.stringify({ date, habit_id: habitId, state }),
  })

export const resetMonth = (year: number, month: number): Promise<void> =>
  req(`/records/month/${year}/${month}`, { method: "DELETE" })

export const resetAll = (): Promise<void> =>
  req("/records/all", { method: "DELETE" })

// ── Goals ─────────────────────────────────────────────────────────────────────

export const getGoals = (): Promise<Goal[]> =>
  req("/goals")

export const createGoal = (data: Omit<Goal, "id" | "created_at" | "habit_ids">): Promise<Goal> =>
  req("/goals", { method: "POST", body: JSON.stringify(data) })

export const updateGoal = (id: number, data: Partial<Omit<Goal, "id" | "created_at" | "habit_ids">>): Promise<Goal> =>
  req(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteGoal = (id: number): Promise<void> =>
  req(`/goals/${id}`, { method: "DELETE" })

export const attachHabit = (goalId: number, habitId: string): Promise<void> =>
  req(`/goals/${goalId}/habits/${habitId}`, { method: "POST" })

export const detachHabit = (goalId: number, habitId: string): Promise<void> =>
  req(`/goals/${goalId}/habits/${habitId}`, { method: "DELETE" })

export const getGoalProgress = (goalId: number): Promise<GoalProgress> =>
  req(`/goals/${goalId}/progress`)

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const getTasks = (type?: string): Promise<Task[]> =>
  req(`/tasks${type ? `?type=${type}` : ""}`)

export const createTask = (data: {
  title: string; type: string; deadline?: string;
  parent_task_id?: number; description?: string
}): Promise<Task> =>
  req("/tasks", { method: "POST", body: JSON.stringify(data) })

export const updateTask = (id: number, data: {
  title?: string; completed?: boolean; deadline?: string | null;
  description?: string | null
}): Promise<Task> =>
  req(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteTask = (id: number): Promise<void> =>
  req(`/tasks/${id}`, { method: "DELETE" })

export const addTaskDep = (taskId: number, depId: number): Promise<void> =>
  req(`/tasks/${taskId}/deps/${depId}`, { method: "POST" })

export const removeTaskDep = (taskId: number, depId: number): Promise<void> =>
  req(`/tasks/${taskId}/deps/${depId}`, { method: "DELETE" })

// ── Mood ──────────────────────────────────────────────────────────────────────

export const getMonthMood = (year: number, month: number): Promise<Record<string, number>> =>
  req(`/mood/${year}/${month}`)

export const getMoodAvg = (year: number, month: number): Promise<{ avg: number | null }> =>
  req(`/mood/${year}/${month}/avg`)

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface MonthStats {
  fulfillment_pct: number
  fulfillment_done: number
  fulfillment_rest: number
  fulfillment_failed: number
  fulfillment_possible: number
  perfect_days: number
  partial_days: number
  empty_days: number
  habit_consistency: { id: string; name: string; pct: number }[]
  habit_count: number
}

export interface RecoveryStats {
  avg: number
  best: number
  worst: number
  last_fall: string | null
  last_recovery_days: number | null
  episodes: number
}

export const getMonthStats = (year: number, month: number): Promise<MonthStats> =>
  req(`/records/month-stats/${year}/${month}`)

export const getRecovery = (): Promise<RecoveryStats> =>
  req("/records/recovery")

export const setMood = (date: string, level: number): Promise<{ level: number }> =>
  req("/mood/set", { method: "POST", body: JSON.stringify({ date, level }) })

// ── Achievements ──────────────────────────────────────────────────────────────

export interface AchievementRecord {
  id: number
  type: string
  date: string
  meta: Record<string, unknown> | null
  created_at: string
}

export const getAchievements = (): Promise<AchievementRecord[]> =>
  req("/achievements")

export const upsertAchievement = (data: { type: string; date: string; meta?: Record<string, unknown> }): Promise<{ ok: boolean }> =>
  req("/achievements", { method: "POST", body: JSON.stringify(data) })

// ── Rutina ────────────────────────────────────────────────────────────────────

export const getTemplates = (): Promise<RoutineTemplate[]> =>
  req("/routine/templates")

export const createTemplate = (data: { name: string; color?: string }): Promise<RoutineTemplate> =>
  req("/routine/templates", { method: "POST", body: JSON.stringify(data) })

export const updateTemplate = (id: number, data: { name?: string; color?: string }): Promise<RoutineTemplate> =>
  req(`/routine/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteTemplate = (id: number): Promise<void> =>
  req(`/routine/templates/${id}`, { method: "DELETE" })

export const getTemplateBlocks = (tid: number): Promise<RoutineBlock[]> =>
  req(`/routine/templates/${tid}/blocks`)

export const createBlock = (data: Omit<RoutineBlock, "id" | "completed">): Promise<RoutineBlock> =>
  req("/routine/blocks", { method: "POST", body: JSON.stringify(data) })

export const updateBlock = (id: number, data: Partial<Omit<RoutineBlock, "id" | "template_id">>): Promise<RoutineBlock> =>
  req(`/routine/blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteBlock = (id: number): Promise<void> =>
  req(`/routine/blocks/${id}`, { method: "DELETE" })

export const reorderBlocks = (tid: number, orderedIds: number[]): Promise<void> =>
  req(`/routine/templates/${tid}/blocks/reorder`, { method: "PUT", body: JSON.stringify(orderedIds) })

export const getCategories = (): Promise<RoutineCategory[]> =>
  req("/routine/categories")

export const createCategory = (data: { label: string; color: string }): Promise<RoutineCategory> =>
  req("/routine/categories", { method: "POST", body: JSON.stringify(data) })

export const deleteCategory = (id: number): Promise<void> =>
  req(`/routine/categories/${id}`, { method: "DELETE" })

export const getDayView = (date: string): Promise<RoutineDayView> =>
  req(`/routine/day/${date}`)

export const setDayOverride = (date: string, templateId: number | null): Promise<void> =>
  req("/routine/day/override", { method: "POST", body: JSON.stringify({ date, template_id: templateId }) })

export const createDayBlock = (data: Omit<RoutineDayBlock, "id" | "completed">): Promise<RoutineDayBlock> =>
  req("/routine/day/blocks", { method: "POST", body: JSON.stringify(data) })

export const updateDayBlock = (id: number, data: Partial<RoutineDayBlock>): Promise<RoutineDayBlock> =>
  req(`/routine/day/blocks/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteDayBlock = (id: number): Promise<void> =>
  req(`/routine/day/blocks/${id}`, { method: "DELETE" })

export const completeBlock = (blockId: number, date: string, completed: boolean): Promise<{ ok: boolean }> =>
  req("/routine/complete", { method: "POST", body: JSON.stringify({ block_id: blockId, date, completed }) })

// ── Reminders ─────────────────────────────────────────────────────────────────

export const getReminders = (): Promise<Reminder[]> =>
  req("/reminders")

export const createReminder = (data: Omit<Reminder, "id" | "created_at">): Promise<Reminder> =>
  req("/reminders", { method: "POST", body: JSON.stringify(data) })

export const updateReminder = (id: number, data: Partial<Omit<Reminder, "id" | "created_at">>): Promise<Reminder> =>
  req(`/reminders/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteReminder = (id: number): Promise<void> =>
  req(`/reminders/${id}`, { method: "DELETE" })
