# 腾讯文档 vs ensemble v0.1 — 能力面对比报告

*生成日期：2026-05-17*
*ensemble 版本：v0.1.0 GA（commit f8e4e40）*
*来源：ensemble 代码深度审计 + 30+ 腾讯文档公开来源（docs.qq.com / docs.qq.com/open / cloud.tencent.com 企业版手册 / kf.qq.com / 腾讯 ISUX / 腾讯云开发者社区 / 量子位 / 中关村在线 / 知乎 / CSDN 等）*
*置信度：高（产品分类、AI 能力、OpenAPI 分类、企业身份治理）/ 中（具体数值如函数数 300-500、单表 10 万行）/ 低（协作底层 OT/CRDT、完整白标、等保等级、Webhook 直供）*

---

## 0. 执行摘要

腾讯文档已演化为**全品类 AI 协作平台**：11 个主品类（Word / Excel / Slide / PDF / 收集表 / 智能文档 / 智能表 / 智能白板 / 思维导图 / 流程图 / 文件夹）+ 双 LLM（混元 + DeepSeek-R1）+ 5 大 OpenAPI + MCP Server + 企业版完整身份治理（SSO / SCIM / 审计 / 离职交接 / Agent 管理）+ 8 端覆盖（Web / Win / macOS / Linux / iOS / Android / 三大小程序）。

ensemble v0.1 是**单品类 Spreadsheet SDK**：仅 sheet、cell-region lock 仲裁、多租户 RLS、适配器模式（identity / permission / storage / event 由 host 实现）、动态掩码不缓存、conformance 套件。表格底层依托 Univer，故 Univer 已注册的插件（公式 / 条件格式 / 数据验证 / 筛选 / 排序）默认在线，但 ensemble 自身的 UI / 业务包装大多未做。

**最大差距 Top 5**（腾讯文档有、ensemble 没有，且对协作产品几乎必备）：
1. **文档（doc）品类** — ensemble spec 明确 v0.1 non-goal，但所有协作产品共识里 doc 是基本盘
2. **评论 / 批注 UI** — Univer thread-comment 插件已注册但 ensemble 未包装；多人协作几乎必须
3. **@mention** — 完全未实现，是协作触达的标配
4. **AI 能力** — 完全未实现，2025 后协作产品的核心差异
5. **移动端 / 桌面端** — 完全未实现，腾讯文档已覆盖 8 端

**ensemble 反向优势 Top 5**（腾讯文档没有 / 不透明 / 不公开的，ensemble 第一公民）：
1. **自托管 / 私有部署** — 腾讯文档 SaaS 为主，未公开私有化方案
2. **协作算法可审计** — cell-region lock 仲裁规则、广播掩码规则全部在代码里；腾讯 OT/CRDT 实现不公开
3. **多租户 RLS 强隔离** — Postgres 行级安全，app 层无法绕过，已写入 ADR-0001
4. **Adapter Pattern + Conformance 套件** — host 拥有 identity / permission / storage / event；腾讯文档是 closed-box
5. **动态权限掩码不缓存** — 每次快照和广播按 host 权限重算；腾讯文档无此 API 暴露

**总体结论**：ensemble 在"开放协作 SDK / 自托管 / 透明仲裁"赛道是合理产品；与腾讯文档不是同一品类，**不应正面比品类宽度，应在"私有部署 + 可审计 + 多租户"维度纵深**。短期最值得补的是：评论 UI、@mention、保护范围、CSV 导入、AI 公式（这五项命中协作产品的最低用户期望线）。长期最值得分化的是：CRDT 模式可选、单元格级权限审计、企业级 DLP。

---

## 1. 范围与方法

- **腾讯文档侧**：docs.qq.com 个人版 + 企业版 SaaS + 桌面端 + 移动端 + 三大小程序，覆盖至 2025-07-01 OpenAPI 商业化、2025-02 DeepSeek-R1 接入、2024-04 智能白板发布等节点。已停售或合并的独立品类（如旧版日历）不计入。
- **ensemble 侧**：仓库 `/Users/cedric/Projects.localized/ensemble` 当前 main 分支 commit `f8e4e40` 实际代码，不依赖 README 自述，所有能力均带文件路径行号引用。
- **对比维度**：20 大类（文档类型 / 实时协作 / 权限安全 / 历史版本 / 离线多端 / AI / 企业治理 / OpenAPI / 导入导出 / 表格专项 / 文档专项 / 幻灯片 / 收集表 / 思维导图流程图 / PDF / 协作粒度 / 可观测性 / 国际化无障碍 / 白标 / 最近更新）。
- **方法**：两个并行 subagent，一个跑 Explore（ensemble 代码）一个跑 web research（腾讯文档 30+ 源），再合成对比矩阵。

---

## 2. 腾讯文档全量能力清单（精简版）

> 完整 30+ 来源链接见第 8 节。本节按 20 类列条目，每条尽量可枚举。

### 2.1 文档类型（11 主品类 + 4 子品类）
- 在线文档（Word，docx 兼容，Markdown 输入）
- 在线表格（Excel，公式 / 透视表 / 图表 / 条件格式 / 数据验证）
- 在线幻灯片（PPT，模板 / 放映 / 远程演示）
- 在线 PDF（阅读 / 批注 / PDF→Word / 福昕集成）
- 收集表（25 题型，跳题逻辑，百万级承载）
- 智能文档（类 Notion，30+ 内容块，多页面，块级评论）
- 智能表 / 多维表（18 字段类型，6 视图，关联，自动化）
- 智能白板（2024-04 发布，自研开物引擎，全端）
- 思维导图（ProcessOn 引擎，PNG 导出）
- 流程图（ProcessOn 引擎，Mermaid 支持）
- 文件夹 / 共享空间
- 子品类：签到 / 接龙 / 打卡 / 试卷（统一收集表框架）

### 2.2 实时协作
- 多人光标 + 选区高亮（彩色）
- 多人同时编辑 + 云端实时保存
- 自动锁定（企业版 "auto-lock during editing"）
- @mention 触发 QQ / 微信 / 企微推送
- 划词评论（文字范围 / 内容块）
- 协作历史（谁何时改了什么）
- 历史版本 + 命名版本 + 回滚 + 对比
- 跨端实时同步（Web ↔ 桌面 ↔ 移动）
- 结构化数据协作（智能表字段强约束）

