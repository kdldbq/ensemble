import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  retry: () => void
  /** Optimistically replace data without refetching (useful after a mutation). */
  setData: (next: T | ((prev: T | null) => T)) => void
}

/**
 * Tracks loading / data / error tristate for a one-shot or refreshable async fetch.
 *
 * - Deduplicates concurrent calls: if `retry()` is invoked while a fetch is in flight,
 *   the previous result is discarded.
 * - Always sets `loading: true` immediately so callers can show a skeleton.
 * - Cleans up on unmount to avoid state-on-unmounted warnings.
 */
export function useAsyncState<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): AsyncState<T> {
  const [data, setDataRaw] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const myVersion = ++versionRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetcherRef.current()
      if (mountedRef.current && versionRef.current === myVersion) {
        setDataRaw(result)
      }
    } catch (e) {
      if (mountedRef.current && versionRef.current === myVersion) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (mountedRef.current && versionRef.current === myVersion) {
        setLoading(false)
      }
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: caller controls deps
  useEffect(() => {
    void run()
  }, deps)

  const setData = useCallback((next: T | ((prev: T | null) => T)) => {
    setDataRaw((prev) => (typeof next === 'function' ? (next as (p: T | null) => T)(prev) : next))
  }, [])

  return { data, loading, error, retry: () => void run(), setData }
}
