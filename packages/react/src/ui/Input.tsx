import {
  type CSSProperties,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
} from 'react'

export type FieldSize = 'sm' | 'md' | 'lg'

const sizeStyles: Record<FieldSize, CSSProperties> = {
  sm: { fontSize: 12, padding: '4px 8px', height: 26, borderRadius: 4 },
  md: { fontSize: 13, padding: '6px 10px', height: 32, borderRadius: 6 },
  lg: { fontSize: 14, padding: '8px 12px', height: 40, borderRadius: 8 },
}

const baseStyle: CSSProperties = {
  background: '#fff',
  color: '#1f2937',
  border: '1px solid #d1d5db',
  outline: 'none',
  transition: 'border-color 80ms ease, box-shadow 80ms ease',
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  fieldSize?: FieldSize
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { fieldSize = 'md', invalid, style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      style={{
        ...baseStyle,
        ...sizeStyles[fieldSize],
        ...(invalid ? { borderColor: '#dc2626' } : {}),
        ...style,
      }}
      {...rest}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  fieldSize?: FieldSize
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { fieldSize = 'md', invalid, style, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      style={{
        ...baseStyle,
        ...sizeStyles[fieldSize],
        ...(invalid ? { borderColor: '#dc2626' } : {}),
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  fieldSize?: FieldSize
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { fieldSize = 'md', invalid, style, ...rest },
  ref,
) {
  const sz = sizeStyles[fieldSize]
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      style={{
        ...baseStyle,
        fontSize: sz.fontSize,
        padding: sz.padding,
        borderRadius: sz.borderRadius,
        minHeight: 80,
        resize: 'vertical',
        fontFamily: 'inherit',
        ...(invalid ? { borderColor: '#dc2626' } : {}),
        ...style,
      }}
      {...rest}
    />
  )
})
