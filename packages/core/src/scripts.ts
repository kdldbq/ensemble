// biome-ignore-all lint/style/noNonNullAssertion: array accesses are guarded by length checks that Biome cannot statically prove.
/**
 * 10.15 — User-supplied script runtime (Apps-Script-style, MVP).
 *
 * Hosts call `runScript(code, ctx)`. Inside the script, only the symbols
 * declared in `ctx.api` are reachable; the script body is wrapped in a fresh
 * `Function(...)` so it cannot see the surrounding closure scope, but note
 * this is *not* a security sandbox against adversarial code — globals like
 * `setTimeout` and `fetch` remain visible. Use a Worker / VM2 fork in untrusted
 * tenant contexts. ensemble's default story is "internally-trusted scripts".
 */

export interface ScriptContext {
  api: Record<string, (...args: unknown[]) => unknown>
  constants?: Record<string, string | number | boolean | null>
  timeoutMs?: number
}

export interface ScriptResult {
  ok: boolean
  value?: unknown
  error?: string
  durationMs: number
}

export async function runScript(code: string, ctx: ScriptContext): Promise<ScriptResult> {
  const apiKeys = Object.keys(ctx.api)
  const constKeys = Object.keys(ctx.constants ?? {})
  let fn: (...args: unknown[]) => unknown
  try {
    fn = new Function(
      ...apiKeys,
      ...constKeys,
      `'use strict';
return (async () => {
${code}
})();`,
    ) as (...args: unknown[]) => unknown
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `parse error: ${err.message}` : String(err),
      durationMs: 0,
    }
  }
  const apiArgs = apiKeys.map((k) => ctx.api[k]!)
  const constArgs = constKeys.map((k) => ctx.constants?.[k] ?? null)
  const start = Date.now()
  try {
    const promise = Promise.resolve(fn.call(null, ...apiArgs, ...constArgs))
    const value = await withTimeout(promise, ctx.timeoutMs ?? 1000)
    return { ok: true, value, durationMs: Date.now() - start }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const t = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error(`script timed out after ${ms} ms`))
      }
    }, ms)
    p.then(
      (v) => {
        if (!settled) {
          settled = true
          clearTimeout(t)
          resolve(v)
        }
      },
      (err) => {
        if (!settled) {
          settled = true
          clearTimeout(t)
          reject(err)
        }
      },
    )
  })
}
