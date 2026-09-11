# ADR: 版本制品走独立 App API 302，不记命中

## Status

Accepted.

## Context

面板要给任意已 finalize 版本（含 draft）下载安装包。公开 feed（`docs/adr/update-feed-proxy.md`）不能用：

- draft 文件名与不存在相同，404，避免未发布包被猜名下载。
- 制品 302 会 `recordHit`，把运营自己点下载算进客户端统计。

制品字节仍不得经过 Shukka 进程。面板详情里已经有每个版本的 `filename` 列表，不需要再做一个「列安装包」接口。

## Decision

1. 新增 `GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/artifacts/{filename}`。`requireAppActor`（session 或绑定该 slug 的 API key）。自然键，无数字 id。
2. 在**该版本**的已存制品里按文件名查找（`getVersion`，draft 与已发布同一路径），`presignGet` 后 **302** + `cache-control: no-store`。不调用 `recordHit`。
3. 服务端不套安装包启发式：该版本上任意已存文件都可领取。瓷砖过滤只在 `src/lib/installers.ts`，给面板用，可单测。
4. 瓷砖用 `<a href>` 打这条 API，浏览器跟随 302 到 S3。不 `fetch` JSON、不把 S3 字节拉进 JS。
5. `platformsOf` / `inferTauriTarget` / `src/server/feed.ts` 不动。
6. `presignVersionArtifact` 放在 `src/server/releases.ts`（制品所有权已在此），不新建 downloads 子系统。

## Alternatives

- **面板直链 `/api/update/...`**：draft 404，且污染 downloads。拒绝。
- **给公开 feed 开 session 旁路**：打破「draft ≡ 404」的公开面不变量。拒绝。
- **打开弹窗时批量 presign 成 `{ url }[]`**：未点击的文件也开始 1 小时倒计时；列表数据详情里已有。拒绝。
- **JSON `{ url }` 再 `location.assign`**：多一次往返；`api.get` 若跟随 302 会把字节拉进 JS。拒绝。
- **服务端按安装包规则 404**：把稳定 API 绑在会变的文件名启发式上；key 也可能要拉 yml。拒绝。
- **改 `platformsOf` 兼做瓷砖**：Electron 徽章读的是 yml 名，和「隐藏 yml」冲突。拒绝。

## Trade-offs and consequences

- 多一条与 feed 平行的 302 路径。测试必须证明这条路径命中数为 0，而 feed 仍会 +1。
- 知道文件名的 session / key 能下 draft 和 sidecar（yml / blockmap）。产品接受：这是鉴权面，不是公开面。
- 角色只藏按钮：content 拿着管理员 session 仍可打 URL。与现有 view-role 合同一致。
- 分类是文件名启发式，会漏掉怪名字；空弹窗是已声明行为，不在服务端补救。
- presign TTL 仍是 1 小时；只在点击时签发，不在打开弹窗时签发。
