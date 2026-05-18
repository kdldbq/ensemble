import type { ApiClient, MountHandle } from '@ensemble-sheets/core'
import { PresenceAvatars } from '@ensemble-sheets/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { openAnotherUserUrl } from '../lib/visitor'
import { downloadXlsx, uploadFile } from '../lib/xlsx-io'
import { capabilitiesFor, type Persona } from '../persona'

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

export function TopBar(props: TopBarProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const cap = capabilitiesFor(props.persona)

  /**
   * Convert a thrown error into a user-friendly toast. Server returns
   * "ensemble 403: edit capability required" for RBAC failures — surface that
   * as "no permission" instead of a generic "save failed: HTTP 403".
   * Error toasts are extended (8s) to give users time to read.
   */
  function announceError(label: string, err: unknown): void {
    const raw = err instanceof Error ? err.message : String(err)
    if (/40[13]/.test(raw) || /edit capability|forbidden/i.test(raw)) {
      toast.warning(`${label}失败：你的角色没有此权限`)
      return
    }
    if (/network|fetch|timeout/i.test(raw)) {
      toast.error(`${label}失败：网络问题，请重试`, { duration: 8000 })
      return
    }
    toast.error(`${label}失败：${raw}`, { duration: 8000 })
  }

  async function handleSave() {
    if (!cap.canEdit) {
      toast.warning('查看者无法保存（角色限制）')
      return
    }
    setBusy('save')
    try {
      await props.onSave()
      toast.success('已保存')
    } catch (e) {
      announceError('保存', e)
    } finally {
      setBusy(null)
    }
  }

  async function handleUpload(file: File) {
    if (!cap.canEdit) {
      toast.warning('查看者无法上传（角色限制）')
      return
    }
    setBusy('upload')
    try {
      const { workbookId, name } = await uploadFile(props.api, file)
      toast.success(`已上传「${name}」`)
      props.onUploaded(workbookId)
    } catch (e) {
      announceError('上传', e)
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload() {
    setBusy('download')
    try {
      await downloadXlsx('', props.token, props.workbookId, props.workbookLabel)
      toast.success('已开始下载')
    } catch (e) {
      announceError('下载', e)
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
        💾 {t('topbar.save')}
      </button>
      <button type="button" onClick={props.onOpenFolders}>
        📁 {t('topbar.folders')}
      </button>
      <button type="button" onClick={props.onOpenVersions}>
        🕘 {t('topbar.versions')}
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy === 'upload' || !cap.canEdit}
        title={cap.canEdit ? '从本地 .xlsx 或 .csv 创建新工作簿' : '查看者无法上传'}
        style={!cap.canEdit ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      >
        ⬆ {t('topbar.upload')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f)
          e.target.value = ''
        }}
      />
      <button type="button" onClick={handleDownload} disabled={busy === 'download'}>
        ⬇ {t('topbar.download')}
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
          const label =
            v === '__random__'
              ? '随机访客'
              : v === 'admin'
                ? '管理员'
                : v === 'editor'
                  ? '编辑者'
                  : '查看者'
          handleOpenAnotherUser(v === '__random__' ? undefined : (v as Persona))
          toast.success(`已在新标签打开（${label}）`, {
            description: '若被浏览器拦截，请允许此站弹窗',
          })
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
    </header>
  )
}
