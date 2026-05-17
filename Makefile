# ensemble dev convenience. `make` 或 `make help` 看全部命令。
#
# 端口段 5301–5304（避开兄弟项目占用 + 标准服务端口）：
#   5301  Hono server         5302  Vite frontend
#   5303  Postgres (host)     5304  Redis (host)

.DEFAULT_GOAL := help
.PHONY: help setup install migrate dev dev-bg dev-down restart _kill-ports _kill-audit-ports \
        db-up db-down db-logs ps logs \
        build build-libs typecheck test e2e audit verify \
        docs-dev docs-build \
        clean reset

SERVER_PORT       := 5301
WEB_PORT          := 5302
PG_PORT           := 5303
REDIS_PORT        := 5304
AUDIT_SERVER_PORT := 5311
AUDIT_WEB_PORT    := 5312

DEMO_DIR    := apps/demo
DEMO_LOG    := /tmp/ensemble-demo.log

# ───── 主要命令 ─────────────────────────────────────────────────────

help: ## 显示所有命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "  端口: server=$(SERVER_PORT)  web=$(WEB_PORT)  pg=$(PG_PORT)  redis=$(REDIS_PORT)"

install:        ## 装依赖 (pnpm install)
	pnpm install

setup:          ## 首次安装一键化 (install + 起容器 + build server + migrate)
	@echo "==> 1/4 pnpm install"
	@pnpm install
	@echo "==> 2/4 docker compose (pg+redis)"
	@docker compose -f $(DEMO_DIR)/docker-compose.dev.yml up -d --wait
	@echo "==> 3/4 build @ensemble-sheets/server (migrate.js 在 dist/)"
	@pnpm --filter @ensemble-sheets/server build
	@echo "==> 4/4 run db migrations"
	@DATABASE_URL=postgres://postgres:postgres@localhost:$(PG_PORT)/ensemble_dev \
	  pnpm --filter @ensemble-sheets/server exec node dist/db/migrate.js
	@echo ""
	@echo "✓ setup done. 'make dev' 起 demo (浏览器开 http://localhost:$(WEB_PORT))。"

migrate:        ## 跑 DB migrations (server 须先 build; 或直接用 'make setup')
	@DATABASE_URL=postgres://postgres:postgres@localhost:$(PG_PORT)/ensemble_dev \
	  pnpm --filter @ensemble-sheets/server exec node dist/db/migrate.js

# ───── 开发 ─────────────────────────────────────────────────────────

dev: _kill-ports db-up ## 起完整 demo (前台 + 日志可见 + Ctrl-C 一把停)
	@echo "  ▸ web:    http://localhost:$(WEB_PORT)"
	@echo "  ▸ server: http://localhost:$(SERVER_PORT)/healthz"
	@echo "  ▸ Ctrl-C 退出（concurrently 会把 server + vite 都收掉）"
	@pnpm --filter @ensemble-sheets/demo dev

dev-bg: _kill-ports db-up ## 起完整 demo (后台, 日志写到 /tmp; 'make dev-down' 停)
	@nohup pnpm --filter @ensemble-sheets/demo dev > $(DEMO_LOG) 2>&1 &
	@echo -n "waiting for server"; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
		if curl -sf http://localhost:$(SERVER_PORT)/healthz >/dev/null 2>&1; then \
			echo " ✓"; break; \
		fi; \
		echo -n "."; sleep 1; \
	done; \
	echo ""; \
	echo "  ▸ web:    http://localhost:$(WEB_PORT)"; \
	echo "  ▸ server: http://localhost:$(SERVER_PORT)/healthz"; \
	echo "  ▸ log:    tail -f $(DEMO_LOG)"; \
	echo "  ▸ stop:   make dev-down"

dev-down:       ## 停 demo 进程 (适用 dev-bg; 前台 dev 用 Ctrl-C)
	@pkill -f 'tsx src/server-runner' 2>/dev/null || true
	@pkill -f 'apps/demo.*vite' 2>/dev/null || true
	@pkill -f 'concurrently.*pnpm dev' 2>/dev/null || true
	@echo "✓ dev procs stopped (容器仍在; 'make db-down' 一并停)"

restart: dev-down build-libs dev  ## 改了 core/react/server 后用这个 (停旧 + 重建 lib + 前台启)

_kill-ports:
	@for port in $(SERVER_PORT) $(WEB_PORT); do \
		pid=$$(lsof -ti :$$port 2>/dev/null); \
		if [ -n "$$pid" ]; then \
			echo "killing pid $$pid on :$$port"; \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done

_kill-audit-ports:
	@for port in $(AUDIT_SERVER_PORT) $(AUDIT_WEB_PORT); do \
		pid=$$(lsof -ti :$$port 2>/dev/null); \
		if [ -n "$$pid" ]; then \
			echo "killing audit pid $$pid on :$$port"; \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done

# ───── Docker (PG + Redis) ──────────────────────────────────────────

db-up:          ## 起 Postgres + Redis 容器 (等待健康)
	@docker compose -f $(DEMO_DIR)/docker-compose.dev.yml up -d --wait
	@echo "✓ pg on :$(PG_PORT), redis on :$(REDIS_PORT)"

db-down:        ## 停 PG + Redis 容器
	@docker compose -f $(DEMO_DIR)/docker-compose.dev.yml down

db-logs:        ## 容器日志 (tail -f)
	@docker compose -f $(DEMO_DIR)/docker-compose.dev.yml logs -f

ps:             ## 容器状态
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E 'demo-|NAMES' || echo "no demo containers running"

logs:           ## demo dev 进程日志 (tail -f)
	@tail -f $(DEMO_LOG)

# ───── 构建 + 校验 ──────────────────────────────────────────────────

build:          ## 全 workspace build
	pnpm -r run build

build-libs:     ## 只 build demo 依赖的 lib (core+react+server)，比 'build' 快得多
	@pnpm --filter @ensemble-sheets/core run build
	@pnpm --filter @ensemble-sheets/react run build
	@pnpm --filter @ensemble-sheets/server run build

typecheck:      ## 全 workspace typecheck
	pnpm -r run typecheck

test:           ## 全 workspace 单测
	pnpm -r run test

e2e:            ## demo Playwright e2e (5301/5302, 原有 suite)
	pnpm --filter @ensemble-sheets/demo e2e

audit: _kill-audit-ports  ## v0.1 capability audit (独立 5311/5312, 不动你的 dev)
	@cd $(DEMO_DIR) && pnpm exec playwright test \
		--config e2e/playwright.audit.config.ts --reporter=line; \
	  status=$$?; \
	  $(MAKE) _kill-audit-ports >/dev/null 2>&1; \
	  exit $$status

verify: typecheck test build-libs audit  ## 完整 pre-ship 校验 (typecheck + 全测 + lib build + audit)
	@echo ""
	@echo "✓ verify pipeline 全通过 — ready to ship"

# ───── 文档站 ───────────────────────────────────────────────────────

docs-dev:       ## Astro Starlight 本地预览 (默认 :4321)
	pnpm --filter @ensemble-sheets/docs dev

docs-build:     ## Astro Starlight build
	pnpm --filter @ensemble-sheets/docs build

# ───── 清理 ─────────────────────────────────────────────────────────

clean:          ## 清 dist + vite/astro cache (留 node_modules)
	@rm -rf packages/*/dist apps/demo/dist apps/docs/dist apps/docs/.astro node_modules/.vite apps/demo/node_modules/.vite
	@echo "✓ cleaned dist + caches"

reset: dev-down db-down clean ## 大扫除 (停进程 + 停容器 + 清产物)
	@echo "✓ reset done. 再跑 'make install && make dev'."
