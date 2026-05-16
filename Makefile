# ensemble dev convenience. `make` 或 `make help` 看全部命令。
#
# 端口段 5301–5304（避开兄弟项目占用 + 标准服务端口）：
#   5301  Hono server         5302  Vite frontend
#   5303  Postgres (host)     5304  Redis (host)

.DEFAULT_GOAL := help
.PHONY: help install dev dev-fg dev-down _kill-ports \
        db-up db-down db-logs ps logs \
        build typecheck test e2e \
        docs-dev docs-build \
        clean reset

SERVER_PORT := 5301
WEB_PORT    := 5302
PG_PORT     := 5303
REDIS_PORT  := 5304

DEMO_DIR    := apps/demo
DEMO_LOG    := /tmp/ensemble-demo.log

# ───── 主要命令 ─────────────────────────────────────────────────────

help: ## 显示所有命令
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "  端口: server=$(SERVER_PORT)  web=$(WEB_PORT)  pg=$(PG_PORT)  redis=$(REDIS_PORT)"

install:        ## 装依赖 (pnpm install)
	pnpm install

# ───── 开发 ─────────────────────────────────────────────────────────

dev: _kill-ports db-up ## 起完整 demo (后台跑 server+vite, 浏览器开 :5302)
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

dev-fg: _kill-ports db-up ## 起完整 demo (前台, Ctrl-C 退出)
	pnpm --filter @ensemble-sheets/demo dev

dev-down:       ## 停 demo 进程 (保留容器)
	@pkill -f 'tsx src/server-runner' 2>/dev/null || true
	@pkill -f 'apps/demo.*vite' 2>/dev/null || true
	@pkill -f 'concurrently.*pnpm dev' 2>/dev/null || true
	@echo "✓ dev procs stopped (容器仍在; 'make db-down' 一并停)"

_kill-ports:
	@for port in $(SERVER_PORT) $(WEB_PORT); do \
		pid=$$(lsof -ti :$$port 2>/dev/null); \
		if [ -n "$$pid" ]; then \
			echo "killing pid $$pid on :$$port"; \
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

typecheck:      ## 全 workspace typecheck
	pnpm -r run typecheck

test:           ## 全 workspace 单测
	pnpm -r run test

e2e:            ## demo Playwright e2e
	pnpm --filter @ensemble-sheets/demo e2e

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
