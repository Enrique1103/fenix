import { format, getDaysInMonth, startOfMonth, getDay } from "date-fns"

export const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
]

export const DAYS_SHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]

export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

export function daysInMonth(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month - 1, 1))
}

// Returns 0=Mon ... 6=Sun offset for the first day of the month
export function firstWeekdayOffset(year: number, month: number): number {
  const d = startOfMonth(new Date(year, month - 1, 1))
  const day = getDay(d) // 0=Sun...6=Sat
  return day === 0 ? 6 : day - 1
}
