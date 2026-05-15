export interface LockBadgeProps {
  ownerId: string
  className?: string
}

export function LockBadge({ ownerId, className }: LockBadgeProps) {
  if (!ownerId) return null
  return (
    <span
      className={`ensemble-lock-badge ${className ?? ''}`}
      style={{
        display: 'inline-block', padding: '2px 6px',
        background: '#fef3c7', border: '1px solid #fbbf24',
        borderRadius: 4, fontSize: 11, color: '#92400e',
      }}
      title={`${ownerId} is editing this cell`}
    >
      {ownerId} editing
    </span>
  )
}
