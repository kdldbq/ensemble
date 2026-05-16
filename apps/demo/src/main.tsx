// Univer base styles — required for toolbar, grid, and overlay layout.
// (Univer 0.22 ships CSS separately; consumers must import these.)
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

import { createRoot } from 'react-dom/client'
import { DemoShell } from './components/DemoShell'

// Note: no <StrictMode> — Univer 0.22's internal bootstrap has a 300ms setTimeout
// race with disposal that StrictMode's intentional double-mount trips. Production
// builds don't run effects twice, so this is a dev-only concession.
const root = document.getElementById('root')
if (!root) throw new Error('#root element missing — check index.html')
createRoot(root).render(<DemoShell />)
