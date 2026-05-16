import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ev_demo_onboarded'

/**
 * One-shot coachmark for first-time visitors. Stores a flag in localStorage so it
 * doesn't reappear after dismiss. Re-show by clearing the key in dev tools.
 */
export function OnboardingCoach() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        maxWidth: 360,
        background: '#0f172a',
        color: '#fff',
        padding: 16,
        borderRadius: 10,
        boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        zIndex: 60,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>👋 欢迎来到 ensemble 演示</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          在左侧 <em>管理员</em> 编辑器里随便点一个单元格，输入内容。
        </li>
        <li>
          点顶部 <strong>💾 保存</strong>，右侧「查看者眼中」面板会自动刷新 —— B 列永远是{' '}
          <code>***</code>。
        </li>
        <li>
          试试 <strong>📁 文件夹</strong>、<strong>🕘 版本历史</strong>、
          <strong>⬆ 上传 xlsx</strong>、<strong>↗ 分享</strong>。
        </li>
        <li>
          点 <strong>+ 另开一人</strong>，会在新标签页里开一个全新身份。
        </li>
      </ol>
      <button type="button" onClick={dismiss} style={{ marginTop: 12 }}>
        知道了
      </button>
    </div>
  )
}