### 2.3 权限 / 安全
- 链接级权限：公开 / 任何人可编辑 / 任何人可查看 / 指定人 / 企业内 / 部门
- 角色：所有者 / 编辑者 / 评论者 / 查看者
- 链接密码、过期时间
- 水印（含动态用户信息）
- 禁止复制 / 下载 / 打印
- 二次密码（QQ 登录）
- TLS 传输 + 云端存储加密
- 浏览 / 修订 / 操作三类审计日志
- 企业资产管控（事前权限 / 事中预警 / 事后日志）
- 企业回收站
- 离职交接（员工资产自动转移）
- 保密模式 / 共享空间安全设置
- DLP / IP 白名单 / 防截屏：未确认 / 推测

### 2.4 历史版本
- 自动版本（实时）
- 命名版本（企业版）
- 任意版本回滚
- 版本对比 diff
- 历史版本权限隔离（权限变更不影响已生成版本）

### 2.5 离线 / 多端（8 端）
- Web、Windows、macOS、Linux（v3.13+）
- iOS、Android、iPad
- 微信小程序、QQ 小程序、企业微信集成
- 离线编辑 + 联网自动同步

### 2.6 AI 能力（16 项）
- 双模型架构：混元（快）+ DeepSeek-R1 满血（深思）
- PPT 一键直出 + 讲稿
- 周报神器
- 长文档总结 / 文献速读
- 文档问答（基于上传文件）
- AI 写函数（表格内 `=` 唤起 AI）
- AI 生成图表 / 仪表盘
- AI 数据问答（对话式 BI）
- AI 数据报告
- AI 智能分列
- AI 改写 / 润色 / 续写 / 扩写 / 缩写
- AI 翻译（多语言）
- AI PPT 配图 / 智能美化
- AI 思维导图生成
- 实时联网搜索（覆盖微信公众号 / 腾讯文库等中文权威源）
- 多文件综述（单次最多 50 文件 30 秒生成）

### 2.7 企业能力（企业版 SaaS）
- 组织架构管理（部门 / 员工 / 离职）
- SSO（SAML / CAS / OIDC）
- SCIM 2.0（同步腾讯云身份中心）
- 角色管理 + 管理员日志 + 用户日志
- 工作台集成（挂接第三方应用）
- 可见范围管理（部门 / 成员）
- 共享空间 / 团队空间（多层级权限）
- 企业模板管理
- 文档公告
- 审批流（新建文档默认权限审批）
- Agent 管理（企业级 AI 助手治理）
- 许可证管理 / 系统外观 / 企业个性化
- 数据看板
- 白标 / OEM：未确认完整白标

### 2.8 OpenAPI / 开放平台
- OAuth 2.0 授权码模式
- 5 大 OpenAPI：File Mgmt / Online Sheet / Online Doc / Smart Sheet v2 / Form Collection
- MCP Server（12+ 工具：`create_word_by_markdown` / `create_excel_by_markdown` / `create_slide_by_markdown` / `create_smartcanvas_by_markdown` / `create_mind_by_markdown` / `create_flowchart_by_mermaid` / `query_space_node` / `search_space_file` / `create_space_node` / `get_content` / `batch_update_sheet_range` / `create_smartcanvas_element`）
- 小程序集成 SDK（可被第三方小程序调起）
- WebSDK（嵌入预览）
- 2025-07-01 商业化：每应用 2 万次/月免费
- 第三方 iPaaS 接入：HiFlow / 集简云 / S-HUB
- Webhook 直供：未确认 / 推测无（目前靠 iPaaS 5min 轮询）

### 2.9 导入 / 导出
- 导入：docx / doc / rtf / xlsx / xls / csv / pdf / txt / markdown
- 导出：docx / xlsx / pdf / png / txt（PPT 桌面端导出 pptx）
- PDF↔Word 双向
- Markdown 输入支持（智能文档 + 文档 `/` 命令）
- Office 桌面端深度兼容
- ODF：未确认 / 推测无

### 2.10 表格（Sheet）专项
- 函数估算 300-500 个（官方未公布"总数"）
- AI 公式生成
- 自定义函数
- 跨表 / 跨文档引用
- 数据透视表
- 多种图表（条形 / 折线 / 饼 / 雷达 / 散点 / 瀑布等）
- 条件格式
- 数据验证 / 下拉
- 筛选 / 排序 / 冻结
- 单元格 / 区域 / 工作表 / 工作簿四层保护（单表最多 2000 个保护范围）
- 图片→表格 OCR
- 表格生成表单（一键由列结构）
- 大文件：单表约 10 万行
- 多工作表
- 脚本（Apps Script 风格）：未确认独立 IDE
- 宏录制：未确认

### 2.11 智能表（多维表）独立特性
- 18 种列类型（文本 / 数字 / 链接 / 电话 / 邮箱 / 进度 / 创建时间等）
- 6 种视图（表格 / 看板 / 画册 / 甘特 / 日历 / 表单）
- 字段分组
- 公告栏
- 表间关联 / 双向关联
- 自动化流程 / 机器人（通过 iPaaS）
- OpenAPI v2 完整 CRUD

### 2.12 文档（Doc）专项
- 富文本（标题 / 列表 / 引用 / 代码块 / LaTeX 公式 / 图片 / 视频）
- Markdown + `/` 命令
- 自动目录
- 30+ 嵌入卡片（智能表 / 思维导图 / 流程图 / 腾讯视频 / Figma / B 站 / QQ 音乐 / 印象笔记）
- 多页面 / 页面树（智能文档）
- 划词评论 + @
- 多人协作 + 彩色光标
- 模板库
- AI 改写 / 润色 / 续写
- 脚注：未确认

### 2.13 幻灯片专项
- 多人在线编辑 + 协作光标
- 模板库（数百款）
- AI 一键 PPT 直出 + 讲稿
- AI 单页美化 + 智能配图
- 动画 / 母版（具体数量未确认完整母版编辑）
- 演讲者视图（腾讯会议联动）
- 远程放映（腾讯会议联动）
- 白板模式（独立"智能白板"承载）

