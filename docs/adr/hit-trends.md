# ADR: 命中趋势——UTC 小时预聚合 bucket、计数器同事务双写、recharts 懒加载面积图

## Status

Accepted.

## Context

见 `docs/prd/hit-trends.md`。要点：

- 版本计数器只给总量，产品需要 channel（7/30/90 天）与版本（发布后 14 天）两个时间序列视图。
- Feed 是热的无鉴权路径：每次 yml 命中与制品 302 都会触发写。写入成本必须可忽略，且不能与计数器更新产生不一致窗口。
- 面板图表需要随主题（light/dark）零 JS 切换；面板已有 CSS 变量体系（`--flare` / `--ink` / `--border` 等）与按 locale 格式化的 `useFormatters` 范式。
- 面板数据层已有「独立 admin endpoint + TanStack Query queryKey」范式；appDetail 聚合负载不宜再加重。

## Decision

- **存储：按 UTC 小时预聚合的 `hit_buckets` 表**。列为 `(id, versionId FK→versions ON DELETE CASCADE, kind ∈ {metadata, artifact}, hourStart, count)`，`hourStart` 为截断到小时的 unix 秒；`(versionId, kind, hourStart)` 唯一索引。永久保留，无清理任务。
- **写路径：计数器与 bucket 同事务双写**。`recordHit(versionId, kind)` 在一个同步 `db.transaction` 内先递增 `versions.metadata_hits/artifact_hits`，再 `INSERT … ON CONFLICT DO UPDATE count+1` upsert bucket。计数器仍是总量权威；bucket 自部署起累积，**不做历史回溯**。云 isolate 上 `recordHit` 为空操作（见 [feed-hits-serverless](feed-hits-serverless.md)）。
- **时间边界一律 UTC**：小时界 `floor(t/3600)*3600`，天界 `floor(t/86400)*86400`，整数运算；坐标轴标签 `timeZone: 'UTC'` 固定，与分桶一致。
- **粒度按范围分档**：7 天 → 小时点（168 个）；30 / 90 天 → UTC 天点。无命中时段补零，序列定长并对齐当前小时/天；版本趋势固定 14 天窗口，未来日期直接省略（不补零）。
- **读取：独立 endpoint + 独立 queryKey**。`GET /api/v1/apps/{appSlug}/channels/{channel}/trend?range=7|30|90` 与 `…/versions/{version}/trend`，session 或绑定该 app 的 API key；不并入 appDetail，不做 SSR priming（图表在 lazy 边界之后，首屏不需要），staleTime 30s，无 mutation 使 trend key 失效。
- **渲染：recharts v3，React.lazy 代码分割**。唯一的 recharts importer 是懒加载的 inner 组件，服务端永不加载；叠加面积图（非堆叠柱状）：downloads 用 `var(--flare)` 描边 + 10% 填充，checks 用 45% ink 描边不填充；网格、刻度、tooltip 全部走 CSS 变量，主题切换零 JS。
- **共享契约独立于服务端模块**：`src/lib/trends.ts` 只放类型与常量（range 集合、guard、点形状），不 import db/react，客户端可安全 value-import。

## Alternatives

- **原始事件日志（每命中一行）**：写放大无界，读取时要扫全表聚合；feed 是热路径，拒绝。
- **只按天聚合**：丢掉日内分辨率，7 天视图只剩 7 个点，发布当日的激增形状不可见，拒绝。
- **浏览器本地时区分界**：同一 bucket 在不同 viewer 时区下含义不同，queryKey 无法缓存，且与「UTC 截断」的服务端整数运算冲突，拒绝。
- **计数器由 `SUM(buckets)` 派生**：要求部署时全量 backfill，且让总量读取依赖聚合查询；保留现有计数器为零迁移成本，拒绝。
- **手绘 SVG 图表**：省下依赖，但坐标轴、刻度、tooltip、响应式都要自己造；recharts 懒加载后首屏成本为零，拒绝。
- **shadcn/chart**：它是 recharts 的样式封装，主题语义与本仓库的 CSS 变量体系（oklab 混合、flare/ink 梯子）不匹配，直接用 recharts 更薄。
- **堆叠柱状图**：checks 与 downloads 是两个独立度量，求和无意义；叠加面积各自可读，拒绝堆叠。
- **并入 appDetail 响应**：每个 channel 的趋势会拖慢整个详情负载且无法按 range 独立缓存，拒绝。

## Trade-offs & failure bounds

- 热的无鉴权 feed 路径每次命中多一次唯一索引上的同步 upsert（better-sqlite3，亚毫秒级）；相对同行的内联 S3 GET 是噪声。若未来出现写入争用，首先考虑的是批量落桶，而不是回到事件日志。
- 行数上界为 versions × kinds × 活跃小时数：只增不减但增长缓慢（一个全年每小时都有命中的版本约 17k 行）；永久保留是刻意选择，删除 version 即级联清掉其全部趋势历史——与计数器语义一致，不假装有历史归档。
- 「下载」语义是「发出了 302」，不是「完成了字节传输」；趋势图与计数器同样继承此语义。
- bucket 自部署起累积：部署前只有总量没有曲线，趋势图在早期窗口会显示为空态或部分补零，这是已声明的产品行为（无 backfill）。
- 双写在同一事务内，不存在计数器与 bucket 的不一致窗口；不变量「自部署起计数器 ≡ bucket 之和」由测试兜底。
