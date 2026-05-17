import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enUS from './locales/en-US.json'
import zhCN from './locales/zh-CN.json'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const STORAGE_KEY = 'ev_demo_locale'

function detectLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'zh-CN'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as SupportedLocale
    }
  } catch {
    /* localStorage unavailable */
  }
  const nav = window.navigator.language ?? 'zh-CN'
  if (nav.startsWith('zh')) return 'zh-CN'
  return 'en-US'
}

export function initI18n(): typeof i18n {
  void i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': { translation: zhCN },
      'en-US': { translation: enUS },
    },
    lng: detectLocale(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  return i18n
}

export function setLocale(locale: SupportedLocale): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* ignore */
    }
  }
  void i18n.changeLanguage(locale)
}

export function currentLocale(): SupportedLocale {
  const lng = i18n.language as SupportedLocale
  return (SUPPORTED_LOCALES as readonly string[]).includes(lng) ? lng : 'zh-CN'
}

export { default as i18n } from 'i18next'