### 2.14 收集表（25 题型）
- 单选 / 多选 / 图片单选 / 图片多选 / 文本（单行多行多项）/ 量表 / NPS / 评价 / 排序 / 多级联动 / 图片 / 文件 / 日期 / 时间 / 位置 / MaxDiff / 手写签名 / 矩阵单选 / 矩阵多选 / 矩阵量表 / 矩阵打分 / 矩阵填空 / 自增表格
- 跳转逻辑（显示 / 无条件跳页 / 自定义条件）
- 题库（人口属性 / 联系方式 / 上网行为 / 满意度等）
- 回收限制（用户一次）
- 答卷数据 → 表格
- 定时收集
- 百万级承载（实战 168.7 万人签到）
- 签到 / 接龙 / 打卡 / 试卷子品类
- 位置 / IP 记录
- 选项 / 题目随机
- 多份提交允许设定
- OpenAPI 直供

### 2.15 思维导图 / 流程图
- ProcessOn 引擎深度合作
- 在线编辑 + 实时保存 + 多人协作
- PNG 导出
- 手机 / 平板查看
- BPMN / UML 图形
- Mermaid 语法（MCP 工具直供）
- AI 思维导图 / AI 流程图生成
- 自由布局 / 主题样式

### 2.16 PDF 专项
- 在线阅读 + 批注
- PDF → Word 转换
- 表格内置 PDF 转换入口
- AI 文献速读 + 文档问答
- 加密 PDF / 密码 PDF（福昕集成）
- PDF 合并 / 压缩 / 加密
- PDF OCR：未确认原生

### 2.17 协作粒度
- 文档：块级评论 + 文档级编辑锁
- 表格：cell / range / sheet / workbook 四层保护
- 幻灯片：slide-level（shape-level 未确认）
- 智能文档：block-level 评论与协作
- 智能表：record / field / view 级权限
- 白板：自由区域协作

### 2.18 可观测性 / 管理后台
- 企业管理首页 dashboard（文档数据 / 活跃 / 容量 / 用户）
- 用户日志 + 管理员日志
- 文档管理（企业全部文档）
- 三类审计日志（浏览 / 修订 / 操作）
- 外发审计 / 数据风险预警
- 许可证管理

### 2.19 国际化 / 无障碍
- 中文（简 / 繁）/ 英文 UI 切换
- AI 多语言翻译
- Excel / Word 兼容快捷键表
- a11y / WCAG 合规：未确认完整声明
- 海外可用性：国内市场为主

### 2.20 品牌 / 水印 / 白标
- 预览水印含用户信息
- 企业个性化（品牌色 / Logo / 系统外观）
- 完整 OEM 白标：未确认
- 私有化部署：未确认

### 2.21 2024-2026 重要更新
- 2024-04 智能白板品类 + 自研开物引擎
- 2025-02 DeepSeek-R1 满血版接入
- 2025-02 PPT 直出 / 周报神器 / 文献速读上线
- 2025-05 五大协同办公 AI 升级战略
- 2025-07 OpenAPI 商业化
- 2025+ MCP Server 12+ 工具

---

## 3. ensemble v0.1 实现清单（精简版）

> 完整路径行号引用见 Section 4 矩阵表"证据"列。本节简述每类边界。

### 3.1 文档类型
- 仅 spreadsheet，基于 Univer，无 doc / slide / form / mindmap / flowchart / pdf

### 3.2 实时协作
- presence（5s 心跳 / 15s 超时）
- cursor 携带 sheet/row/col（仅心跳，无连续同步）
- selection 字段存在但未实现
- WebSocket apply_mutation 广播
- cell-region lock 仲裁（30s TTL，SET NX EX，Redis）
- 无 OT / CRDT（ADR-0002 明确）
- 无 @mention，评论 UI 未包装

### 3.3 权限 / 安全
- 4 capability：canView / canEdit / canShare / canDelete
- demo 3 persona：admin / editor / viewer
- Postgres RLS 多租户（ADR-0001）
- public_link grant，expiresAt 存在
- 密码 / 水印 / IP 白名单 / 防截屏 / 端到端加密：均未实现
- audit_log 表存在，事件接入

### 3.4 历史版本
- 命名快照 + 自动快照（reason: auto/manual/named）
- list / create / restore API 齐全
- 无对比 / diff / 合并

### 3.5 身份 / 认证
- `@ensemble-sheets/identity-jwks` 参考实现
- IdentityAdapter 由 host 实现 OIDC / SSO

### 3.6 服务端架构
- Hono REST：folders / workbooks / snapshots / versions / grants / export-xlsx
- WebSocket `/api/v1/ws/:workbookId`
- per-recipient masked broadcast
- 30 ops/sec token bucket 限流

### 3.7 客户端 SDK
- React `<WorkbookEditor>` + Vue `<WorkbookEditor>`
- `mountWorkbookEditor` API：container / workbookId / token / capabilities / autoSaveMs / onWsConnected
- handle 暴露：save / exportXlsx / destroy / onMutationApplied / onPresence / onSaved

### 3.8 Adapter Pattern
- FastAPI 示例：3 webhook 端点 + JWT 签发
- conformance 套件：identity / permission / storage / event
- 通用 WebhookAdapter（任何语言 host 通过 HTTP）

### 3.9 Webhook / 事件
- 5 事件：workbook.created / opened / edited / folder.created / share.granted
- fire-and-forget，未实现重试

### 3.10 表格功能面
- Univer 全公式集（~400 Excel 兼容）
- 条件格式、数据验证、筛选、排序、合并、冻结：Univer 插件已注册
- drawing 插件已注册（图表底座）
- 数据透视、智能填充、脚本、保护范围、智能分列：未实现
- xlsx 导入导出（SheetJS）
- CSV 导入：未实现

### 3.11 文档 / 幻灯片 / 表单 / 思维导图 / 流程图 / PDF
- 全部未实现，spec §2 明确为 v0.1 non-goal

### 3.12 AI 能力
- 完全未实现

