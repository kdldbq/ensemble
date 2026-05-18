import type { ApiClient, Grant } from '@ensemble-sheets/core'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
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

const GRANTEE_LABEL: Record<GranteeType, string> = {
  user: '指定用户',
  tenant_member: '本租户成员',
  public_link: '链接共享',
}

function publicLinkUrl(token: string): string {
  return `${location.origin}/?u=${encodeURIComponent(token)}`
}

const fieldStyle = {
  width: '100%',
  fontSize: 13,
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  background: '#fff',
} as const

const smallBtn = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  padding: '4px 8px',
  color: '#6b7280',
  borderRadius: 3,
} as const

export function ShareDialog({ api, workbookId, open, onClose }: ShareDialogProps) {
  const [granteeType, setGranteeType] = useState<GranteeType>('user')
  const [granteeId, setGranteeId] = useState('')
  const [permission, setPermission] = useState<PermissionLevel>('view')
  const [password, setPassword] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [grants, setGrants] = useState<Grant[]>([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [grantsError, setGrantsError] = useState<string | null>(null)

  const refreshGrants = useCallback(async () => {
    setGrantsLoading(true)
    setGrantsError(null)
    try {
      const { items } = await api.listGrants({ workbookId })
      setGrants(items)
    } catch (e) {
      setGrantsError(e instanceof Error ? e.message : String(e))
    } finally {
      setGrantsLoading(false)
    }
  }, [api, workbookId])

  useEffect(() => {
    if (open) void refreshGrants()
  }, [open, refreshGrants])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const grant = await api.createGrant({
        resourceType: 'workbook',
        resourceId: workbookId,
        granteeType,
        granteeId: granteeType === 'tenant_member' ? null : granteeId || null,
        permission,
        expiresAt: expiresAt || null,
        ...(granteeType === 'public_link' && password ? { password } : {}),
      })

      if (granteeType === 'public_link') {
        // grant.linkToken is the cleartext token, returned exactly once on
        // create. After this response the server only retains the HMAC, so
        // there is no way to surface the same URL in the list view below.
        const url = publicLinkUrl(grant.linkToken ?? '')
        try {
          await navigator.clipboard.writeText(url)
          toast.success('公共链接已生成并复制', {
            description: password ? '已设置密码（仅本次显示）' : '链接仅本次显示',
          })
        } catch {
          toast.success(`公共链接已生成：${url}`)
        }
      } else if (granteeType === 'tenant_member') {
        toast.success(`已授予所有租户成员「${PERMISSION_LABEL[permission]}」`)
      } else {
        toast.success(`已授予「${PERMISSION_LABEL[permission]}」给 ${granteeId}`)
      }

      setGranteeId('')
      setPassword('')
      setExpiresAt('')
      setAdvancedOpen(false)
      await refreshGrants()
    } catch (err) {
      toast.error(`授予失败：${err instanceof Error ? err.message : String(err)}`, {
        duration: 8000,
      })
    } finally {
      setBusy(false)
    }
  }

  async function copyLink(g: Grant) {
    if (!g.granteeId) return
    const url = publicLinkUrl(g.granteeId)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选中链接')
    }
  }

  async function revoke(g: Grant) {
    try {
      await api.deleteGrant(g.id)
      toast.success('已撤销访问权限')
      await refreshGrants()
    } catch (err) {
      toast.error(`撤销失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <Drawer side="right" open={open} onClose={onClose} title="分享工作簿" width={420}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, marginBottom: 4, color: '#374151' }}>授予对象</div>
          <select
            value={granteeType}
            onChange={(e) => setGranteeType(e.target.value as GranteeType)}
            style={fieldStyle}
          >
            <option value="user">指定用户</option>
            <option value="tenant_member">本租户所有成员</option>
            <option value="public_link">任何持链接者</option>
          </select>
        </label>

        {granteeType === 'user' && (
          <label>
            <div style={{ fontSize: 12, marginBottom: 4, color: '#374151' }}>
              用户 ID（例如 admin-... / editor-... / viewer-...）
            </div>
            <input
              type="text"
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              required
              style={fieldStyle}
            />
          </label>
        )}

        <label>
          <div style={{ fontSize: 12, marginBottom: 4, color: '#374151' }}>权限</div>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as PermissionLevel)}
            style={fieldStyle}
          >
            <option value="view">查看（只读）</option>
            <option value="edit">编辑</option>
            <option value="manage">管理（可分享 / 可删除）</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
            textAlign: 'left',
          }}
        >
          {advancedOpen ? '▼' : '▶'} 高级选项（过期 / 密码）
        </button>

        {advancedOpen && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingLeft: 12,
              borderLeft: '2px solid #e5e7eb',
            }}
          >
            <label>
              <div style={{ fontSize: 12, marginBottom: 4, color: '#374151' }}>
                过期时间（可选）
              </div>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={fieldStyle}
              />
            </label>

            {granteeType === 'public_link' && (
              <label>
                <div style={{ fontSize: 12, marginBottom: 4, color: '#374151' }}>
                  链接密码（可选，仅链接共享）
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="留空则任何持链接者可访问"
                  autoComplete="new-password"
                  style={fieldStyle}
                />
              </label>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: '1px solid #2563eb',
            borderRadius: 4,
            padding: '8px 14px',
            fontSize: 13,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.55 : 1,
          }}
        >
          {busy ? '授予中…' : '授予访问'}
        </button>
      </form>

      <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid #e5e7eb' }} />

      <section>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>已分享列表</strong>
          <button
            type="button"
            onClick={() => void refreshGrants()}
            aria-label="刷新分享列表"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              fontSize: 12,
            }}
          >
            ⟳
          </button>
        </header>

        {grantsLoading && (
          <div style={{ padding: '8px 0', color: '#9ca3af', fontSize: 12 }}>加载中…</div>
        )}
        {grantsError && (
          <div role="alert" style={{ color: '#b91c1c', fontSize: 12, padding: '4px 0' }}>
            {grantsError}
          </div>
        )}
        {!grantsLoading && grants.length === 0 && !grantsError && (
          <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>尚无分享授权</div>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {grants.map((g) => (
            <li
              key={g.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#1f2937' }}>
                  <strong>{GRANTEE_LABEL[g.granteeType]}</strong>
                  {g.granteeType === 'user' && g.granteeId && (
                    <span style={{ color: '#6b7280' }}> · {g.granteeId}</span>
                  )}
                </div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>
                  {PERMISSION_LABEL[g.permission]}
                  {g.hasPassword && ' · 🔒 密码保护'}
                  {g.expiresAt && ` · 过期 ${new Date(g.expiresAt).toLocaleDateString('zh-CN')}`}
                </div>
              </div>
              {g.granteeType === 'public_link' && g.granteeId && (
                <button type="button" onClick={() => void copyLink(g)} style={smallBtn}>
                  复制
                </button>
              )}
              <button
                type="button"
                onClick={() => void revoke(g)}
                style={{ ...smallBtn, color: '#dc2626' }}
              >
                撤销
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p style={{ marginTop: 16, fontSize: 12, color: '#6b7280' }}>
        授权由 host PermissionAdapter 实现；演示里授权信息每日重置前一直有效。 链接密码使用 scrypt
        哈希存储，不可逆。
      </p>
    </Drawer>
  )
}
