import { useEffect, useState } from 'react'
import type { Persona } from '../persona'

export interface Visitor {
  userId: string
  persona: Persona
  sandboxWbId: string
  publicRoomWbId: string
}

export type VisitorState =
  | { status: 'loading' }
  | { status: 'ready'; visitor: Visitor }
  | { status: 'error'; message: string }

/**
 * Loads the visitor identity by POSTing /api/demo/whoami. The server reads / sets the
 * `ev_visitor` cookie, so re-mounts retrieve the same identity (until reset).
 *
 * Honors `?u=<userId>` in the URL — used by the "open another user" link to spawn
 * additional personas in extra tabs without overwriting the cookie identity.
 */
export function useVisitor(): VisitorState {
  const [state, setState] = useState<VisitorState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(location.search)
    const override = params.get('u')
    const url = override ? `/api/demo/whoami?u=${encodeURIComponent(override)}` : '/api/demo/whoami'
    fetch(url, { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`whoami ${r.status}`)
        return (await r.json()) as Visitor
      })
      .then((visitor) => {
        if (!cancelled) setState({ status: 'ready', visitor })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** Builds the URL for opening this demo as a different persona in a new tab. */
export function openAnotherUserUrl(persona?: Persona): string {
  const id = persona
    ? `${persona}-${Math.random().toString(36).slice(2, 8)}`
    : `visitor-${crypto.randomUUID()}`
  return `${location.pathname}?u=${encodeURIComponent(id)}`
}