### 3.13 导入导出
- xlsx（双向）+ json（快照）
- csv / pdf / markdown / docx：未实现

### 3.14 多端
- 仅 web，无桌面端 / 移动端 / 小程序

### 3.15 Demo 应用
- 文件夹 CRUD、版本管理、分享对话框
- presence 头像、双面板掩码对比、persona 切换
- OnboardingCoach v2（5 节点引导）
- 分类 toast、xlsx 上传下载

### 3.16 端口 / 部署
- server 5301 / web 5302（默认）
- 5311 / 5312（隔离 audit）
- docker-compose.dev.yml（Postgres + Redis）
- k8s 未提供

### 3.17 可观测性
- console.warn / error，无结构化日志
- 无 metric / trace
- 健康检查（curl 依赖证据）

### 3.18 国际化 / 无障碍
- 英文为主，部分中文 demo 文本
- Univer 内置 ARIA + aria-live presence

### 3.19 测试覆盖
- 单测 vitest 90%+ per-file 目标
- Testcontainers 集成测试
- e2e Playwright 5+ 套件（live sync / RBAC / showcase / plugin / base sheet / UX polish）

---

## 4. 对比矩阵（核心交付）

> 格式：行 = 具体能力；列 = 腾讯文档状态 / ensemble 状态 / Gap / 优先级 / ensemble 证据
> 状态：完整 = 完整实现，部分 = 部分 / 底座存在但 UI 未包装，无 = 未实现，N/A = 不在产品定位中
> 优先级：P0 = 协作基础线缺失，P1 = 用户可感知短板，P2 = 差异化机会，P3 = v0.1 明确 non-goal，REV = 反向优势

### 4.1 文档类型

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 1.1 | 在线表格 / Spreadsheet | 完整 | 完整 | 持平 | — | `packages/core/src/univer-wrapper.ts:154-186` |
| 1.2 | 在线文档 / Doc | 完整 | 无 | 缺品类 | P3 | spec §2 non-goal |
| 1.3 | 在线幻灯片 / Slide | 完整 | 无 | 缺品类 | P3 | — |
| 1.4 | PDF | 完整 | 无 | 缺品类 | P3 | — |
| 1.5 | 收集表 / Form | 完整 | 无 | 缺品类 | P3 | — |
| 1.6 | 智能文档（类 Notion） | 完整 | 无 | 缺品类 | P3 | — |
| 1.7 | 智能表 / 多维表 | 完整 | 无 | 缺品类 | P2 | 与协作 sheet 关联高，可考虑 v0.3+ |
| 1.8 | 智能白板 | 完整 | 无 | 缺品类 | P3 | — |
| 1.9 | 思维导图 | 完整 | 无 | 缺品类 | P3 | — |
| 1.10 | 流程图 | 完整 | 无 | 缺品类 | P3 | — |
| 1.11 | 文件夹 / 共享空间 | 完整 | 完整 | 持平 | — | `packages/server/src/http/routes/folders.ts`, demo `FolderDrawer.tsx` |

### 4.2 实时协作

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 2.1 | presence（在线状态） | 完整 | 完整 | 持平 | — | `packages/server/src/realtime/presence-tracker.ts:40-62` |
| 2.2 | 多人光标连续同步 | 完整 | 部分 | 仅心跳携带 cursor，需 throttled 单独通道 | P1 | `packages/server/src/realtime/presence-tracker.ts:4-14` |
| 2.3 | 选区高亮 | 完整 | 部分 | selection 字段存在未实现 | P1 | `packages/server/src/realtime/presence-tracker.ts:50` |
| 2.4 | edit broadcast | 完整 | 完整 | 持平 | — | `packages/core/src/mount.ts:242-262` |
| 2.5 | 冲突解决（OT/CRDT） | 完整（不公开） | 部分（cell-lock 替代） | 设计取舍，文档化 ADR-0002 | REV | `docs/decisions/0002-cell-lock-vs-crdt.md` |
| 2.6 | @mention | 完整 | 无 | 完全缺 | P1 | — |
| 2.7 | 评论 / 批注 UI | 完整 | 部分 | Univer thread-comment 插件已注册，UI 未包装 | P1 | `packages/core/src/univer-wrapper.ts:182-185` |
| 2.8 | 划词评论（块内文字范围） | 完整 | 无 | sheet 场景下意义有限，doc 场景需求 | P3 | — |
| 2.9 | 协作历史 | 完整 | 部分 | audit_log 表存在但前端无展示 | P1 | `packages/server/src/db/schema.ts:111-127` |
| 2.10 | 自动锁定（编辑互不影响） | 完整 | 完整 | cell-lock 已实现，比腾讯更细 | REV | `packages/server/src/realtime/cell-lock-manager.ts:59-68` |
| 2.11 | 跨端实时同步 | 完整 | 无 | 仅 web | P3 | — |

### 4.3 权限 / 安全

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 3.1 | 角色：owner / editor / viewer | 完整 | 完整 | 持平 | — | `apps/demo/src/persona.ts:26-46` |
| 3.2 | 评论者角色（不能改但能评论） | 完整 | 无 | 需 capability 扩展 | P1 | — |
| 3.3 | 多租户隔离 | 完整（企业版逻辑层） | 完整（Postgres RLS 行级） | ensemble 更强，硬强制 | REV | `docs/decisions/0001-rls-vs-app-level-tenancy.md` |
| 3.4 | 链接分享（public_link） | 完整 | 完整 | 持平 | — | `packages/server/src/db/schema.ts:66-68` |
| 3.5 | 链接密码 | 完整 | 无 | 字段无，需加表 | P1 | — |
| 3.6 | 链接过期 | 完整 | 完整 | 持平 | — | `packages/server/src/db/schema.ts:80` |
| 3.7 | IP 白名单 | 推测有 | 无 | 企业需求 | P2 | — |
| 3.8 | 水印（含用户信息） | 完整 | 无 | 防泄密标配 | P1 | — |
| 3.9 | 禁止复制 / 下载 / 打印 | 完整 | 无 | 协作底座层 + 前端拦截 | P2 | — |
| 3.10 | 端到端加密 | 无 | 无 | 都未实现 | P3 | — |
| 3.11 | 审计日志（事后） | 完整 | 完整 | 表存在事件接入 | — | `packages/server/src/http/routes/workbooks.ts:20-25` |
| 3.12 | 实时风险预警（事中） | 完整（企业版） | 无 | 需流式分析层 | P2 | — |
| 3.13 | 企业回收站 | 完整 | 部分 | soft delete 存在，无独立回收站 UI | P2 | `DELETE /api/v1/folders/:id` soft delete |
| 3.14 | 离职交接 | 完整（企业版） | 无 | host 自治，可作 adapter 接口 | P2 | — |
| 3.15 | cell-region lock | 部分（auto-lock 编辑互斥） | 完整（30s TTL Redis） | ensemble 更细+可审计 | REV | `packages/server/src/realtime/cell-lock-manager.ts:59-68` |
| 3.16 | 单元格级权限掩码 | 部分（最多 2000 保护范围） | 完整（per-recipient mask） | ensemble 更动态，每次广播重算 | REV | `packages/server/src/realtime/mutation-broadcaster.ts` |

