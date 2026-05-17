import type { ApiClient, MountHandle } from '@ensemble-sheets/core'
import { PresenceAvatars } from '@ensemble-sheets/react'
import { useRef, useState } from 'react'
import { openAnotherUserUrl } from '../lib/visitor'
import { downloadXlsx, uploadXlsx } from '../lib/xlsx-io'
import { type Persona, capabilitiesFor } from '../persona'

export interface TopBarProps {
  api: ApiClient
  token: string
  userId: string
  persona: Persona
  workbookId: string
  workbookLabel: string
  inPublicRoom: boolean
  onTogglePublicRoom: () => void
  onOpenFolders: () => void
  onOpenVersions: () => void
  onOpenShare: () => void
  onSave: () => void | Promise<void>
  onUploaded: (workbookId: string) => void
  /**
   * Mount handle of the active editor. Used for presence avatars; null until
   * the editor finishes its first WS welcome.
   */
  editorHandle?: MountHandle | null
}

const personaBadge: Record<Persona, { label: string; color: string }> = {
  admin: { label: '管理员', color: '#0d9488' },
  editor: { label: '编辑者', color: '#2563eb' },
  viewer: { label: '查看者', color: '#9333ea' },
}

type ToastKind = 'ok' | 'warn' | 'err'
const toastColor: Record<ToastKind, string> = {
  ok: '#065f46',
  warn: '#92400e',
  err: '#991b1b',
}

export function TopBar(props: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null)

  const cap = capabilitiesFor(props.persona)

  function announce(msg: string, kind: ToastKind = 'ok') {
    setToast({ msg, kind })
    window.setTimeout(() => setToast(null), 3500)
  }

  /**
   * Convert a thrown error into a user-friendly toast message. Server returns
   * "ensemble 403: edit capability required" for RBAC failures — surface that
   * as "no permission" instead of a generic "save failed: HTTP 403".
   */
  function explainError(label: string, err: unknown): { msg: string; kind: ToastKind } {
    const raw = err instanceof Error ? err.message : String(err)
    if (/40[13]/.test(raw) || /edit capability|forbidden/i.test(raw)) {
      return { msg: `✗ ${label}失败：你的角色没有此权限`, kind: 'warn' }
    }
    if (/network|fetch|timeout/i.test(raw)) {
      return { msg: `✗ ${label}失败：网络问题，请重试`, kind: 'err' }
    }
    return { msg: `✗ ${label}失败：${raw}`, kind: 'err' }
  }

  async function handleSave() {
    if (!cap.canEdit) {
      announce('✗ 查看者无法保存（角色限制）', 'warn')
      return
    }
    setBusy('save')
    try {
      await props.onSave()
      announce('✓ 已保存')
    } catch (e) {
      const t = explainError('保存', e)
      announce(t.msg, t.kind)
    } finally {
      setBusy(null)
    }
  }

  async function handleUpload(file: File) {
    if (!cap.canEdit) {
      announce('✗ 查看者无法上传（角色限制）', 'warn')
      return
    }
    setBusy('upload')
    try {
      const { workbookId, name } = await uploadXlsx(props.api, file)
      announce(`✓ 已上传「${name}」`)
      props.onUploaded(workbookId)
    } catch (e) {
      const t = explainError('上传', e)
      announce(t.msg, t.kind)
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload() {
    setBusy('download')
    try {
      await downloadXlsx('', props.token, props.workbookId, props.workbookLabel)
      announce('✓ 已开始下载')
    } catch (e) {
      const t = explainError('下载', e)
      announce(t.msg, t.kind)
    } finally {
      setBusy(null)
    }
  }

  function handleOpenAnotherUser(persona?: Persona) {
    window.open(openAnotherUserUrl(persona), '_blank', 'noopener')
  }

  const badge = personaBadge[props.persona]

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fafafa',
        flexWrap: 'wrap',
        position: 'relative',
      }}
    >
      <strong style={{ fontSize: 14 }}>ensemble 演示</strong>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>· {props.workbookLabel}</span>

      <PresenceAvatars
        handle={props.editorHandle ?? null}
        selfUserId={props.userId}
        style={{ marginLeft: 4 }}
      />

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={handleSave}
        disabled={busy === 'save' || !cap.canEdit}
        title={cap.canEdit ? '保存当前工作簿' : '查看者无法保存'}
        style={!cap.canEdit ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      >
        💾 保存
      </button>
      <button type="button" onClick={props.onOpenFolders}>
        📁 文件夹
      </button>
      <button type="button" onClick={props.onOpenVersions}>
        🕘 版本历史
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy === 'upload' || !cap.canEdit}
        title={cap.canEdit ? '从本地 .xlsx 创建新工作簿' : '查看者无法上传'}
        style={!cap.canEdit ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      >
        ⬆ 上传 xlsx
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f)
          e.target.value = ''
        }}
      />
      <button type="button" onClick={handleDownload} disabled={busy === 'download'}>
        ⬇ 下载 xlsx
      </button>
      <button
        type="button"
        onClick={props.onOpenShare}
        disabled={!cap.canShare}
        title={cap.canShare ? '管理分享' : '当前角色不能分享'}
        style={!cap.canShare ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      >
        ↗ 分享
      </button>
      <button type="button" onClick={props.onTogglePublicRoom}>
        {props.inPublicRoom ? '← 回沙盒' : '☁ 公共房间'}
      </button>

      <select
        aria-label="以另一个角色打开新标签"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value as '' | 'admin' | 'editor' | 'viewer' | '__random__'
          if (v === '') return
          handleOpenAnotherUser(v === '__random__' ? undefined : (v as Persona))
          e.currentTarget.value = ''
        }}
      >
        <option value="" disabled>
          + 另开一人
        </option>
        <option value="admin">以管理员开</option>
        <option value="editor">以编辑者开</option>
        <option value="viewer">以查看者开</option>
        <option value="__random__">随机访客</option>
      </select>

      <span
        title={`你的访客 ID：${props.userId}（角色由 ID 哈希决定，刷新不变）`}
        style={{
          background: badge.color,
          color: '#fff',
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {badge.label}
      </span>

      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 12,
            background: '#fff',
            color: toastColor[toast.kind],
            border: `1px solid ${toastColor[toast.kind]}`,
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </header>
  )
}
