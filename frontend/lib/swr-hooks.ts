import useSWR from "swr"
import { getTasks, getGoals, getHabits, getMonthAll, getMonthSummary, getMonthMood, getStreak } from "./api"
import type { Task, Goal, Habit } from "./types"

const opts = { revalidateOnFocus: false, dedupingInterval: 5000 }

export function useTasks() {
  return useSWR<Task[]>("tasks", getTasks, opts)
}

export function useGoals() {
  return useSWR<Goal[]>("goals", getGoals, opts)
}

export function useHabits() {
  return useSWR<Habit[]>("habits", getHabits, opts)
}

type RecordMatrix = Record<string, Record<string, string>>

export type HomeData = {
  habits: Habit[]
  matrix: RecordMatrix
  monthPct: number
  prevMonthPct: number
  streakData: { streak_current: number; streak_best: number }
  moodMap: Record<string, number>
}

export function useHomeData(year: number, month: number) {
  return useSWR<HomeData>(["home", year, month], async () => {
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const [h, records, monthRes, prevMonthRes, streakRes, moodData] = await Promise.all([
      getHabits(),
      getMonthAll(year, month),
      getMonthSummary(year, month),
      getMonthSummary(prevY, prevM),
      getStreak(),
      getMonthMood(year, month).catch(() => ({} as Record<string, number>)),
    ])
    const matrix: RecordMatrix = {}
    for (const r of records) {
      if (!matrix[r.date]) matrix[r.date] = {}
      matrix[r.date][r.habit_id] = r.state
    }
    return {
      habits: h,
      matrix,
      monthPct: monthRes.pct,
      prevMonthPct: prevMonthRes.pct,
      streakData: streakRes,
      moodMap: moodData,
    }
  }, opts)
}