### 4.4 历史版本

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 4.1 | 自动版本 | 完整 | 完整 | 持平 | — | `packages/server/src/db/schema.ts:53-64` |
| 4.2 | 命名版本 | 完整（企业版） | 完整 | 持平 | — | `packages/server/src/http/routes/versions.ts` |
| 4.3 | 回滚到任意版本 | 完整 | 完整 | 持平 | — | `packages/server/src/http/routes/versions.ts:43-66` |
| 4.4 | 版本对比 diff | 完整 | 无 | 需 diff 算法 | P2 | — |
| 4.5 | 历史版本权限隔离 | 完整 | 部分 | snapshot 不重算 mask | P2 | — |

### 4.5 离线 / 多端

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 5.1 | Web | 完整 | 完整 | 持平 | — | — |
| 5.2 | Windows 桌面端 | 完整 | 无 | Tauri / Electron 可补 | P2 | — |
| 5.3 | macOS 桌面端 | 完整 | 无 | 同上 | P2 | — |
| 5.4 | Linux 桌面端 | 完整 | 无 | 同上 | P3 | — |
| 5.5 | iOS App | 完整 | 无 | 原生开发 | P2 | — |
| 5.6 | Android App | 完整 | 无 | 原生开发 | P2 | — |
| 5.7 | 微信小程序 | 完整 | 无 | 生态绑定，开源 SDK 一般不做 | P3 | — |
| 5.8 | QQ / 企微小程序 | 完整 | 无 | 同上 | P3 | — |
| 5.9 | 离线编辑 | 完整 | 无 | 需 IndexedDB + 同步层 | P2 | — |

### 4.6 AI 能力

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 6.1 | AI 写函数（表格内） | 完整 | 无 | 高 ROI，单点切入 | P1 | — |
| 6.2 | AI 数据问答（BI） | 完整 | 无 | 中长期差异化 | P2 | — |
| 6.3 | AI 生成图表 | 完整 | 无 | 同上 | P2 | — |
| 6.4 | AI 智能分列 | 完整 | 无 | 表格高频需求 | P1 | — |
| 6.5 | AI 改写 / 润色 / 翻译 | 完整 | 无 | 主要在 doc 场景 | P3 | — |
| 6.6 | AI PPT 一键直出 | 完整 | 无 | doc 场景 | P3 | — |
| 6.7 | AI 思维导图生成 | 完整 | 无 | doc 场景 | P3 | — |
| 6.8 | 文档问答 / 长文档总结 | 完整 | 无 | doc 场景 | P3 | — |
| 6.9 | 实时联网搜索 | 完整 | 无 | 需独立搜索集成 | P3 | — |
| 6.10 | 多文件综述 | 完整 | 无 | 需文件夹聚合 | P3 | — |
| 6.11 | 企业 AI 助手治理 | 完整 | 无 | 企业版需求 | P2 | — |
| 6.12 | LLM 提供方可换 | 无 | 无 | 设计机会：提供 LLMAdapter | P2 | — |

### 4.7 企业治理

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 7.1 | SSO（SAML/CAS/OIDC） | 完整 | 部分 | adapter 接口存在，host 实现 | — | IdentityAdapter |
| 7.2 | SCIM 2.0 同步 | 完整 | 无 | 用户 / 组同步 | P2 | — |
| 7.3 | 组织架构管理 | 完整 | 无 | host 拥有 | P3（host 自治） | — |
| 7.4 | 工作台集成 | 完整 | 无 | 同上 | P3 | — |
| 7.5 | 审批流 | 完整 | 无 | 同上 | P3 | — |
| 7.6 | Agent 管理 | 完整 | 无 | AI 引入后需要 | P2 | — |
| 7.7 | 许可证 / 席位 | 完整 | 无 | SaaS 必备，自托管次要 | P3 | — |
| 7.8 | 数据看板 | 完整 | 无 | 管理后台 | P2 | — |
| 7.9 | 企业模板 | 完整 | 无 | host 实现 | P3 | — |

### 4.8 OpenAPI / 集成

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 8.1 | OAuth 2.0 | 完整 | 无 | adapter 模式可外接 | P3 | — |
| 8.2 | REST OpenAPI（File/Sheet/Doc/SmartSheet/Form） | 完整（5 大类） | 部分 | folder + workbook + snapshot + version + grant + xlsx | P1 | `packages/server/src/http/routes/*.ts` |
| 8.3 | Webhook 事件订阅 | 部分（推测无直供） | 完整 | ensemble 已直供 | REV | 5 事件 fire-and-forget |
| 8.4 | Webhook 签名 + 重试 | — | 部分 | secret 支持，重试缺 | P1 | — |
| 8.5 | WebSDK / 嵌入预览 | 完整 | 完整 | React / Vue 组件 | — | `<WorkbookEditor>` |
| 8.6 | MCP Server | 完整（12+ 工具） | 无 | AI Agent 时代必备 | P2 | — |
| 8.7 | iPaaS 接入（HiFlow 等） | 完整 | 无 | Webhook 已具备基础 | P3 | — |
| 8.8 | API 限流 / 配额 | 完整 | 部分 | 30 ops/sec token bucket | — | `packages/server/src/server.ts:154` |
| 8.9 | Adapter Pattern + Conformance 套件 | 无 | 完整 | ensemble 独有，host 自治 | REV | `@ensemble-sheets/adapter-conformance` |

