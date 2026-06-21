import useSWR from "swr"
import { getTasks, getGoals, getHabits } from "./api"
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
