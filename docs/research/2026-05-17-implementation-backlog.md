# ensemble v0.2-v0.4 全量实施清单

*生成: 2026-05-17*
*基线: v0.1.0 GA (commit f8e4e40)*
*范围决策: 仅 spreadsheet 品类。doc/slide/form/mindmap/flowchart/pdf 品类、智能表（多维表）、微信/QQ/企微小程序、iOS/Android 原生 App 已永久 NON-GOAL（用户 2026-05-17 决定）*
*合并来源: 腾讯文档对比报告 + folder UX 深度审计 + demo UX 审计*

---

## 总览

| 指标 | 数值 |
|---|---|
| 总项数 | ~150 项 |
| 估时合计 | ~200 工时（人天） |
| 周期估算 | 1.5 人配比 → ~17 周；2 人 → ~13 周；4 人 → ~7 周 |
| 模块数 | 13 个（A-M） |
| P0 项（撞硬崖） | 8 |
| P1 项（最低期望线） | 70+ |
| P2 项（差异化） | 60+ |
| P3 项（性能/兼容/锦上添花） | 10+ |

## 优先级图例

- **P0** — 协作底座必须，用户立刻撞硬崖（v0.2 必含）
- **P1** — 用户可感知短板，对齐协作产品最低期望线（v0.2-v0.3 必含）
- **P2** — 差异化突围 / 反向优势深化（v0.3-v0.4）
- **P3** — 性能 / 兼容 / 锦上添花（v0.4+ 视情况）

## 估时图例

`0.5d` / `1d` / `2d` / `3d` / `5d` / `10d` — 单人份工日，含基础测试。复杂度高的项已 spike 但未细化时给区间。

---

## A. Folder & 文件管理（28 项 / 24d）

> 用户明确指出 folder UX 是最大痛点。FolderNavigator 当前只渲染 root，子文件夹完全不可见，schema 缺 position，无拖拽/面包屑/搜索/右键。整块需要重做。

### A.1 数据层 schema（6 项 / 4d）

- [ ] **A1.1** (P1, 1d) folder.position INT 字段 + drizzle migration — `packages/server/src/db/schema.ts:25-37`
- [ ] **A1.2** (P1, 0.5d) workbook.position INT 字段（folder 内排序）— 同上 :39-51
- [ ] **A1.3** (P1, 0.5d) pathDepth ≤ 10 约束（cycle 检测已存在）— `packages/server/src/services/folder-service.ts:5-20`
- [ ] **A1.4** (P1, 0.5d) (tenantId, parentId) 复合索引 — drizzle schema
- [ ] **A1.5** (P1, 1d) folder.deletedAt timestamp（回收站排序用）— schema.ts
- [ ] **A1.6** (P1, 0.5d) folder name 长度约束 1-128 + name pattern 校验 — schema/validation

### A.2 后端 API（10 项 / 7d）

- [ ] **A2.1** (P1, 1d) `GET /api/v1/folders` 支持 `?tree=true&limit&offset` — `http/routes/folders.ts:8-20`
- [ ] **A2.2** (P1, 1d) `GET /api/v1/folders/:id/children`（subfolders + workbooks）— 新端点
- [ ] **A2.3** (P0, 0.5d) `POST/PATCH /api/v1/folders` 同级同名 422 + trim/校验 — folders.ts:21-84
- [ ] **A2.4** (P1, 1d) `PATCH /api/v1/folders/:id/reorder`（拖拽排序）body: `{newPosition, newParentId?}`
- [ ] **A2.5** (P1, 0.5d) `PATCH /api/v1/workbooks/:id` 支持改 folderId — `http/routes/workbooks.ts`
- [ ] **A2.6** (P1, 1d) `POST /api/v1/folders/:id/restore` 恢复软删除 — 新端点
- [ ] **A2.7** (P1, 1d) `DELETE /api/v1/folders/:id?cascade=true` 子项级联 / 默认 409 含子项数 — folders.ts:86
- [ ] **A2.8** (P1, 0.5d) `POST /api/v1/folders/batch` 批量删除 / 移动 — 新端点
- [ ] **A2.9** (P1, 0.5d) `GET /api/v1/folders/trash` 回收站列表 — 新端点
- [ ] **A2.10** (P1, 0.5d) folder 操作的 audit_log event emit — folders.ts 各端点

### A.3 React 组件重写（8 项 / 9d）

