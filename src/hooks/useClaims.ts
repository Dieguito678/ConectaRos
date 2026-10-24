import { useEffect, useState } from 'react'
import { fetchClaims } from '../lib/claims'
import type { Claim } from '../types/claim'

export function useClaims() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setClaims([])
    fetchClaims(controller.signal)
      .then(rows => { if (!controller.signal.aborted) setClaims(rows) })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los reclamos desde Supabase.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  return { claims, loading, error, retry: () => setAttempt(value => value + 1) }
}
