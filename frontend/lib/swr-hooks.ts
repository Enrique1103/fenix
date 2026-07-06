import useSWR from "swr"
import {
  getGoals, getHabits,
  getMonthAll, getMonthSummary, getMonthMood, getStreak,
  getMonthStats, getRecovery, getMoodAvg,
  getDayView, getTemplates, getCategories,
  type MonthStats, type RecoveryStats,
} from "./api"
import type { Goal, Habit, RoutineDayView, RoutineTemplate, RoutineCategory } from "./types"

const opts = { revalidateOnFocus: false, dedupingInterval: 5000 }

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

export type StatsData = {
  stats: MonthStats
  prevStats: MonthStats
  streak: { streak_current: number; streak_best: number }
  recovery: RecoveryStats
  moodAvg: number | null
}

export function useStatsData(year: number, month: number) {
  return useSWR<StatsData>(["stats", year, month], async () => {
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const [s, p, mood, streakRes, recoveryRes] = await Promise.all([
      getMonthStats(year, month),
      getMonthStats(prevY, prevM),
      getMoodAvg(year, month),
      getStreak(),
      getRecovery(),
    ])
    return { stats: s, prevStats: p, streak: streakRes, recovery: recoveryRes, moodAvg: mood.avg }
  }, opts)
}

export function useDayView(dateStr: string) {
  return useSWR<RoutineDayView>(["dayView", dateStr], () => getDayView(dateStr), opts)
}

export function useTemplates() {
  return useSWR<RoutineTemplate[]>("templates", getTemplates, opts)
}

export function useCategories() {
  return useSWR<RoutineCategory[]>("categories", getCategories, opts)
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
