import { Hono } from 'hono'
import type { AppEnv } from '../app'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'

export const commentsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:id/comments',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      const includeResolved = c.req.query('include_resolved') === 'true'
      const threadId = c.req.query('threadId')
      if (threadId) {
        const items = await c.get('services').comments.listForThread(id.tenantId, wbId, threadId)
        return c.json({ items })
      }
      const items = await c
        .get('services')
        .comments.listForWorkbook(id.tenantId, wbId, { includeResolved })
      return c.json({ items })
    },
  )
  .post(
    '/api/v1/workbooks/:id/comments',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('id')
      // Comment write requires canComment (defaults to canEdit when undefined).
      const caps = c.get('capabilities')!
      const allowed = caps.canComment ?? caps.canEdit
      if (!allowed) {
        return c.json({ error: 'comment capability required' }, 403)
      }
      const body = (await c.req.json()) as {
        threadId?: string
        cellRef?: string | null
        parentId?: string | null
        body?: string
      }
      if (!body.threadId || !body.body) {
        return c.json({ error: 'threadId and body required' }, 400)
      }
      try {
        const comment = await c.get('services').comments.create({
          tenantId: id.tenantId,
          workbookId: wbId,
          threadId: body.threadId,
          cellRef: body.cellRef ?? null,
          parentId: body.parentId ?? null,
          authorId: id.userId,
          body: body.body,
        })
        void c.get('services').events.emit({
          tenantId: id.tenantId,
          actorId: id.userId,
          type: 'comment.created',
          resourceId: comment.id,
          extra: { workbookId: wbId, threadId: comment.threadId },
        })
        if (comment.mentions.length > 0) {
          void c.get('services').events.emit({
            tenantId: id.tenantId,
            actorId: id.userId,
            type: 'comment.mentioned',
            resourceId: comment.id,
            extra: { workbookId: wbId, mentioned: comment.mentions },
          })
        }
        return c.json(comment, 201)
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'create failed' }, 422)
      }
    },
  )
  .patch(
    '/api/v1/workbooks/:wbId/comments/:id',
    requireCapability('canView', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('wbId')
      const commentId = c.req.param('id')
      const body = (await c.req.json()) as { body?: string; resolved?: boolean }
      if (body.body === undefined && body.resolved === undefined) {
        return c.json({ error: 'nothing to update' }, 400)
      }
      const updated = await c.get('services').comments.update({
        tenantId: id.tenantId,
        id: commentId,
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.resolved !== undefined
          ? { resolved: body.resolved, resolvedBy: body.resolved ? id.userId : null }
          : {}),
      })
      if (!updated) return c.json({ error: 'not found or invalid' }, 404)
      if (body.resolved !== undefined) {
        void c.get('services').events.emit({
          tenantId: id.tenantId,
          actorId: id.userId,
          type: body.resolved ? 'comment.resolved' : 'comment.unresolved',
          resourceId: commentId,
          extra: { workbookId: wbId, threadId: updated.threadId },
        })
      }
      return c.json(updated)
    },
  )
  .delete(
    '/api/v1/workbooks/:wbId/comments/:id',
    requireCapability('canEdit', (c) => ({
      type: 'workbook',
      id: c.req.param('wbId'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const wbId = c.req.param('wbId')
      const commentId = c.req.param('id')
      const ok = await c.get('services').comments.delete({ tenantId: id.tenantId, id: commentId })
      if (!ok) return c.json({ error: 'not found' }, 404)
      void c.get('services').events.emit({
        tenantId: id.tenantId,
        actorId: id.userId,
        type: 'comment.deleted',
        resourceId: commentId,
        extra: { workbookId: wbId },
      })
      return c.body(null, 204)
    },
  )
