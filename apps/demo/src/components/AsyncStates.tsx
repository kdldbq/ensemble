import type { CSSProperties, ReactNode } from 'react'

const baseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '24px 16px',
  color: '#6b7280',
  fontSize: 13,
  textAlign: 'center',
}

export interface LoadingProps {
  label?: string
  style?: CSSProperties
}

export function Loading({ label = '加载中…', style }: LoadingProps) {
  return (
    <div role="status" aria-live="polite" style={{ ...baseStyle, ...style }}>
      <div
        aria-hidden="true"
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '2px solid #e5e7eb',
          borderTopColor: '#6b7280',
          animation: 'ensemble-spin 0.8s linear infinite',
        }}
      />
      <style>{'@keyframes ensemble-spin { to { transform: rotate(360deg); } }'}</style>
      <span>{label}</span>
    </div>
  )
}

export interface SkeletonRowsProps {
  rows?: number
  rowHeight?: number
  style?: CSSProperties
}

export function SkeletonRows({ rows = 3, rowHeight = 28, style }: SkeletonRowsProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="加载中"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, ...style }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items have no identity
          key={i}
          style={{
            height: rowHeight,
            background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
            backgroundSize: '200% 100%',
            animation: 'ensemble-skeleton 1.4s ease-in-out infinite',
            borderRadius: 4,
          }}
        />
      ))}
      <style>
        {
          '@keyframes ensemble-skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }'
        }
      </style>
    </div>
  )
}

export interface EmptyProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  style?: CSSProperties
}

export function Empty({ title = '暂无内容', description, icon = '📭', action, style }: EmptyProps) {
  return (
    <div style={{ ...baseStyle, ...style }}>
      <div aria-hidden="true" style={{ fontSize: 28 }}>
        {icon}
      </div>
      <strong style={{ color: '#374151', fontSize: 13 }}>{title}</strong>
      {description && <span style={{ fontSize: 12 }}>{description}</span>}
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  error: Error | string
  onRetry?: () => void
  style?: CSSProperties
}

export function ErrorState({ error, onRetry, style }: ErrorStateProps) {
  const msg = typeof error === 'string' ? error : error.message
  return (
    <div role="alert" style={{ ...baseStyle, color: '#b91c1c', ...style }}>
      <div aria-hidden="true" style={{ fontSize: 24 }}>
        ⚠
      </div>
      <strong style={{ fontSize: 13 }}>出错了</strong>
      <span style={{ fontSize: 12 }}>{msg}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 4,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            padding: '4px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          重试
        </button>
      )}
    </div>
  )
}
