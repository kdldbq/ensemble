import type { ApiClient, Grant } from '@ensemble-sheets/core'
import { useState } from 'react'
import { Drawer } from './Drawer'

export interface ShareDialogProps {
  api: ApiClient
  workbookId: string
  open: boolean
  onClose: () => void
}

type GranteeType = Grant['granteeType']
type PermissionLevel = Grant['permission']

const PERMISSION_LABEL: Record<PermissionLevel, string> = {
  view: '查看',
  edit: '编辑',
  manage: '管理',
}

export function ShareDialog({ api, workbookId, open, onClose }: ShareDialogProps) {
  const [granteeType, setGranteeType] = useState<GranteeType>('user')
  const [granteeId, setGranteeId] = useState('')
  const [permission, setPermission] = useState<PermissionLevel>('view')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const grant = await api.createGrant({
        resourceType: 'workbook',
        resourceId: workbookId,
        granteeType,
        granteeId: granteeType === 'tenant_member' ? null : granteeId || null,
        permission,
        expiresAt: null,
      })
      if (granteeType === 'public_link') {
        const url = `${location.origin}/?u=${encodeURIComponent(grant.granteeId ?? '')}`
        setResult({ ok: true, text: `已生成公共链接：${url}` })
      } else if (granteeType === 'tenant_member') {
        setResult({ ok: true, text: `已授予「${PERMISSION_LABEL[permission]}」给所有租户成员` })
      } else {
        setResult({ ok: true, text: `已授予「${PERMISSION_LABEL[permission]}」给 ${granteeId}` })
      }
    } catch (err) {
      setResult({ ok: false, text: `失败：${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer side="right" open={open} onClose={onClose} title="分享工作簿" width={380}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, marginBottom: 4 }}>授予对象</div>
          <select
            value={granteeType}
            onChange={(e) => setGranteeType(e.target.value as GranteeType)}
            style={{ width: '100%' }}
          >
            <option value="user">指定用户</option>
            <option value="tenant_member">本租户所有成员</option>
            <option value="public_link">任何持链接者</option>
          </select>
        </label>

        {granteeType === 'user' && (
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>用户 ID（例如 admin-...）</div>
            <input
              type="text"
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              placeholder="admin-... / editor-... / viewer-..."
              required
              style={{ width: '100%' }}
            />
          </label>
        )}

        <label>
          <div style={{ fontSize: 12, marginBottom: 4 }}>权限</div>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as PermissionLevel)}
            style={{ width: '100%' }}
          >
            <option value="view">查看</option>
            <option value="edit">编辑</option>
            <option value="manage">管理</option>
          </select>
        </label>

        <button type="submit" disabled={busy}>
          {busy ? '授予中…' : '授予访问'}
        </button>

        {result && (
          <div
            style={{
              padding: 8,
              borderRadius: 6,
              background: result.ok ? '#dcfce7' : '#fee2e2',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {result.text}
          </div>
        )}
      </form>

      <p style={{ marginTop: 16, fontSize: 12, color: '#6b7280' }}>
        授权信息存在工作簿上。生产环境里宿主会自行实现 PermissionAdapter
        读写授权；演示里授权在每日重置前一直有效。
      </p>
    </Drawer>
  )
}