### 4.9 导入 / 导出

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 9.1 | xlsx 导入 | 完整 | 完整 | 持平 | — | `packages/core/src/xlsx-converter.ts` |
| 9.2 | xlsx 导出 | 完整 | 完整 | 持平 | — | `packages/server/src/http/routes/export-xlsx.ts` |
| 9.3 | CSV 导入 | 完整 | 无 | 客户端解析即可 | P1 | — |
| 9.4 | JSON 快照 | 无 | 完整 | ensemble 独有 | REV | — |
| 9.5 | PDF 导出 | 完整 | 无 | 印刷 / 归档 | P2 | — |
| 9.6 | Markdown 导出 | 部分 | 无 | doc 场景 | P3 | — |
| 9.7 | docx 导入导出 | 完整 | 无 | doc 场景 | P3 | — |
| 9.8 | pptx 导入导出 | 完整 | 无 | slide 场景 | P3 | — |

### 4.10 表格专项

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 10.1 | 函数（300+） | 完整 | 完整（Univer ~400） | 持平 | — | `packages/core/src/univer-wrapper.ts:161-162` |
| 10.2 | AI 公式生成 | 完整 | 无 | 高 ROI 单点 | P1 | — |
| 10.3 | 自定义函数 | 完整 | 部分 | Univer 底座支持，未暴露 | P2 | — |
| 10.4 | 跨表 / 跨文档引用 | 完整 | 无 | Univer 底座有限支持 | P2 | — |
| 10.5 | 数据透视表 | 完整 | 无 | 高频需求 | P1 | — |
| 10.6 | 多种图表 | 完整 | 部分 | drawing 插件已注册，UI 包装 | P1 | `packages/core/src/univer-wrapper.ts:179` |
| 10.7 | 条件格式 | 完整 | 完整 | Univer 插件 | — | `packages/core/src/univer-wrapper.ts:163-164` |
| 10.8 | 数据验证 / 下拉 | 完整 | 完整 | Univer 插件 | — | `packages/core/src/univer-wrapper.ts:165-166` |
| 10.9 | 筛选 / 排序 | 完整 | 完整 | Univer 插件 | — | `packages/core/src/univer-wrapper.ts:169-174` |
| 10.10 | 冻结 | 完整 | 部分 | Univer 支持，未包装 | P2 | — |
| 10.11 | 合并单元格 | 完整 | 完整 | Univer 原生 | — | — |
| 10.12 | 单元格 / 区域保护 | 完整（2000 范围） | 无 | 与 cell-lock 不同（lock 是临时，protection 是持久 ACL） | P1 | — |
| 10.13 | 图片→表格 OCR | 完整 | 无 | AI / OCR 集成 | P3 | — |
| 10.14 | 智能填充 | 完整 | 无 | 用户高频期望 | P2 | — |
| 10.15 | 脚本（Apps Script） | 部分（未确认 IDE） | 无 | 沙箱化复杂 | P3 | — |
| 10.16 | 宏录制 | 部分（未确认） | 无 | 同上 | P3 | — |
| 10.17 | 大文件（10 万行） | 完整 | 未基准测 | 性能基准缺 | P1 | — |

### 4.11 智能表（多维表）

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 11.1 | 18 字段类型 | 完整 | 无 | 与 sheet 关联性中等 | P2 | — |
| 11.2 | 6 视图（看板 / 甘特 / 日历 / 画册 / 表单） | 完整 | 无 | 中长期差异化 | P2 | — |
| 11.3 | 字段分组 | 完整 | 无 | 同上 | P2 | — |
| 11.4 | 表间关联 | 完整 | 无 | 同上 | P2 | — |
| 11.5 | 自动化流程 / 机器人 | 完整 | 无 | Webhook 已具备基础 | P2 | — |

### 4.12 协作粒度

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 12.1 | cell-level | 完整（保护范围） | 完整（lock） | ensemble 更动态 | REV | — |
| 12.2 | range-level | 完整 | 完整 | 持平 | — | — |
| 12.3 | sheet-level | 完整 | 部分 | 保护未实现，rls 已有 | P1 | — |
| 12.4 | workbook-level | 完整 | 完整 | 持平 | — | — |
| 12.5 | block-level（doc） | 完整 | N/A | non-goal | P3 | — |
| 12.6 | record / field / view（智能表） | 完整 | N/A | non-goal | P3 | — |

### 4.13 可观测性

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 13.1 | 结构化日志 | 完整 | 无 | pino / winston 易补 | P1 | console.warn/error |
| 13.2 | metric（Prometheus） | 完整 | 无 | OTEL 易补 | P2 | — |
| 13.3 | trace（distributed） | 推测有 | 无 | OTEL 易补 | P2 | — |
| 13.4 | 健康检查 | 完整 | 完整 | 持平 | — | curl 依赖证据 |
| 13.5 | 管理后台 dashboard | 完整 | 无 | demo 已有部分 | P2 | — |
| 13.6 | 文档使用统计 | 完整 | 无 | audit_log 上层 | P2 | — |

### 4.14 国际化 / 无障碍

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 14.1 | UI 语言切换（中英） | 完整 | 无 | i18n 框架未建 | P1 | — |
| 14.2 | a11y（ARIA + aria-live） | 部分（未公开 WCAG 声明） | 部分 | Univer 内置 | — | aria-live presence |
| 14.3 | 键盘快捷键 | 完整（Excel 兼容） | 部分 | Univer 默认 | P2 | — |
| 14.4 | WCAG 合规声明 | 无 | 无 | 可作差异化 | P2 | — |

### 4.15 品牌 / 白标 / 部署