- [ ] **A3.1** (P0, 3d) **`FolderTree.tsx` 递归 TreeNode** + buildTree(flat) + 展开收起持久化 localStorage — 新建 `packages/react/src/FolderTree.tsx`（替换 FolderNavigator 现有 root-only 渲染）
- [ ] **A3.2** (P1, 1d) `FolderBreadcrumb.tsx` 当前路径 + 点击回退 — 新建
- [ ] **A3.3** (P1, 0.5d) `FolderContextMenu.tsx` 右键菜单（新建子项 / 重命名 / 移动 / 删除 / 复制链接）— 新建
- [ ] **A3.4** (P1, 1d) 搜索框 + 实时过滤（高亮匹配）+ Ctrl+K 快捷键 — `FolderTree.tsx`
- [ ] **A3.5** (P1, 1d) Inline rename + F2 + Esc 取消 + Enter 确认 — `FolderTree.tsx`
- [ ] **A3.6** (P1, 0.5d) 在选中节点下新建子文件夹（替代硬编码 `parentId:null`）— `FolderNavigator.tsx:68`
- [ ] **A3.7** (P1, 1d) 三态统一（loading skeleton / 空状态 / 错误 + retry）
- [ ] **A3.8** (P1, 1d) 拖拽（**dnd-kit**）：reorder + move-into + 视觉指示器

### A.4 交互 / UX（4 项 / 4d）

- [ ] **A4.1** (P1, 1d) 多选（Shift/Ctrl）+ 批量删除 / 移动
- [ ] **A4.2** (P1, 1d) 删除 undo toast（5s 内可撤销）— 配合 F1 toast 系统
- [ ] **A4.3** (P1, 1d) 回收站视图（独立 tab，deletedAt 排序，restore 按钮）
- [ ] **A4.4** (P1, 1d) workbook 卡片 → folder 拖拽 + folder 内 workbook 显示

---

## B. 协作底座（13 项 / 26d）

### B.1 实时同步（4 项 / 5.5d）

- [ ] **B1.1** (P0, 2d) 多人光标连续同步：独立 WS 帧 `cursor_update` throttle 30Hz — `packages/server/src/realtime/`
- [ ] **B1.2** (P0, 2d) 选区高亮：WS 帧 `selection_update`（userId+color+range）+ Univer overlay 渲染
- [ ] **B1.3** (P0, 0.5d) presence.selection 字段真实实现（不止心跳）— `presence-tracker.ts:50`
- [ ] **B1.4** (P1, 1d) 远程用户颜色分配（hash userId → palette[8]）+ 头像 hover

### B.2 评论 / 批注（5 项 / 7d）

- [ ] **B2.1** (P1, 2d) `comments` 表 schema + migration（id / workbookId / threadId / cellRef / body / authorId / parentId / ts / resolved）
- [ ] **B2.2** (P1, 1d) `POST/GET/PATCH/DELETE /api/v1/workbooks/:id/comments`
- [ ] **B2.3** (P1, 2d) Univer thread-comment 插件 UI 包装 — `packages/core/src/univer-wrapper.ts:182-185`
- [ ] **B2.4** (P1, 1d) 评论 resolve / unresolve 状态 + 过滤
- [ ] **B2.5** (P1, 1d) `canComment` 第 4 capability — `adapters/identity.ts:15-23`

### B.3 @mention（3 项 / 3d）

- [ ] **B3.1** (P1, 1d) `mentions` 表 + body 解析 `@userId`
- [ ] **B3.2** (P1, 1d) 评论输入框 `@` 触发用户选择 popup
- [ ] **B3.3** (P1, 1d) `comment.mentioned` event emit + WebhookAdapter 通知

### B.4 协作模式（differentiator）（1 项 / 10d）

- [ ] **B4.1** (P2, 10d) **CRDT 模式作为 cell-lock 替代选项**，host 配置切换；写 ADR-0003 文档化两种模式取舍 — 新增 `packages/server/src/services/crdt-mode.ts`

---

## C. 表格能力（13 项 / 22d）

### C.1 内置能力包装（4 项 / 4.5d）

- [ ] **C1.1** (P1, 2d) 图表 UI ribbon 入口（drawing 插件已注册）— `univer-wrapper.ts:179`
- [ ] **C1.2** (P1, 1d) 冻结行列 UI 包装 — Univer 已支持
- [ ] **C1.3** (P1, 0.5d) 评论者角色（见 B2.5）
- [ ] **C1.4** (P2, 1d) 自定义函数暴露（Univer 底座支持）

