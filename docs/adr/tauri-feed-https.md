# ADR: Tauri feed 的制品 URL 始终生成为 https

## Context

Tauri 生产客户端默认要求 HTTPS。feed 的绝对 URL 来自 `new URL(request.url).origin`（`src/server/feed.ts`），而 Nitro node-server 不信任 `X-Forwarded-Proto`（srvx 未传 `trustProxy`）：反代终结 TLS、回源 HTTP 时，feed JSON 里的制品 `url` 是 `http://`，客户端拒绝下载（shukka-app/shukka#72）。Kamal 的 kamal-proxy 等回源只讲 HTTP 的代理无法从部署侧修复这一跳。

## Decision

Tauri 链路（feed 文档与面板 Integration 展示的 feed URL）的 origin 统一经 `tauriFeedOrigin`（`src/server/updaters/tauri.ts`）：非 loopback 的 `http:` origin 改写为 `https:`；loopback（`localhost` / `127.0.0.1` / `::1`）保持原 scheme，本地开发与 e2e 不受影响。

不发明 `SHUKKA_PUBLIC_URL`（沿用 `docs/prd/deploy.md` 的既有决定），也不引入对 `X-Forwarded-Proto` 的信任：Tauri 协议要求 HTTPS，https 是唯一正确的生产输出，无需从请求推断。

## Alternatives

- **`SHUKKA_TRUST_PROXY=1` 时采信 `X-Forwarded-Proto`**：能一并修好所有读 `request.url` 的地方，但把正确性挂在运维开关上——没设开关的部署产出坏 URL；而 Tauri 本来就没有合法的 http 生产形态。
- **只在文档要求 HTTPS**：部署错了照样产出坏 URL，到客户端侧才暴露。
- **Sparkle 一同强制**：Sparkle 的传输要求与 Tauri 不同（macOS ATS 模型），未一并改；如需要另立决定。

## Trade-offs & failure bounds

- 非 loopback 的纯 HTTP 部署（如无 TLS 的 LAN）对 Tauri 不再可用：feed 会指到不存在的 https URL。这是有意的——该形态本来就无法服务生产客户端。
- 反代后部署的 Tauri feed 不再依赖回源协议；Electron（yml 相对文件名）与 Sparkle 的行为不变。
