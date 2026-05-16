# FastAPI ensemble integration example

Integrates ensemble into a Python / FastAPI host:

1. Issues JWTs for your users (demo only; replace with real auth)
2. Exposes the 3 ensemble webhook endpoints (identity / permission / event)
3. Embeds Vue `<WorkbookEditor>` in a static HTML page

## Run

Terminal 1 — FastAPI host:

```bash
cd examples/integrate-fastapi
poetry install
HOST_SECRET=dev-secret poetry run uvicorn app.main:app --reload
```

Terminal 2 — ensemble server pointed at the FastAPI host (build a runner
based on `apps/demo/src/server-runner.ts`, swapping in `WebhookAdapter`
variants pointed at http://localhost:8000).

Terminal 3 — UI:

```bash
cd examples/integrate-fastapi/ui
pnpm dlx serve .
```
