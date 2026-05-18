// biome-ignore-all lint/style/noNonNullAssertion: c.get(...) values are narrowed by the requireIdentity / requireCapability middleware that runs before every handler in this file; Biome cannot see the cross-middleware invariant.
import { Hono } from 'hono'
import { logger } from '../../logger'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'

const FORMULA_SYSTEM_PROMPT = `You are an expert at spreadsheet formulas. The user is writing a formula in a cell. They describe what they want in natural language; you respond with ONLY the formula (starting with '='), no commentary, no markdown fences.

If you cannot infer a reasonable formula, respond with: =""

Examples:
User: 求 A1 到 A100 的和
Assistant: =SUM(A1:A100)

User: B 列大于 100 的个数
Assistant: =COUNTIF(B:B,">100")

User: 把 C2 和 D2 拼起来加个连字符
Assistant: =C2&"-"&D2`

const DETECT_COLUMNS_SYSTEM_PROMPT = `The user pastes raw text into a spreadsheet that contains multiple values per line. You return a JSON array of suggested column headers AND a delimiter regex pattern.

Respond ONLY with a JSON object:
{ "headers": ["Name", "Email", "Age"], "delimiterPattern": "[,\\t]" }

Use only standard ASCII regex. If you cannot infer reliably, respond { "headers": [], "delimiterPattern": "" }`

const BI_SYSTEM_PROMPT = `You are a data analyst answering questions about a spreadsheet range.

The user provides:
  - A natural-language question
  - A range of cell values (CSV-formatted with header row)

You respond with ONLY a JSON object:
{
  "answer": "<one-paragraph plain-language answer>",
  "formula": "<optional spreadsheet formula computing the answer, starting with '='>",
  "chart": { "type": "bar|line|pie|none", "xColumn": "<header>", "yColumn": "<header>" }
}

If you can't answer from the data, set answer to "data insufficient" and formula to "".`

const CHART_SUGGEST_SYSTEM_PROMPT = `You are a chart-recommendation expert. The user provides a range of cell values; you suggest the best visualization.

Respond ONLY with a JSON object:
{
  "type": "bar|line|pie|scatter|area|column",
  "xColumn": "<header used for x-axis>",
  "yColumns": ["<header>", ...],
  "title": "<short descriptive title>",
  "rationale": "<one-sentence reason>"
}

Prefer line for time-series, bar for categorical comparisons, pie only for shares of a whole.`

