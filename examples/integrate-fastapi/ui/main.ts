import { createApp, h } from 'vue'
import { WorkbookEditor } from '@ensemble/vue'

async function getToken(): Promise<string> {
  const r = await fetch('http://localhost:8000/issue-token?user_id=alice&tenant_id=00000000-0000-0000-0000-000000000001', { method: 'POST' })
  const { token } = await r.json() as { token: string }
  return token
}

const App = {
  setup() {
    return () => h(WorkbookEditor, {
      workbookId: '<paste-a-workbook-uuid>',
      apiBaseUrl: 'http://localhost:3000',
      wsBaseUrl: 'ws://localhost:3000',
      token: getToken,
    })
  },
}

createApp(App).mount('#app')
