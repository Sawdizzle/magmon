/**
 * Shared helpers for list views: natural-alphanumeric sorting +
 * localStorage-backed preferences (sort/filter persistence).
 */
import { useEffect, useState } from 'react'

/** Natural-alphanumeric compare: "gw-2" < "gw-10". Case-insensitive. */
export function naturalCompare(a: string | null | undefined, b: string | null | undefined): number {
  const av = a ?? ''
  const bv = b ?? ''
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' })
}

/** A useState that mirrors its value into localStorage. */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota / private mode — ignore */
    }
  }, [key, value])
  return [value, setValue]
}

/** Normalize a numeric (sortable) order from a status string. Lower = healthier. */
export function statusOrder(s: string | null | undefined): number {
  switch (s) {
    case 'online': return 0
    case 'warning': return 1
    case 'critical': return 2
    case 'offline': return 3
    case 'never': return 4
    default: return 5
  }
}
