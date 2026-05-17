/**
 * Design tokens — spacing scale, color palette, radii, shadows.
 *
 * Single source of truth for the ensemble UI primitives. Components MAY use
 * these as numeric values (inline style) or as `var(--ensemble-…)` CSS variables
 * when they call `installCssVars()`.
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 40,
  8: 56,
} as const
export type SpacingKey = keyof typeof spacing

export const colors = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
  info: '#0284c7',
  fg: '#1f2937',
  fgMuted: '#6b7280',
  fgSubtle: '#9ca3af',
  bg: '#ffffff',
  bgMuted: '#f9fafb',
  bgSubtle: '#f3f4f6',
  border: '#d1d5db',
  borderSubtle: '#e5e7eb',
  selection: '#e0e7ff',
  focusRing: '#3b82f6',
} as const
export type ColorKey = keyof typeof colors

export const radii = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  full: 9999,
} as const
export type RadiusKey = keyof typeof radii

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
  lg: '0 8px 24px rgba(0,0,0,0.12)',
} as const
export type ShadowKey = keyof typeof shadows

export const fontSizes = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 20,
} as const
export type FontSizeKey = keyof typeof fontSizes

/**
 * Install all tokens as CSS variables under the given selector (default :root).
 * Idempotent — call once at app startup.
 */
export function installCssVars(selector = ':root'): void {
  if (typeof document === 'undefined') return
  const lines: string[] = [`${selector} {`]
  for (const [k, v] of Object.entries(spacing)) lines.push(`  --ensemble-spacing-${k}: ${v}px;`)
  for (const [k, v] of Object.entries(colors)) lines.push(`  --ensemble-color-${k}: ${v};`)
  for (const [k, v] of Object.entries(radii))
    lines.push(`  --ensemble-radius-${k}: ${typeof v === 'number' ? `${v}px` : v};`)
  for (const [k, v] of Object.entries(shadows)) lines.push(`  --ensemble-shadow-${k}: ${v};`)
  for (const [k, v] of Object.entries(fontSizes)) lines.push(`  --ensemble-font-${k}: ${v}px;`)
  lines.push('}')
  lines.push(
    `${selector} :is(button, [role="button"], [tabindex], input, textarea, select):focus-visible { outline: 2px solid ${colors.focusRing}; outline-offset: 2px; border-radius: 4px; }`,
  )
  const styleId = 'ensemble-ui-tokens'
  let el = document.getElementById(styleId) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  el.textContent = lines.join('\n')
}