export const aiRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/ai/formula', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { prompt?: string; context?: string }
    if (!body.prompt) return c.json({ error: 'prompt required' }, 400)
    const llm = c.get('deps').llm
    if (!llm) return c.json({ error: 'LLM not configured on this server' }, 501)
    try {
      const result = await llm.generate({
        tenantId: id.tenantId,
        userId: id.userId,
        temperature: 0.2,
        maxTokens: 200,
        messages: [
          { role: 'system', content: FORMULA_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              body.context !== undefined
                ? `Context (surrounding cells):\n${body.context}\n\nRequest: ${body.prompt}`
                : body.prompt,
          },
        ],
      })
      const formula = result.text.trim().split('\n')[0]?.trim() ?? ''
      if (!formula.startsWith('=')) {
        logger.warn({ formula }, 'ai/formula: LLM returned non-formula text')
        return c.json({ formula: '', warning: 'LLM did not return a formula' })
      }
      return c.json({ formula, model: result.model, tokens: result.tokens })
    } catch (err) {
      logger.error({ err }, 'ai/formula failed')
      return c.json({ error: err instanceof Error ? err.message : 'LLM call failed' }, 500)
    }
  })
  .post('/api/v1/ai/formula/stream', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { prompt?: string; context?: string }
    if (!body.prompt) return c.json({ error: 'prompt required' }, 400)
    const llm = c.get('deps').llm
    if (!llm) return c.json({ error: 'LLM not configured on this server' }, 501)
    const opts = {
      tenantId: id.tenantId,
      userId: id.userId,
      temperature: 0.2,
      maxTokens: 200,
      messages: [
        { role: 'system' as const, content: FORMULA_SYSTEM_PROMPT },
        {
          role: 'user' as const,
          content:
            body.context !== undefined
              ? `Context:\n${body.context}\n\nRequest: ${body.prompt}`
              : body.prompt,
        },
      ],
    }
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (llm.streamGenerate) {
            for await (const chunk of llm.streamGenerate(opts)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
            }
          } else {
            const r = await llm.generate(opts)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: r.text })}\n\n`))
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (err) {
          logger.error({ err }, 'ai/formula/stream failed')
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'stream failed' })}\n\n`,
            ),
          )
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    })
  })
  .post('/api/v1/ai/bi', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { question?: string; csv?: string }
    if (!body.question || !body.csv) {
      return c.json({ error: 'question and csv required' }, 400)
    }
    const llm = c.get('deps').llm
    if (!llm) return c.json({ error: 'LLM not configured on this server' }, 501)
    try {
      const result = await llm.generate({
        tenantId: id.tenantId,
        userId: id.userId,
        temperature: 0.1,
        maxTokens: 600,
        messages: [
          { role: 'system', content: BI_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Question: ${body.question}\n\nData (CSV):\n${body.csv.slice(0, 8000)}`,
          },
        ],
      })
      try {
        const parsed = JSON.parse(result.text) as {
          answer?: string
          formula?: string
          chart?: { type: string; xColumn?: string; yColumn?: string }
        }
        return c.json({
          answer: parsed.answer ?? 'data insufficient',
          formula: parsed.formula ?? '',
          chart: parsed.chart ?? { type: 'none' },
          model: result.model,
          tokens: result.tokens,
        })
      } catch {
        logger.warn({ raw: result.text }, 'ai/bi: LLM returned non-JSON')
        return c.json({
          answer: result.text.slice(0, 500),
          formula: '',
          chart: { type: 'none' },
          warning: 'LLM returned unstructured text',
        })
      }
    } catch (err) {
      logger.error({ err }, 'ai/bi failed')
      return c.json({ error: err instanceof Error ? err.message : 'LLM call failed' }, 500)
    }
  })
  .post('/api/v1/ai/chart-suggest', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { csv?: string }
    if (!body.csv) return c.json({ error: 'csv required' }, 400)
    const llm = c.get('deps').llm
    if (!llm) return c.json({ error: 'LLM not configured on this server' }, 501)
    try {
      const result = await llm.generate({
        tenantId: id.tenantId,
        userId: id.userId,
        temperature: 0,
        maxTokens: 400,
        messages: [
          { role: 'system', content: CHART_SUGGEST_SYSTEM_PROMPT },
          { role: 'user', content: body.csv.slice(0, 6000) },
        ],
      })
      try {
        const parsed = JSON.parse(result.text) as {
          type?: string
          xColumn?: string
          yColumns?: string[]
          title?: string
          rationale?: string
        }
        return c.json({
          type: parsed.type ?? 'bar',
          xColumn: parsed.xColumn ?? '',
          yColumns: parsed.yColumns ?? [],
          title: parsed.title ?? '',
          rationale: parsed.rationale ?? '',
          model: result.model,
          tokens: result.tokens,
        })
      } catch {
        logger.warn({ raw: result.text }, 'ai/chart-suggest: LLM returned non-JSON')
        return c.json({
          type: 'bar',
          xColumn: '',
          yColumns: [],
          title: '',
          rationale: '',
          warning: 'LLM returned unstructured text',
        })
      }
    } catch (err) {
      logger.error({ err }, 'ai/chart-suggest failed')
      return c.json({ error: err instanceof Error ? err.message : 'LLM call failed' }, 500)
    }
  })
  .post('/api/v1/ai/detect-columns', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as { text?: string }
    if (!body.text) return c.json({ error: 'text required' }, 400)
    const llm = c.get('deps').llm
    if (!llm) return c.json({ error: 'LLM not configured on this server' }, 501)
    try {
      const result = await llm.generate({
        tenantId: id.tenantId,
        userId: id.userId,
        temperature: 0,
        maxTokens: 400,
        messages: [
          { role: 'system', content: DETECT_COLUMNS_SYSTEM_PROMPT },
          { role: 'user', content: body.text.slice(0, 4000) },
        ],
      })
      try {
        const parsed = JSON.parse(result.text) as {
          headers?: string[]
          delimiterPattern?: string
        }
        return c.json({
          headers: parsed.headers ?? [],
          delimiterPattern: parsed.delimiterPattern ?? '',
          model: result.model,
          tokens: result.tokens,
        })
      } catch {
        logger.warn({ raw: result.text }, 'ai/detect-columns: LLM returned non-JSON')
        return c.json({ headers: [], delimiterPattern: '', warning: 'LLM returned non-JSON' })
      }
    } catch (err) {
      logger.error({ err }, 'ai/detect-columns failed')
      return c.json({ error: err instanceof Error ? err.message : 'LLM call failed' }, 500)
    }
  })