### C.2 新增能力（5 项 / 11d）

- [ ] **C2.1** (P1, 4d) 数据透视表（评估 `@univerjs/sheets-pivot` 是否存在，缺则自建）
- [ ] **C2.2** (P2, 2d) 智能填充（fill handle 模式识别）
- [ ] **C2.3** (P2, 3d) 跨表 / 跨工作簿引用
- [ ] **C2.4** (P1, 1d) CSV 导入（papaparse 客户端解析）— `apps/demo/src/components/TopBar.tsx` 上传逻辑扩
- [ ] **C2.5** (P3, 1d) 图片→表格 OCR（依赖 AI，可放 G）

### C.3 范围保护（持久 ACL）（4 项 / 6d）

- [ ] **C3.1** (P1, 1d) `range_protections` 表（workbookId / sheetId / range / allowedUserIds / allowedRoles）
- [ ] **C3.2** (P1, 2d) `POST/GET/DELETE /api/v1/workbooks/:id/protections`
- [ ] **C3.3** (P1, 2d) mutation 检查叠加 protection 规则 — `mutation-broadcaster.ts` 前置
- [ ] **C3.4** (P1, 1d) sheet-level 保护(特例 range = 整 sheet）

### C.4 性能 / 规模（1 项 / 2d）

- [ ] **C4.1** (P1, 2d) 10 万行性能基准 + 优化（lazy load / 虚拟化）— 新增 `apps/demo/e2e/perf-benchmark.spec.ts`

---

## D. 权限 / 安全（10 项 / 12d）

- [ ] **D1** (P1, 2d) 链接密码：`grants.passwordHash` + `POST /grants/:token/verify` + 弹窗
- [ ] **D2** (P1, 1d) 水印 overlay（mount opts `watermark: {text, opacity}`）— `core/src/mount.ts`
- [ ] **D3** (P2, 2d) IP 白名单（grants.allowedIPs jsonb）+ middleware
- [ ] **D4** (P2, 1d) 禁止复制 / 下载 / 打印（capability + 前端拦截）
- [ ] **D5** (P2, 1d) 防截屏（CSS user-select:none / 失焦模糊；尽力而为）
- [ ] **D6** (P1, 1d) 协作历史时间线 UI（audit_log 上层）— Demo 新增组件
- [ ] **D7** (P2, 2d) 实时风险预警（mutation 流式规则匹配，超频 / 跨租户 / 异常 IP）
- [ ] **D8** (P2, 1d) 离职交接（`IdentityAdapter.handoff(userId, toUserId)`）
- [ ] **D9** (P1, 0.5d) 回收站视图（见 A4.3）
- [ ] **D10** (P1, 0.5d) folder 软删除 cascade 选项（见 A2.7）

---

## E. 历史版本（4 项 / 6d）

- [ ] **E1** (P2, 3d) 版本对比 diff（cell-level diff 算法 + 差异 highlight）— 新增 `services/version-diff.ts`
- [ ] **E2** (P2, 1d) 历史版本权限隔离（snapshot 不重算 mask 的修复）— `version-service.ts`
- [ ] **E3** (P1, 1d) 命名版本 UI 改进（描述字段 / tag）— `VersionDrawer.tsx`
- [ ] **E4** (P1, 1d) 恢复后成功 toast + 自动跳转到该版本

---

## F. Demo / UX 修补（22 项 / 22d）

### F.1 Toast 系统（4 项 / 2.5d）

- [ ] **F1.1** (P1, 1d) 接入 `sonner` 或 `react-hot-toast`（不要自写）— 替换 `TopBar.tsx:44-51, 232-250`
- [ ] **F1.2** (P1, 0.5d) Toast 分类：info / success / warning / error 颜色 + 图标
- [ ] **F1.3** (P1, 0.5d) Error 类延长到 10s + 手动关闭按钮
- [ ] **F1.4** (P1, 0.5d) Stack 多条并显（最多 5 条，溢出聚合）

### F.2 ShareDialog 重做（4 项 / 2.5d）

- [ ] **F2.1** (P1, 0.5d) 成功后 `navigator.clipboard.writeText(link)` + 「已复制」反馈
- [ ] **F2.2** (P1, 1d) 「已分享清单」视图 + 撤销 — 需 `GET /grants?workbookId=`
- [ ] **F2.3** (P1, 0.5d) 高级选项折叠：密码 / IP 白名单 / 过期
- [ ] **F2.4** (P1, 0.5d) 权限继承说明（「此 grant 来自父文件夹」）

### F.3 OnboardingCoach 重做（3 项 / 3d）

- [ ] **F3.1** (P1, 2d) 改 coachmark 分步（5 步逐次高亮目标元素）— `OnboardingCoach.tsx:28-112`
- [ ] **F3.2** (P1, 0.5d) 右上角悬浮，避免遮挡底部 UI
- [ ] **F3.3** (P1, 0.5d) 「跳过引导」按钮 + localStorage 持久化

### F.4 三态统一（2 项 / 2d）

- [ ] **F4.1** (P1, 1d) `useAsyncState<T>` hook：`{data, loading, error, retry}` — 新增 `apps/demo/src/hooks/`
- [ ] **F4.2** (P1, 1d) Loading skeleton + 空状态 + 错误组件三件套

### F.5 设计系统（4 项 / 4d）

- [ ] **F5.1** (P1, 2d) `<Button>` + variants (primary/secondary/danger/ghost) + sizes (sm/md/lg) — 新增 `packages/react/src/ui/`
- [ ] **F5.2** (P1, 1d) `<Input>` + `<Select>` + `<Textarea>` 统一样式
- [ ] **F5.3** (P1, 0.5d) Spacing scale (4/8/12/16/24/32) + CSS variables
- [ ] **F5.4** (P1, 0.5d) Color palette + dark mode 占位

### F.6 a11y 基础(4 项 / 3.5d）

- [ ] **F6.1** (P1, 1d) Drawer `role="dialog" aria-modal="true"` + focus trap — 多个 Drawer 组件
- [ ] **F6.2** (P1, 1d) FolderTree `role="tree"` / `role="treeitem"` + ↑↓ Enter F2 Delete 键盘
- [ ] **F6.3** (P1, 0.5d) Focus ring 统一样式（focus-visible）
- [ ] **F6.4** (P2, 1d) 全局快捷键：Cmd/Ctrl+K 搜索 / ? 帮助 / Esc 关闭抽屉

### F.7 其他 UX（4 项 / 3d）

- [ ] **F7.1** (P1, 1d) WorkbookEditor key remount 修复（mutation observer 模式）— `SingleEditor.tsx:36-120`
- [ ] **F7.2** (P1, 0.5d) Dirty flag + beforeunload 提示
- [ ] **F7.3** (P1, 0.5d) Persona 切换后 toast 反馈 + 新窗口加载完成 ping — `TopBar.tsx:199-216`
- [ ] **F7.4** (P2, 1d) 窄屏响应（< 1200px 隐藏 ViewerPreview / icon-only TopBar）

---

## G. AI 能力（8 项 / 16d）

### G.1 基础设施（3 项 / 3.5d）

- [ ] **G1.1** (P2, 2d) `LLMAdapter` 接口 + 参考实现（OpenAI 兼容）— 新增 `packages/llm-adapter/`
- [ ] **G1.2** (P2, 1d) host 配置：endpoint + apiKey + model + provider
- [ ] **G1.3** (P2, 0.5d) 流式响应（SSE）支持

### G.2 表格 AI 能力（4 项 / 10d）

- [ ] **G2.1** (P1, 3d) AI 公式生成：单元格 `=` 后 popover + `POST /api/v1/ai/formula`
- [ ] **G2.2** (P1, 2d) AI 智能分列：粘贴大段文本识别分列
- [ ] **G2.3** (P2, 3d) AI 数据问答（对话式 BI）：选区 + 问题 → 公式 / 图表
- [ ] **G2.4** (P2, 2d) AI 生成图表：选区 → 推荐图表类型 + 数据映射

### G.3 治理（1 项 / 2d）

- [ ] **G3.1** (P2, 2d) Agent 管理：host 控制可用 LLM、quota、审计

---

## H. OpenAPI / 集成（9 项 / 14d）

- [ ] **H1** (P1, 2d) 单元格批量读写 API：`POST /api/v1/workbooks/:id/range/read|write`（对标腾讯 `batch_update_sheet_range`）
- [ ] **H2** (P1, 1d) Webhook 签名版本化（v1 secret + HMAC-SHA256）— `WebhookAdapter`
- [ ] **H3** (P1, 1d) Webhook 重试（指数退避 + 死信队列）— 新增 `services/webhook-retry.ts`
- [ ] **H4** (P2, 4d) **MCP Server**（spreadsheet 工具集：read_range / write_range / create_workbook / mask_view / export_xlsx）— 新建 `packages/mcp-server/`
- [ ] **H5** (P2, 3d) OAuth 2.0 授权码模式（adapter 模式可外接 host）— `packages/oauth-adapter/`
- [ ] **H6** (P3, 1d) API 限流改 per-token / per-route 粒度 — `server.ts:154`
- [ ] **H7** (P3, 1d) OpenAPI / Swagger schema 自动生成 + `/docs` 端点
- [ ] **H8** (P1, 0.5d) Webhook 事件类型扩：comment.created / mention / range-protection.changed
- [ ] **H9** (P2, 0.5d) iPaaS 兼容性测试（Zapier / HiFlow 接入示例）— `examples/`

---

## I. 可观测性 / 运维（9 项 / 9d）

- [ ] **I1** (P1, 0.5d) `pino` 结构化日志替换 `console.*`
- [ ] **I2** (P1, 0.5d) `GET /api/v1/healthz` 显式端点 + 子系统状态（db / redis / version / uptime）
- [ ] **I3** (P2, 2d) OTEL metrics（请求耗时 / WS 连接数 / cell-lock 命中率 / mutation 吞吐）
- [ ] **I4** (P2, 2d) OTEL trace（HTTP → WS → DB → Redis 全链路）
- [ ] **I5** (P2, 2d) 管理后台 dashboard：活跃用户 / 容量 / 审计预览 — 新增 `apps/admin/`
- [ ] **I6** (P2, 1d) 文档使用统计（audit_log 聚合 SQL）+ admin 查询接口
- [ ] **I7** (P2, 1d) Rate limit per-user / per-tenant（现仅全局 token bucket）
- [ ] **I8** (P3, 1d) Sentry / error tracking 接入点（adapter 模式）
- [ ] **I9** (P3, 1d) 性能 budget 检查（bundle size / TBT / LCP）— CI

---

## J. 多端 / 离线（8 项 / 14.5d）

- [ ] **J1** (P2, 5d) **桌面端 Tauri 包装**（共享 web 代码 + 离线 IndexedDB）— 新增 `apps/desktop/`
- [ ] **J2** (P2, 3d) 离线编辑 IndexedDB + 同步队列（WS 重连后 replay）
- [ ] **J3** (P2, 1d) Service Worker 缓存策略 — apps/demo
- [ ] **J4** (P2, 1d) PDF 导出（puppeteer 或 html2pdf）— `services/pdf-export.ts`
- [ ] **J5** (P3, 1d) 窄屏 web 优化（见 F7.4）
- [ ] **J6** (P3, 0.5d) PWA manifest + iOS Add to Home — apps/demo
- [ ] **J7** (P3, 2d) Electron 备选 spike（如果 Tauri 不适配）
- [ ] **J8** (P3, 1d) Tauri 自动更新 + 代码签名（macOS Notarization / Win Authenticode）

---

## K. 国际化 / 无障碍（8 项 / 8d）

- [ ] **K1** (P1, 1d) i18n 框架接入（`i18next` + `react-i18next`）
- [ ] **K2** (P1, 1d) zh-CN / en-US 双语提取所有硬编码字符串 + `pnpm extract-strings` 脚本
- [ ] **K3** (P2, 2d) WCAG 2.2 AA 合规审计 + 修复（axe-core CI）
- [ ] **K4** (P2, 1d) WCAG 合规声明文档（VPAT 表）— docs/
- [ ] **K5** (P1, 1d) 键盘快捷键全面（Excel 兼容）+ `?` 弹出帮助
- [ ] **K6** (P2, 1d) RTL 支持检查（阿拉伯语等）
- [ ] **K7** (P2, 0.5d) 高对比度主题
- [ ] **K8** (P3, 0.5d) 屏幕阅读器测试（VoiceOver + NVDA）

---

## L. 企业治理（10 项 / 14d）

- [ ] **L1** (P2, 3d) **SCIM 2.0** 用户 / 组同步（adapter 接口 + 参考实现）— 新增 `packages/scim-adapter/`
- [ ] **L2** (P2, 2d) 单元格级合规审计（mutation 链式哈希 actor + mask 结果 + Merkle）— `services/audit-chain.ts`
- [ ] **L3** (P2, 2d) 企业 DLP（见 D7）
- [ ] **L4** (P2, 1d) 离职交接 adapter（见 D8）
- [ ] **L5** (P2, 2d) 共享空间多层级权限（spaceType 扩展 + 角色继承）
- [ ] **L6** (P2, 1d) 数据看板（见 I5）
- [ ] **L7** (P3, 1d) 审批流（adapter 接口，host 实现）
- [ ] **L8** (P3, 1d) 许可证 / 席位管理（adapter）
- [ ] **L9** (P3, 0.5d) 模板管理（host 实现）
- [ ] **L10** (P3, 0.5d) 企业个性化（品牌色 / Logo / 系统外观）— mount opts 扩展

---

## M. 测试 / 部署 / DevX（13 项 / 13d）

### M.1 测试（6 项 / 7d）

- [ ] **M1.1** (P1, 1d) e2e 套件扩到 folder 新能力（树渲染 / 拖拽 / 搜索 / 多选 / undo）
- [ ] **M1.2** (P1, 1d) e2e 套件扩到评论 / mention / 连续光标 / 选区
- [ ] **M1.3** (P1, 2d) 性能基准 e2e（10 万行 / 100 并发 user / 1000 mutation/min）
- [ ] **M1.4** (P1, 1d) Chaos 测试（Redis 挂 / WS 重连 / 网络抖动）
- [ ] **M1.5** (P1, 1d) a11y 自动测试（axe-core CI）
- [ ] **M1.6** (P2, 1d) Visual regression（Playwright screenshot diff）

### M.2 部署（4 项 / 5d）

- [ ] **M2.1** (P2, 2d) **Helm chart** 公开 — 新增 `deploy/helm/`
- [ ] **M2.2** (P2, 1d) `docker-compose.prod.yml`（含 nginx / postgres / redis / 监控）
- [ ] **M2.3** (P2, 1d) Terraform module（AWS / Aliyun 一键部署）— 新增 `deploy/terraform/`
- [ ] **M2.4** (P3, 1d) systemd service 文件（裸金属部署）

### M.3 DevX（3 项 / 1.5d）

- [ ] **M3.1** (P1, 0.5d) `Makefile` 文档化（`make help` target）
- [ ] **M3.2** (P1, 0.5d) `CONTRIBUTING.md` 完善：开发 / 测试 / PR 模板
- [ ] **M3.3** (P2, 0.5d) Storybook（组件库可视化）— `apps/storybook/`

---

## 永久 NON-GOAL（明确不做）

| 项 | 不做的原因 |
|---|---|
| 在线文档（doc）品类 | 2026-05-17 用户决策：只做表格 |
| 在线幻灯片（slide）品类 | 同上 |
| 收集表 / 表单 品类 | 同上 |
| 智能文档 / 类 Notion 品类 | 同上 |
| 智能表 / 多维表（Bitable）品类 | 不同范式，非 spreadsheet |
| 思维导图 / 流程图 品类 | 同上 |
| PDF 阅读 / 批注 品类 | 同上（PDF 导出仍保留 J4） |
| 智能白板 品类 | 同上 |
| 微信 / QQ / 企微小程序 | 生态闭环，开源 SDK 无意义 |
| iOS / Android 原生 App | 桌面端 Tauri 替代 |
| 二次密码（QQ 登录） | 生态绑定，无通用价值 |
| 完整 OEM 白标 | 开源天然支持，无需单做 |
| 防截屏（强力级） | 浏览器层不可靠（D5 仅做尽力而为） |
| 多文件 AI 综述 | 依赖 doc 品类 |
| AI PPT 一键直出 | 同上 |
| AI 思维导图生成 | 同上 |

---

## Sprint 推荐排序（6 sprint / 15 周）

按"用户立刻感知"和"依赖链"双向排序。

### Sprint 1（2 周）— 数据底座 + 低风险快速胜利

| 项 | 类别 | 估时 |
|---|---|---|
| A1.1-A1.6 folder schema 全套 | folder | 4d |
| A2.1-A2.10 folder API 全套 | folder | 7d |
| I1 pino 日志 | observability | 0.5d |
| I2 健康检查 | observability | 0.5d |
| C2.4 CSV 导入 | sheet | 1d |
| D2 水印 | security | 1d |
| F1 toast 系统（含 4 子项） | UX | 2.5d |
| M3.1-M3.2 Makefile + CONTRIBUTING | devx | 1d |

合计：~17.5d

### Sprint 2（3 周）— folder 树能用 + 协作底座

| 项 | 类别 | 估时 |
|---|---|---|
| A3.1-A3.8 FolderTree 重写全套 | folder | 9d |
| A4.1-A4.4 folder 交互 | folder | 4d |
| F6.1-F6.3 a11y 基础 | UX | 2.5d |
| F4 三态统一 | UX | 2d |
| B1.1-B1.4 连续光标 + 选区 | collab | 5.5d |

合计：~23d

### Sprint 3（2 周）— 协作能看见 + 设计系统

| 项 | 类别 | 估时 |
|---|---|---|
| B2.1-B2.5 评论 / 批注 | collab | 7d |
| F5.1-F5.4 设计系统 | UX | 4d |
| F7.1-F7.3 WorkbookEditor 修复 + persona | UX | 2d |
| K1-K2 i18n | i18n | 2d |

合计：~15d

### Sprint 4（2 周）— 分享 + 表格能力

| 项 | 类别 | 估时 |
|---|---|---|
| B3.1-B3.3 @mention | collab | 3d |
| D1 链接密码 | security | 2d |
| F2.1-F2.4 ShareDialog 重做 | UX | 2.5d |
| C1.1-C1.2 图表 + 冻结 UI | sheet | 3d |
| C3.1-C3.4 范围保护 | sheet | 6d |
| D6 协作历史时间线 | security | 1d |

合计：~17.5d

### Sprint 5（3 周）— AI + 透视 + 集成

| 项 | 类别 | 估时 |
|---|---|---|
| C2.1 数据透视表 | sheet | 4d |
| G1.1-G1.3 LLMAdapter | AI | 3.5d |
| G2.1-G2.2 AI 公式 + 智能分列 | AI | 5d |
| H1 单元格批量读写 API | openapi | 2d |
| H2-H3 Webhook 签名 + 重试 | openapi | 2d |
| F3.1-F3.3 OnboardingCoach 重做 | UX | 3d |
| E3-E4 版本 UI 改进 | versioning | 2d |

合计：~21.5d

### Sprint 6（3 周）— 企业治理 + 差异化深耕

| 项 | 类别 | 估时 |
|---|---|---|
| H4 MCP Server | openapi | 4d |
| I3-I4 OTEL metric + trace | observability | 4d |
| I5 管理后台 dashboard | observability | 2d |
| L1 SCIM 2.0 | enterprise | 3d |
| L2 合规级审计 | enterprise | 2d |
| K3-K4 WCAG 合规 | i18n | 3d |
| M1.3 性能基准 e2e | testing | 2d |

合计：~20d

### 后续（v0.5+）

- B4.1 **CRDT 模式（10d 大块，需 spike）**
- C2.2-C2.3 智能填充 + 跨表引用
- G2.3-G2.4 AI BI + 图表生成
- J1-J3 桌面端 + 离线
- D3-D5 / D7-D8 高级安全
- E1-E2 版本 diff
- 剩余 P3 项

---

## 跨 sprint 持续关注

- 单测覆盖率维持 90%+ per-file（已 baseline）
- 每个 sprint 末跑一次完整 e2e（capability audit 套件扩展）
- 每个新能力都进 ADR 或 spec（如有架构决策）
- 每个新 endpoint 进 OpenAPI schema（H7 一旦完成则自动）

---

## 开工前需定的 5 个决策

1. **递归 vs 虚拟化树**：用户 folder 数量预期？< 500 直接递归；> 500 用 `react-arborist`
2. **DnD 库**：推荐 `dnd-kit`（modern，键盘 a11y，轻量）；不要 `react-dnd`
3. **Toast 实现**：直接用 `sonner`（推荐）或 `react-hot-toast`；不要自写
4. **LLMAdapter 接口范围**：第一版只暴露 `generateFormula` 和 `detectColumns`；不做全 chat
5. **CRDT 库选型**：Yjs（最成熟）vs Automerge vs 自写；如选 Yjs 需评估与 Univer 兼容性（spike 1-2d）

---

*本 backlog 是 v0.2-v0.4 的实施基线。每个 sprint 开工前应转 GitHub Issues 并 review 估时，因为细化后通常会有 +20-30% 偏差。*
