import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ev_demo_onboarded_v2'

/**
 * One-shot coachmark for first-time visitors. Stores a flag in localStorage so it
 * doesn't reappear after dismiss. Re-show by clearing the key in dev tools.
 *
 * v2 (2026-05-17): rewritten after audit found the original list (4 items)
 * underrepresented v0.1 capability — added live-sync, lock-visibility, and
 * Univer-ribbon callouts.
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
        maxWidth: 420,
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
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
        👋 欢迎来到 ensemble 演示
      </div>
      <div style={{ color: '#cbd5e1', marginBottom: 10 }}>一站式可点击 v0.1 GA 能力清单：</div>

      <Section title="协作">
        <li>编辑左侧单元格 → 0.8 秒后自动保存 → 右侧「查看者眼中」面板自动刷新（B 列脱敏）</li>
        <li>顶部头像列表展示当前房间里的其他人</li>
        <li>有人在某区域开始编辑时，状态栏右侧会显示「锁标」</li>
      </Section>

      <Section title="数据 I/O">
        <li>
          <strong>💾 保存</strong> · <strong>⬆ 上传 xlsx</strong> · <strong>⬇ 下载 xlsx</strong>
          （服务端导出，含脱敏）
        </li>
        <li>
          <strong>🕘 版本历史</strong>：手动 named version + 一键恢复
        </li>
      </Section>

      <Section title="组织">
        <li>
          <strong>📁 文件夹</strong>：悬停可见 ✎ 重命名 / ⇨ 移动 / 🗑 删除
        </li>
        <li>
          <strong>↗ 分享</strong>：单用户 / 整租户 / 公共链接三种 grant
        </li>
        <li>
          <strong>☁ 公共房间</strong>：与陌生访客共享一份工作簿
        </li>
      </Section>

      <Section title="角色">
        <li>当前角色按 userId 哈希决定（标签上的小色块）</li>
        <li>
          <strong>+ 另开一人</strong> 下拉：在新标签以指定角色重新进入
        </li>
        <li>查看者角色下，所有编辑按钮自动变灰</li>
      </Section>

      <Section title="表格能力">
        <li>
          Univer ribbon（开始 / 插入 / 公式 /
          数据）含数字格式、条件格式、数据验证、筛选、排序、查找替换、评论、插图
        </li>
        <li>Ctrl+Z 撤销、Ctrl+C/V 复制粘贴、Ctrl+F 查找均可用</li>
      </Section>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={dismiss}
          style={{
            background: '#fff',
            color: '#0f172a',
            padding: '4px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          知道了
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>
        {title.toUpperCase()}
      </div>
      <ul style={{ margin: '2px 0 0 0', paddingLeft: 18 }}>{children}</ul>
    </div>
  )
}