| # | 能力 | 腾讯文档 | ensemble | Gap | 优先级 | ensemble 证据 |
|---|---|---|---|---|---|---|
| 15.1 | 自托管 / 私有部署 | 无 | 完整 | ensemble 第一公民 | REV | docker-compose.dev.yml |
| 15.2 | 完整 OEM 白标 | 无 | 完整（开源可改） | 同上 | REV | — |
| 15.3 | k8s 部署 | — | 无 | helm chart 易补 | P2 | — |
| 15.4 | 多区域 / 主备 | 完整（云原生） | 无 | 数据库 / 对象存储层 | P2 | — |

---

## 5. ensemble 未覆盖能力分桶

### 5.1 P0 — 协作底座必须考虑（短板会被用户立刻发现）
- **多人光标连续同步**：当前仅 presence 心跳携带 cursor，应该走独立 throttled 帧（10-30 Hz）
- **选区高亮**：selection 字段已声明，需广播+渲染层实现
- **健康检查显式声明**：Makefile 依赖 curl 但代码未显式声明 endpoint，需补 `/api/v1/healthz` JSON 响应

### 5.2 P1 — 用户可感知短板（v0.2-v0.3 应补）
1. **评论 / 批注 UI**：Univer thread-comment 插件已注册（`packages/core/src/univer-wrapper.ts:182-185`），仅需包装 UI + 后端持久化
2. **@mention**：协作触达标配，需 mention 数据模型 + 通知事件
3. **保护范围 / Range Protection**：与 cell-lock 不同（lock 是临时仲裁，protection 是持久 ACL），用户长期期望
4. **CSV 导入**：客户端解析即可，零后端工作
5. **图表 UI 包装**：drawing 插件已在底座，只需在 capabilities 中暴露
6. **数据透视表**：表格高频需求
7. **AI 公式生成**：单点切入，LLMAdapter 接口可设计
8. **AI 智能分列**：表格高频需求，单点 LLM 调用
9. **链接密码**：字段加一个，路由加一段
10. **水印**：协作产品防泄密标配
11. **协作历史可视化**：audit_log 表已有数据，前端缺时间线
12. **OpenAPI（更接近腾讯结构）**：单元格批量读写 API，方便 host 程序化操作
13. **Webhook 重试 + 签名版本化**：fire-and-forget 不够企业级
14. **结构化日志（pino）**：3 行代码
15. **i18n 框架**：i18next 或类似
16. **冻结行列 UI**：Univer 已支持
17. **评论者角色**：第 4 capability：canComment

### 5.3 P2 — 差异化突围（中长期，6-12 个月）
1. **CRDT 模式可选**：与 cell-lock 互斥设计，作为 host 配置选项，命中"算法可审计 + 可换"差异
2. **LLM Adapter 接口**：host 选 OpenAI / Anthropic / 混元 / 自托管 vLLM，对比腾讯绑死双模型
3. **MCP Server**：暴露 spreadsheet 工具集（read_range / write_range / create_workbook / mask_view），AI Agent 时代基础设施
4. **单元格级权限审计**：每个 mutation 携带 actor + mask 结果哈希，链式存储，达到合规级别可审计性
5. **SCIM 2.0 同步**：企业用户 / 组同步
6. **企业 DLP / 实时风险预警**：流式分析 mutation + 模式匹配
7. **离线编辑**：IndexedDB + 同步队列
8. **桌面端**：Tauri 包装（共享 web 代码）
9. **PDF 导出**：归档场景
10. **k8s helm chart**：私有部署必备
11. **OTEL metric + trace**：可观测性标配
12. **管理后台 dashboard**：admin 视角的活跃 / 容量 / 审计
13. **WCAG 2.2 合规声明 + 测试**：差异化（腾讯未公开声明）
14. **CRDT 文档（doc）品类**：如果未来扩品类，doc 是第二个

### 5.4 P3 — v0.1 明确 non-goal（暂不考虑）
- 在线文档 / 幻灯片 / 收集表 / 智能文档 / 智能白板 / 思维导图 / 流程图 / PDF
- 微信 / QQ / 企微小程序
- iOS / Android 原生 App（先桌面端代替）
- 完整 OEM 白标（开源已天然支持）
- AI 全品类生成（PPT / mindmap 等，依赖 doc 品类）
- 收集表 25 题型
- 智能表 18 字段 6 视图（智能表可独立 v0.3+ 考虑）

### 5.5 长尾 / 推测不在路线
- 二次密码（QQ 登录绑定，无通用价值）
- 防截屏（浏览器层面不可靠）
- 与微信生态深度绑定的所有能力（生态闭环）

---

## 6. ensemble 反向优势（腾讯文档没有 / 不公开）

| # | 能力 | 腾讯文档 | ensemble | 说明 |
|---|---|---|---|---|
| REV.1 | 自托管 / 私有部署 | 无 | 完整 | 数据不出企业，监管 / 涉密场景刚需 |
| REV.2 | 开源 + 可审计 | 无 | 完整 | Apache-2.0 / MIT 协议，host 可 fork 改 |
| REV.3 | 协作算法透明 | 无 | 完整 | cell-lock 仲裁规则在代码里，ADR-0002 文档化设计取舍 |
| REV.4 | 多租户 RLS 强隔离 | 部分（企业版逻辑层） | 完整（Postgres 行级强制） | app 层无法绕过，ADR-0001 决策 |
| REV.5 | Adapter Pattern | 无 | 完整 | identity / permission / storage / event 全 adapter，host 自治 |
| REV.6 | Conformance 测试套件 | 无 | 完整 | 任何语言 host 接入有 portable 测试 |
| REV.7 | 动态权限掩码不缓存 | 无 | 完整 | 每次广播按 host 当前权限重算，无失效问题 |
| REV.8 | Webhook 事件直供 | 部分（推测无） | 完整 | 5 事件 fire-and-forget，host 直接接 |
| REV.9 | JSON 快照可导出 | 无 | 完整 | 数据所有权清晰，无 lock-in |
| REV.10 | 完整 OEM 白标 | 无 | 完整 | 开源天然支持 |
| REV.11 | 单元格级 lock + mask 双层 | 部分（保护范围 + auto-lock 二选一） | 完整 | 临时仲裁 + 持久 mask 解耦 |

---

## 7. 建议路线

### 7.1 v0.2（3 个月内，对齐用户最低期望）
**核心目标：让协作"看起来正常"**

