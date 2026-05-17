import { useTranslation } from 'react-i18next'

export interface PublicRoomBannerProps {
  inPublicRoom: boolean
  onLeave: () => void
}

export function PublicRoomBanner({ inPublicRoom, onLeave }: PublicRoomBannerProps) {
  const { t } = useTranslation()
  if (!inPublicRoom) return null
  return (
    <div
      role="status"
      style={{
        background: 'var(--ens-color-warning-bg, #fef3c7)',
        color: 'var(--ens-color-warning-fg, #78350f)',
        padding: '6px 12px',
        fontSize: 13,
        borderBottom: '1px solid var(--ens-color-warning-border, #fde68a)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>
        ☁ {t('banner.public_room_msg')} <strong>{t('banner.public_room_label')}</strong>
        {t('banner.public_room_warning')}
      </span>
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onLeave}>
        {t('banner.public_room_back')}
      </button>
    </div>
  )
}
