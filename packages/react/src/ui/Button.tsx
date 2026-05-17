import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  forwardRef,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb' },
  secondary: { background: '#fff', color: '#1f2937', border: '1px solid #d1d5db' },
  danger: { background: '#dc2626', color: '#fff', border: '1px solid #dc2626' },
  ghost: { background: 'transparent', color: '#374151', border: '1px solid transparent' },
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 12, padding: '4px 10px', height: 26, borderRadius: 4 },
  md: { fontSize: 13, padding: '6px 14px', height: 32, borderRadius: 6 },
  lg: { fontSize: 14, padding: '8px 20px', height: 40, borderRadius: 8 },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, children, style, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontWeight: 500,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        transition: 'background 80ms ease, opacity 80ms ease',
        ...sizeStyles[size],
        ...variantStyles[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <span aria-hidden="true">…</span> : icon}
      {children}
    </button>
  )
})
