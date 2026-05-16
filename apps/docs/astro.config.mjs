import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    starlight({
      title: 'ensemble',
      description: 'Open-source collaborative spreadsheet platform',
      social: { github: 'https://github.com/kdldbq/ensemble' },
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'Introduction', link: '/' },
            { label: 'Quickstart', link: '/quickstart/' },
          ],
        },
        {
          label: 'API reference',
          items: [
            { label: 'REST endpoints', link: '/api/rest/' },
            { label: 'WebSocket protocol', link: '/api/ws-protocol/' },
          ],
        },
        {
          label: 'Integration',
          items: [
            { label: 'TypeScript host', link: '/integration/typescript/' },
            { label: 'Webhook (any-language) host', link: '/integration/webhook/' },
            { label: 'FastAPI host', link: '/integration/fastapi/' },
          ],
        },
      ],
    }),
  ],
})
