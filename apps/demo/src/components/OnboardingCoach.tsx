// biome-ignore-all lint/a11y/useAriaPropsSupportedByRole: aria-label kept on the live-region container for screen reader announcement consistency.
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'

const STORAGE_KEY = 'ev_demo_onboarded_v3'

interface Step {
  title: string
  body: ReactNode
}

const kbdCell: CSSProperties = { whiteSpace: 'nowrap', paddingRight: 8 }

const STEPS: Step[] = [
  {
    title: '👋 欢迎来到 ensemble 演示',
    body: (
      <>
        ensemble 是一个 <strong>开源 / 自托管</strong> 的 Univer 协作 SDK。 本演示展示 v0.2 GA
        的核心能力。按 <kbd>下一步</kbd> 逐项了解， 或按 <kbd>跳过</kbd> 直接开始。
      </>
    ),
  },
  {
    title: '🤝 协作 + 数据掩码',
    body: (
      <>
        <p style={{ margin: '0 0 6px' }}>
          左侧是你的编辑面板；右侧「查看者眼中」面板会自动同步并按
          <strong>查看者权限</strong> 脱敏 B 列。
        </p>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
          顶部头像显示房间内其他人；有人在编辑某区域时状态栏右侧出现锁标。
        </p>
      </>
    ),
  },
  {
    title: '📁 文件夹 + 分享',
    body: (
      <>
        <p style={{ margin: '0 0 6px' }}>
          <strong>📁 文件夹</strong>：F2 重命名 / Delete 删除（可在回收站恢复） / 搜索框过滤。
        </p>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
          <strong>↗ 分享</strong>：单用户 / 整租户 / 链接共享三种 grant； 链接共享支持密码 + 过期。
        </p>
      </>
    ),
  },
  {
    title: '🕘 版本 + 协作历史',
    body: (
      <>
        <p style={{ margin: '0 0 6px' }}>
          <strong>🕘 版本历史</strong>：保存命名版本，可一键恢复（自动另存当前为新版本）。
        </p>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12 }}>
          所有 mutation 写入 audit_log；管理员可查看完整协作历史时间线。
        </p>
      </>
    ),
  },
  {
    title: '⌨ 键盘快捷键',
    body: (
      <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={kbdCell}>
              <kbd>⌘/Ctrl + K</kbd>
            </td>
            <td style={{ paddingLeft: 8 }}>打开文件夹</td>
          </tr>
          <tr>
            <td style={kbdCell}>
              <kbd>⌘/Ctrl + H</kbd>
            </td>
            <td style={{ paddingLeft: 8 }}>版本历史</td>
          </tr>
          <tr>
            <td style={kbdCell}>
              <kbd>⌘/Ctrl + /</kbd>
            </td>
            <td style={{ paddingLeft: 8 }}>分享对话框</td>
          </tr>
          <tr>
            <td style={kbdCell}>
              <kbd>?</kbd>
            </td>
            <td style={{ paddingLeft: 8 }}>显示快捷键帮助</td>
          </tr>
          <tr>
            <td style={kbdCell}>
              <kbd>Esc</kbd>
            </td>
            <td style={{ paddingLeft: 8 }}>关闭抽屉</td>
          </tr>
        </tbody>
      </table>
    ),
  },
]

export function OnboardingCoach() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  function next() {
    if (step >= STEPS.length - 1) {
      dismiss()
      return
    }
    setStep((s) => s + 1)
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1)
  }

  if (!show) return null

  const current = STEPS[step]
  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="ensemble-onboarding-title"
      style={{
        position: 'fixed',
        top: 64,
        right: 24,
        maxWidth: 360,
        background: '#0f172a',
        color: '#fff',
        padding: 18,
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        zIndex: 60,
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <strong id="ensemble-onboarding-title" style={{ fontSize: 14 }}>
          {current.title}
        </strong>
        <button
          type="button"
          aria-label="跳过引导"
          onClick={dismiss}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
          }}
        >
          跳过
        </button>
      </header>

      <div style={{ minHeight: 80 }}>{current.body}</div>

      <div
        style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '12px 0' }}
        aria-label={`步骤 ${step + 1} / ${STEPS.length}`}
      >
        {STEPS.map((_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: progress dots have no identity
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i === step ? '#fff' : '#475569',
            }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          style={{
            background: 'transparent',
            color: step === 0 ? '#475569' : '#cbd5e1',
            border: 'none',
            cursor: step === 0 ? 'default' : 'pointer',
            fontSize: 12,
            padding: '4px 8px',
          }}
        >
          ← 上一步
        </button>
        <button
          type="button"
          onClick={next}
          style={{
            background: '#fff',
            color: '#0f172a',
            padding: '4px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {step >= STEPS.length - 1 ? '完成' : '下一步 →'}
        </button>
      </div>
    </div>
  )
}
