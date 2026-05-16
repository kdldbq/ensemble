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

export function ShareDialog({ api, workbookId, open, onClose }: ShareDialogProps) {
  const [granteeType, setGranteeType] = useState<GranteeType>('user')
  const [granteeId, setGranteeId] = useState('')
  const [permission, setPermission] = useState<PermissionLevel>('view')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

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
        setResult(`Public link created: ${url}`)
      } else {
        setResult(`Granted ${permission} to ${granteeId || 'all tenant members'}`)
      }
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer side="right" open={open} onClose={onClose} title="Share workbook" width={380}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Grant to</div>
          <select
            value={granteeType}
            onChange={(e) => setGranteeType(e.target.value as GranteeType)}
            style={{ width: '100%' }}
          >
            <option value="user">A specific user</option>
            <option value="tenant_member">All tenant members</option>
            <option value="public_link">Anyone with link</option>
          </select>
        </label>

        {granteeType === 'user' && (
          <label>
            <div style={{ fontSize: 12, marginBottom: 4 }}>User id (e.g. visitor-...)</div>
            <input
              type="text"
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              placeholder="visitor-..."
              required
              style={{ width: '100%' }}
            />
          </label>
        )}

        <label>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Permission</div>
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as PermissionLevel)}
            style={{ width: '100%' }}
          >
            <option value="view">View</option>
            <option value="edit">Edit</option>
            <option value="manage">Manage</option>
          </select>
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Granting…' : 'Grant access'}
        </button>

        {result && (
          <div
            style={{
              padding: 8,
              borderRadius: 6,
              background: result.startsWith('Error') ? '#fee2e2' : '#dcfce7',
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {result}
          </div>
        )}
      </form>

      <p style={{ marginTop: 16, fontSize: 12, color: '#6b7280' }}>
        Grants are stored on the workbook. The host normally implements its own permission adapter
        to read/write these — the demo grants stay valid until the daily reset.
      </p>
    </Drawer>
  )
}
