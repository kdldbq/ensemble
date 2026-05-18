import type { Preview } from '@storybook/react'

const preview: Preview = {
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
}

export default preview
