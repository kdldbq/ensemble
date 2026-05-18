import { Hono } from 'hono'
import type { AppEnv } from '../app'

const SERVER_VERSION = process.env.npm_package_version ?? '0.0.0'

const openApiDoc = {
  openapi: '3.1.0',
  info: {
    title: 'ensemble HTTP API',
    version: SERVER_VERSION,
    description:
      'REST surface for the ensemble collaborative spreadsheet server. All endpoints require a Bearer token resolved by the host IdentityAdapter (except /healthz and /openapi.json).',
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
    schemas: {
      Folder: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          parentId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string', minLength: 1, maxLength: 128 },
          ownerId: { type: 'string' },
          spaceType: { type: 'string', enum: ['personal', 'shared'] },
          position: { type: 'integer', minimum: 0 },
          isDeleted: { type: 'boolean' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'tenantId', 'name', 'ownerId', 'spaceType', 'position', 'isDeleted'],
      },
      Workbook: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          folderId: { type: 'string', format: 'uuid', nullable: true },
          name: { type: 'string' },
          ownerId: { type: 'string' },
          currentSnapshotId: { type: 'string', format: 'uuid', nullable: true },
          isDeleted: { type: 'boolean' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true },
          position: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Grant: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          resourceType: { type: 'string', enum: ['folder', 'workbook'] },
          resourceId: { type: 'string', format: 'uuid' },
          granteeType: { type: 'string', enum: ['user', 'tenant_member', 'public_link'] },
          granteeId: { type: 'string', nullable: true },
          permission: { type: 'string', enum: ['view', 'edit', 'manage'] },
          expiresAt: { type: 'string', format: 'date-time', nullable: true },
          hasPassword: { type: 'boolean' },
          linkToken: {
            type: 'string',
            readOnly: true,
            description:
              'Cleartext public_link token. Server-generated, returned exactly ONCE in the POST /api/v1/grants response when granteeType=public_link. Never returned from GET. Persist client-side immediately — the server stores only its HMAC.',
          },
        },
      },
      Version: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workbookId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          createdBy: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ActivityEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          eventType: { type: 'string' },
          actorId: { type: 'string' },
          resourceId: { type: 'string', nullable: true },
          payload: { type: 'object', additionalProperties: true },
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
      Protection: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workbookId: { type: 'string', format: 'uuid' },
          sheetId: { type: 'string' },
          rangeRef: { type: 'string' },
          description: { type: 'string', nullable: true },
          allowedUserIds: { type: 'array', items: { type: 'string' }, nullable: true },
          allowedRoles: { type: 'array', items: { type: 'string' }, nullable: true },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workbookId: { type: 'string', format: 'uuid' },
          threadId: { type: 'string' },
          cellRef: { type: 'string', nullable: true },
          parentId: { type: 'string', nullable: true },
          authorId: { type: 'string' },
          body: { type: 'string', maxLength: 4000 },
          mentions: { type: 'array', items: { type: 'string' } },
          resolved: { type: 'boolean' },
          resolvedBy: { type: 'string', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Health: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          version: { type: 'string' },
          uptimeSec: { type: 'integer' },
          checks: {
            type: 'object',
            properties: {
              db: { type: 'string', enum: ['ok', 'fail', 'skip'] },
              redis: { type: 'string', enum: ['ok', 'fail', 'skip'] },
            },
          },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/healthz': {
      get: {
        summary: 'Liveness + subsystem health',
        security: [],
        responses: {
          200: {
            description: 'all subsystems ok',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Health' } },
            },
          },
          503: { description: 'a subsystem is failing' },
        },
      },
    },
    '/api/v1/folders': {
      get: {
        summary: 'List folders',
        parameters: [{ name: 'include_deleted', in: 'query', schema: { type: 'boolean' } }],
        responses: {
          200: {
            description: 'array of folders',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/Folder' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create folder',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'spaceType'],
                properties: {
                  name: { type: 'string' },
                  parentId: { type: 'string', nullable: true },
                  spaceType: { type: 'string', enum: ['personal', 'shared'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'created' }, 422: { description: 'validation' } },
      },
    },
    '/api/v1/folders/{id}': {
      patch: {
        summary: 'Rename or move folder',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'updated' }, 404: { description: 'not found' } },
      },
      delete: {
        summary: 'Soft-delete folder',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'deleted' } },
      },
    },
    '/api/v1/folders/{id}/reorder': {
      patch: {
        summary: 'Reorder folder (drag-and-drop)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'reordered' } },
      },
    },
    '/api/v1/folders/{id}/restore': {
      post: {
        summary: 'Restore a soft-deleted folder',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'restored' } },
      },
    },
    '/api/v1/folders/trash': {
      get: { summary: 'List trashed folders', responses: { 200: { description: 'list' } } },
    },
    '/api/v1/workbooks/{id}/comments': {
      get: { summary: 'List comments', responses: { 200: { description: 'list' } } },
      post: { summary: 'Create comment / reply', responses: { 201: { description: 'created' } } },
    },
    '/api/v1/workbooks/{id}/protections': {
      get: { summary: 'List range protections', responses: { 200: { description: 'list' } } },
      post: {
        summary: 'Create range protection',
        responses: { 201: { description: 'created' } },
      },
    },
    '/api/v1/workbooks/{id}/activity': {
      get: {
        summary: 'Per-workbook activity timeline',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { 200: { description: 'list' } },
      },
    },
    '/api/v1/workbooks/{id}/range/read': {
      post: {
        summary: 'Read a 2D range from the latest snapshot',
        responses: {
          200: {
            description: 'values',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    values: { type: 'array', items: { type: 'array' } },
                    rows: { type: 'integer' },
                    cols: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/grants': {
      get: {
        summary: 'List grants for workbook/folder',
        parameters: [
          { name: 'workbookId', in: 'query', schema: { type: 'string' } },
          { name: 'folderId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'list' } },
      },
      post: { summary: 'Grant access', responses: { 201: { description: 'created' } } },
    },
    '/api/v1/grants/{id}/verify': {
      post: {
        summary: 'Verify link password',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'ok' }, 401: { description: 'wrong password' } },
      },
    },
    '/api/v1/ai/formula': {
      post: {
        summary: 'AI: natural language → spreadsheet formula',
        responses: {
          200: { description: 'formula returned' },
          501: { description: 'LLM not configured' },
        },
      },
    },
    '/api/v1/ai/detect-columns': {
      post: {
        summary: 'AI: detect column headers + delimiter from pasted text',
        responses: {
          200: { description: 'columns detected' },
          501: { description: 'LLM not configured' },
        },
      },
    },
  },
} as const

export const openApiRoute = new Hono<AppEnv>()
  .get('/api/v1/openapi.json', (c) => c.json(openApiDoc))
  .get('/api/v1/docs', (c) => {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ensemble API docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/openapi.json',
        dom_id: '#ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      })
    }
  </script>
</body>
</html>`
    return c.html(html)
  })
