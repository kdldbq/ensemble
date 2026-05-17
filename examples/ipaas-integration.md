# Connecting ensemble to iPaaS platforms

ensemble's webhook + REST surface lets you wire workbook events into
automation platforms without writing any server code. This guide covers
**Zapier**, **n8n**, **Make (Integromat)**, **腾讯轻联 HiFlow**, and
**集简云 Jijian Cloud**.

## What ensemble exposes

| Trigger | Webhook event | When it fires |
|---|---|---|
| `workbook.created` | yes | New workbook (any source) |
| `workbook.edited` | yes | Mutations applied (batched) |
| `workbook.moved` | yes | Workbook moved between folders |
| `workbook.deleted` | yes | Soft-deleted |
| `folder.created` / `.renamed` / `.moved` / `.deleted` / `.restored` | yes | Folder ops |
| `share.granted` / `.revoked` | yes | Access grants changed |
| `protection.created` / `.deleted` | yes | Range protection ops |
| `comment.created` / `.resolved` / `.deleted` / `.mentioned` | yes | Comment thread ops |

| Action (HTTP) | Path | Notes |
|---|---|---|
| Create folder | `POST /api/v1/folders` | Trigger from CRM webhook → make folder |
| Create workbook | `POST /api/v1/workbooks` | Bootstrap a sheet per project |
| Read range | `POST /api/v1/workbooks/:id/range/read` | Pull aggregate into BI dashboard |
| Grant access | `POST /api/v1/grants` | Auto-share with stakeholder on event |

## Setup pattern — webhook receiver

ensemble POSTs JSON to your iPaaS webhook URL with signed headers:

```
POST https://hooks.your-ipaas.com/...
content-type: application/json
x-ensemble-signature: sha256=...
x-ensemble-signature-v2: sha256=...
x-ensemble-timestamp: 1747353600

{ "type": "workbook.edited", "workbookId": "uuid", "userId": "...", "at": "ISO" }
```

Verify the v2 signature on receipt:

```js
const expected = `sha256=` + crypto.createHmac('sha256', SECRET)
  .update(`${req.headers['x-ensemble-timestamp']}.${rawBody}`)
  .digest('hex')
if (expected !== req.headers['x-ensemble-signature-v2']) {
  return res.status(401).send('bad signature')
}
```

Reject if timestamp is more than 5 min old (replay protection).

## Zapier

1. Create a new Zap. Trigger = "Webhooks by Zapier" → "Catch Raw Hook".
2. Copy the catch URL. In your ensemble host wire `WebhookEventAdapter`:
   ```ts
   new WebhookEventAdapter({
     url: 'https://hooks.zapier.com/...',
     secret: process.env.WEBHOOK_SECRET,
     retry: { attempts: 3, baseDelayMs: 500 }
   })
   ```
3. In Zapier add a Filter step matching `type` == `workbook.created`.
4. Add downstream action (Slack message, Notion page, etc).

## n8n

1. n8n → Add node → Webhook → Method: POST.
2. Note webhook URL, configure same `WebhookEventAdapter`.
3. Add Function node to verify signature (copy the JS snippet above).
4. Branch on `{{$json.type}}` with Switch node.

## Make (Integromat)

1. Make → Create scenario → first module = Webhooks → Custom webhook.
2. Use the address in `WebhookEventAdapter.url`.
3. After receiving, add Router with paths per event type.
4. Common downstream: Google Sheets, Airtable, Email, SMS.

## 腾讯轻联 HiFlow

1. HiFlow → 触发器 → Webhook → 生成 URL。
2. ensemble `WebhookEventAdapter.url` 指向该 URL。
3. 在 HiFlow 工作流里加 "条件分支"，按 `type` 字段分流。
4. 连企微 / 短信 / 钉钉 / 飞书 推送。

## 集简云 Jijian Cloud

1. 集简云 → 新建流程 → 触发器 → Webhook URL。
2. ensemble 推送事件后，集简云解析 JSON 字段。
3. 后续接入腾讯文档表格 / 企微通知 / OA 系统。

## Reverse direction — iPaaS calls ensemble

Most iPaaS platforms include "HTTP Request" / "Webhook out" steps. Point them
at ensemble's REST API:

```
POST https://your-ensemble.example.com/api/v1/workbooks/{id}/range/read
Authorization: Bearer <service-token>
content-type: application/json

{ "sheetId": "s1", "rangeRef": "A1:C100" }
```

The bearer token must be issued by your IdentityAdapter — usually a
long-lived service token tied to a non-human "automation" user.

## Production checklist

- [ ] Webhook secret rotated quarterly (`WebhookOpts.secret`)
- [ ] iPaaS scenarios use v2 signature verification (not v1 alone)
- [ ] Timestamp window 300s (5 min) enforced on receiver
- [ ] Retry policy enabled (`attempts: 3+`) with dead-letter sink
- [ ] Service tokens for outbound iPaaS calls scoped (canView only if read)
- [ ] iPaaS receivers respond 2xx within 5s (ensemble timeout)
- [ ] Audit log enabled on ensemble side for forensics