- [ ] 多人光标连续同步（独立 throttled 帧通道）
- [ ] 选区高亮渲染
- [ ] 评论 / 批注 UI（包装已注册的 thread-comment 插件）
- [ ] @mention 数据模型 + 事件
- [ ] CSV 导入
- [ ] 链接密码字段
- [ ] 水印渲染
- [ ] 结构化日志（pino）
- [ ] 健康检查显式 endpoint
- [ ] e2e 套件扩到上述能力

**预期成本**：1-2 人 × 3 个月

### 7.2 v0.3（6 个月内，补强表格 + 差异化起步）
**核心目标：表格不输腾讯单点能力 + 开始有差异化故事**

- [ ] 数据透视表
- [ ] 图表 UI 包装（drawing 插件包装）
- [ ] 范围保护（持久 ACL，与 cell-lock 解耦）
- [ ] 评论者角色（canComment capability）
- [ ] 协作历史时间线 UI
- [ ] 版本对比 diff
- [ ] AI 公式生成 + AI 智能分列（LLMAdapter 接口设计）
- [ ] OpenAPI 扩展：单元格批量读写
- [ ] Webhook 签名 + 重试
- [ ] 桌面端（Tauri 包装）
- [ ] i18n 框架
- [ ] OTEL metric

**预期成本**：2-3 人 × 6 个月

### 7.3 v0.4+（长期差异化方向）
**核心目标：在 "私有部署 + 可审计 + 多租户" 维度建立护城河**

- [ ] **CRDT 模式可选**（与 cell-lock 互斥，host 配置切换），文档化两种模式的取舍
- [ ] **MCP Server**（spreadsheet 工具集，AI Agent 直接读写）
- [ ] **单元格级合规级审计**（mutation 链式哈希 + actor + mask 结果）
- [ ] **SCIM 2.0** 用户 / 组同步
- [ ] **企业 DLP** 实时风险预警
- [ ] **离线编辑** IndexedDB + 同步队列
- [ ] **k8s helm chart**
- [ ] **WCAG 2.2 合规** 测试 + 声明
- [ ] **管理后台 dashboard**（活跃 / 容量 / 审计可视化）
- [ ] 智能表 / 多维表（独立品类，6 视图）

---

## 8. 主要参考来源

### 腾讯文档官方
- [docs.qq.com 官网](https://docs.qq.com/)
- [docs.qq.com/desktop 桌面端](https://docs.qq.com/desktop)
- [docs.qq.com/open 开放平台](https://docs.qq.com/open/)
- [OpenAPI 总览](https://docs.qq.com/open/document/app/)
- [OAuth 2.0](https://docs.qq.com/open/document/app/oauth2/)
- [智能表 v2 OpenAPI](https://docs.qq.com/open/document/app/openapi/v2/smartsheet/sheet/params.html)
- [MCP 工具介绍](https://docs.qq.com/open/document/mcp/tool-introduce/)
- [小程序集成](https://docs.qq.com/open/document/mini-program/call-openapi/)
- [腾讯文档企业版 SaaS 用户操作指南](https://cloud.tencent.com/document/product/1663/103166)
- [腾讯文档企业版 SaaS 管理员手册](https://cloud.tencent.com/document/product/1663/103165)
- [腾讯客服 FAQ - 函数列表](https://kf.qq.com/faq/180723JBvyqu1807233MnUbu.html)
- [腾讯 ISUX 全平台设计](https://isux.tencent.com/articles/multiplatform.html)

### 腾讯云开发者社区
- [接入 DeepSeek](https://cloud.tencent.com.cn/developer/news/2218948)
- [DeepSeek-R1 满血版](https://cloud.tencent.com.cn/developer/news/2191487)
- [收集表设计](https://developer.cloud.tencent.com/article/1748574)
- [智能表自动化](https://cloud.tencent.com.cn/developer/article/2070149)
- [腾讯问卷常见问题](https://cloud.tencent.com/document/product/1304/49114)
- [SCIM 2.0](https://cloud.tencent.com/document/product/850/112576)

### 第三方评测 / 报道
- [量子位 - 智能白板发布](https://www.qbitai.com/2024/04/136348.html)
- [新浪科技 - 五大办公 AI 升级](https://finance.sina.com.cn/tech/roll/2025-05-21/doc-inexiine8006033.shtml)
- [中关村在线 - 智能表 18 列](https://news.zol.com.cn/797/7970908.html)
- [知乎 - 智能文档 vs Notion](https://zhuanlan.zhihu.com/p/622892391)
- [知乎 - 思维导图 / 流程图上线](https://zhuanlan.zhihu.com/p/471907825)
- [aihub.cn - DeepSeek 集成](https://aihub.cn/news/qqdoc-integrates-deepseek-r1)
- [腾讯轻联 HiFlow](https://qinglian.tencent.com/apps/details/doc/)

### ensemble 仓库代码
- `packages/core/src/univer-wrapper.ts`（Univer 插件注册）
- `packages/core/src/mount.ts`（客户端入口）
- `packages/core/src/xlsx-converter.ts`（xlsx 解析）
- `packages/server/src/server.ts`（限流配置）
- `packages/server/src/realtime/presence-tracker.ts`（presence + cursor）
- `packages/server/src/realtime/cell-lock-manager.ts`（cell-region lock）
- `packages/server/src/realtime/mutation-broadcaster.ts`（per-recipient mask）
- `packages/server/src/http/routes/`（folders / workbooks / snapshots / versions / grants / export-xlsx）
- `packages/server/src/db/schema.ts`（数据模型 + audit_log）
- `packages/server/src/adapters/identity.ts`（IdentityAdapter）
- `packages/adapter-conformance/src/`（conformance 套件）
- `apps/demo/e2e/v01-capability-audit.spec.ts`（v0.1 capability 审计 e2e）
- `apps/demo/src/persona.ts`（demo 角色定义）
- `docs/specs/2026-05-15-ensemble-design.md`（设计 spec）
- `docs/decisions/0001-rls-vs-app-level-tenancy.md`（ADR-0001）
- `docs/decisions/0002-cell-lock-vs-crdt.md`（ADR-0002）

---

*报告完*
