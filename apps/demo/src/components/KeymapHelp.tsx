import { useEffect } from 'react'

export interface KeymapHelpProps {
  open: boolean
  onClose: () => void
}

interface Shortcut {
  combo: string
  label: string
}

const GROUPS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: '导航',
    shortcuts: [
      { combo: '⌘/Ctrl + K', label: '打开 / 关闭文件夹' },
      { combo: '⌘/Ctrl + H', label: '版本历史' },
      { combo: '⌘/Ctrl + /', label: '分享对话框' },
      { combo: 'Esc', label: '关闭打开的抽屉' },
      { combo: '?', label: '显示此帮助' },
    ],
  },
  {
    title: '文件夹树',
    shortcuts: [
      { combo: '→', label: '展开当前文件夹' },
      { combo: '←', label: '收起当前文件夹' },
      { combo: 'Enter', label: '选中文件夹' },
      { combo: 'F2', label: '重命名' },
      { combo: 'Delete', label: '删除（可在回收站恢复）' },
      { combo: 'Tab / Shift+Tab', label: '在抽屉内移动焦点（不会逸出）' },
    ],
  },
  {
    title: '编辑（Univer 原生）',
    shortcuts: [
      { combo: '⌘/Ctrl + Z', label: '撤销' },
      { combo: '⌘/Ctrl + Shift + Z', label: '重做' },
      { combo: '⌘/Ctrl + C / V', label: '复制 / 粘贴' },
      { combo: '⌘/Ctrl + F', label: '查找替换' },
      { combo: '⌘/Ctrl + S', label: '保存（顶栏按钮）' },
      { combo: '方向键', label: '移动选区' },
    ],
  },
]

export function KeymapHelp({ open, onClose }: KeymapHelpProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled by listener above
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keymap-help-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          color: '#1f2937',
          borderRadius: 12,
          padding: 24,
          maxWidth: 560,
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <strong id="keymap-help-title" style={{ fontSize: 16 }}>
            键盘快捷键
          </strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: '#6b7280',
              padding: 0,
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  margin: '0 0 6px',
                }}
              >
                {g.title}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {g.shortcuts.map((s) => (
                    <tr key={s.combo} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td
                        style={{
                          padding: '6px 0',
                          width: '40%',
                          whiteSpace: 'nowrap',
                          fontSize: 12,
                        }}
                      >
                        <kbd
                          style={{
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          }}
                        >
                          {s.combo}
                        </kbd>
                      </td>
                      <td style={{ padding: '6px 0', fontSize: 13, color: '#374151' }}>
                        {s.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <footer
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid #e5e7eb',
            fontSize: 12,
            color: '#6b7280',
          }}
        >
          按 <kbd>Esc</kbd> 或点击空白处关闭。
        </footer>
      </div>
    </div>
  )
}
