# PRD: 命中趋势（Hit trends）——channel 与版本的时间序列图

## Problem

版本计数器（`metadata_hits` / `artifact_hits`）只给生命周期总量：面板能回答「这个版本累计被检查/下载了多少次」，但回答不了「这个版本发布后的下载曲线是什么形状」「这个 channel 最近一周的流量如何」。总量掩盖了时间分布——发布后激增、周末低谷、异常爬升都不可见。

## Users

- **管理员 / 开发者 / 内容编辑**：面板的全部三档视图角色。内容编辑的核心诉求就是看数据（见 `docs/prd/view-roles.md`），趋势图与计数器一样对所有角色可见。

## Goals

1. 自托管 Node 上，每次 feed 命中（yml 返回 / 制品 302）在递增版本计数器的**同一事务**内，写入一条按 UTC 小时预聚合的 hit bucket（version × kind × 小时）。云 isolate 不写（见 `docs/prd/feed-hits-serverless.md`）。
2. Hit bucket 永久保留，无保留期任务；随所属 version 删除而级联清除（与计数器一致）。
3. 版本计数器仍是总量的唯一权威来源；趋势图只读 bucket，不回算计数器。bucket 自本功能部署起累积，历史计数不回溯。
4. Channel 趋势图位于 Channels 标签页（当前版本行与历史表之间）：7 / 30 / 90 天三档范围切换，范围存 URL `?range=`（默认 30，默认值不占 URL），对所有视图角色可见。
5. 版本趋势图位于版本统计弹窗内：固定窗口为发布时刻起 14 个 UTC 天，按天聚合；未来日期不显示（不补零）。
6. 7 天范围按小时取点，30 / 90 天按 UTC 天取点；无命中时段补零，使序列定长、对齐当前小时/天。
7. 全部命中时段均为零时，图表显示一条安静的空态提示，而不是一条平的折线。
8. 非法 `?range=` 值响亮失败（`invalid_request`）；缺省回退 30 天。

## Non-goals

- 地域、UA、去重用户、per-IP 等任何维度——bucket 只存计数，隐私由设计保证。
- 实时刷新（轮询 / 推送）；趋势查询走常规 30s staleTime 缓存。
- 保留期管理与清理任务；bucket 与版本同生命周期。
- CSV 导出与报表。
- 部署前历史计数的 bucket 回溯（backfill）。

## Flows

### 查看 channel 趋势

1. 打开 app 详情的 Channels 标签页，当前 channel 有版本时，当前版本行下方显示趋势图。
2. 图内切换 7 / 30 / 90 天：URL 写入 `?range=`（30 为默认，URL 保持干净），图表按新范围重新取数。
3. 7 天视图横轴为小时，30 / 90 天为 UTC 天；下载（artifact）为 accent 色面积，检查（metadata）为 ink 色描边，两条序列叠加而非堆叠。

### 查看版本趋势

1. 历史表某行点统计按钮打开版本统计弹窗；计数器下方显示该版本发布后 14 天的按天趋势。
2. 发布不足 14 天时只显示已过去的天数；窗口内无命中显示空态提示。

## Acceptance criteria

- [ ] 同一小时内同一 version+kind 的多次命中只产生一行 bucket，count 累加（upsert 幂等）。
- [ ] 小时边界两侧（±1s）的命中产生两行 bucket。
- [ ] 经真实 feed 路径（publish + resolveFeedRequest）后，每个版本的计数器恒等于其同 kind bucket 之和。
- [ ] channel 趋势按范围聚合、无命中时段补零、序列对齐当前小时/天；其他 channel 的 bucket 不混入。
- [ ] `?range=` 缺省为 30；非法值返回 `invalid_request`。
- [ ] 版本趋势从发布日（UTC 日界）开始，至多 14 天，不含未来日期。
- [ ] 删除 version 或 channel 后其 bucket 级联清除。
- [ ] 跨 app 访问趋势接口返回 `not_found`。
- [ ] 面板：channel 趋势图在 Channels 标签页对所有视图角色可见并可切换范围；版本趋势图在统计弹窗内显示；全零窗口显示空态提示；所有新文案来自类型化字典（en/zh 键对齐）。
- [x] 云 isolate 不走本 PRD 的写路径（见 `docs/prd/feed-hits-serverless.md`）。
