/**
 * @ensemble-sheets/mcp-server — MCP (Model Context Protocol) server stub
 *
 * Exposes ensemble's spreadsheet API as MCP tools so AI agents (Claude, GPT,
 * etc) can read + write workbooks programmatically. This module defines the
 * tool registry; the actual transport (stdio / streamable HTTP) is wired by
 * the host via @modelcontextprotocol/sdk.
 */

import { ApiClient } from '@ensemble-sheets/core'

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface EnsembleMcpServerOpts {
  /** Base URL of the ensemble HTTP API (e.g. http://localhost:5301). */
  apiBaseUrl: string
  /**
   * Static bearer token, OR a function that returns one. The latter is useful
   * when the host wants to refresh tokens out-of-band.
   */
  token: string | (() => string | Promise<string>)
}

export const TOOLS: McpToolDefinition[] = [
  {
    name: 'list_folders',
    description: 'List all folders the caller may see (tenant-scoped).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_workbooks',
    description: 'List all workbooks the caller may see (tenant-scoped).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_folder',
    description: 'Create a new folder.',
    inputSchema: {
      type: 'object',
      required: ['name', 'spaceType'],
      properties: {
        name: { type: 'string' },
        parentId: { type: 'string' },
        spaceType: { type: 'string', enum: ['personal', 'shared'] },
      },
    },
  },
  {
    name: 'read_range',
    description:
      'Read a 2D range of cell values from a workbook. Returns rows × cols of values from the latest snapshot.',
    inputSchema: {
      type: 'object',
      required: ['workbookId', 'sheetId', 'rangeRef'],
      properties: {
        workbookId: { type: 'string' },
        sheetId: { type: 'string' },
        rangeRef: { type: 'string', description: 'A1-style range, e.g. "A1:C10".' },
      },
    },
  },
  {
    name: 'list_activity',
    description: 'List recent collaboration activity (audit log) for a workbook.',
    inputSchema: {
      type: 'object',
      required: ['workbookId'],
      properties: {
        workbookId: { type: 'string' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'list_comments',
    description: 'List comments on a workbook (open by default; include_resolved for all).',
    inputSchema: {
      type: 'object',
      required: ['workbookId'],
      properties: {
        workbookId: { type: 'string' },
        includeResolved: { type: 'boolean' },
        threadId: { type: 'string' },
      },
    },
  },
  {
    name: 'create_comment',
    description: 'Post a comment / reply on a workbook (requires canComment).',
    inputSchema: {
      type: 'object',
      required: ['workbookId', 'threadId', 'body'],
      properties: {
        workbookId: { type: 'string' },
        threadId: { type: 'string' },
        body: { type: 'string' },
        cellRef: { type: 'string', description: 'Optional cell anchor.' },
        parentId: { type: 'string', description: 'Reply to comment id.' },
      },
    },
  },
]

function makeText(value: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function makeError(msg: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
}

export function createEnsembleMcpServer(opts: EnsembleMcpServerOpts) {
  const api = new ApiClient({
    baseUrl: opts.apiBaseUrl,
    token: typeof opts.token === 'string' ? () => opts.token as string : opts.token,
  })

  async function call(req: McpToolCall): Promise<McpToolResult> {
    const args = req.arguments
    try {
      switch (req.name) {
        case 'list_folders':
          return makeText(await api.listFolders())
        case 'create_folder':
          return makeText(
            await api.createFolder({
              name: String(args.name ?? ''),
              parentId: (args.parentId as string | null | undefined) ?? null,
              spaceType: (args.spaceType as 'personal' | 'shared') ?? 'personal',
            }),
          )
        case 'read_range':
          return makeText(
            await api.readRange(String(args.workbookId), {
              sheetId: String(args.sheetId),
              rangeRef: String(args.rangeRef),
            }),
          )
        case 'list_activity':
          return makeText(
            await api.listActivity(String(args.workbookId), {
              limit: (args.limit as number | undefined) ?? 50,
            }),
          )
        case 'list_comments':
          return makeText(
            await api.listComments(String(args.workbookId), {
              ...(args.threadId ? { threadId: String(args.threadId) } : {}),
              includeResolved: Boolean(args.includeResolved),
            }),
          )
        case 'create_comment':
          return makeText(
            await api.createComment(String(args.workbookId), {
              threadId: String(args.threadId),
              body: String(args.body),
              cellRef: (args.cellRef as string | null | undefined) ?? null,
              parentId: (args.parentId as string | null | undefined) ?? null,
            }),
          )
        default:
          return makeError(`unknown tool: ${req.name}`)
      }
    } catch (err) {
      return makeError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
    tools: TOOLS,
    listTools(): { tools: McpToolDefinition[] } {
      return { tools: TOOLS }
    },
    call,
  }
}

export type EnsembleMcpServer = ReturnType<typeof createEnsembleMcpServer>
