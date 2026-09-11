# PRD: 云函数上关闭进程内登录限速

## Problem

登录失败限速存在进程内存 `Map` 里（15 分钟 / 10 次 / IP）。多 isolate 的云函数上这份计数既对不齐、也拦不住换 isolate 的请求。平台 WAF / 防火墙已经管滥用。

## Users

- **运维 / 管理员**：Node 自托管仍要限速；日后 Worker / Edge 部署依赖主机防火墙，不依赖 Shukka 计数。

## Goals

1. `std-env` 判定为云 isolate（`isWorkerd` / `isEdgeLight` / `isNetlify` / `isFastly`）时，本模块不产生 `rate_limited`。
2. 自托管 Node（`runtime === "node"`）保持今天的 15 分钟 / 10 次与全局 100 次、以及 `SHUKKA_TRUST_PROXY`。
3. 部署文档写明：serverless 靠主机防火墙，不靠 Shukka。

## Non-goals

- 用 KV / D1 / 远程存储重做窗口。
- 改 Node 上的窗口长度、阈值、或代理信任规则。
- 在本 issue 里上 Worker 运行时。

## Flows

### 运维：Docker / VPS（Node）

失败登录仍按来源 IP 限速；第 11 次返回 `rate_limited`（429）。反代后设 `SHUKKA_TRUST_PROXY` 的行为不变。

### 运维：云 isolate

登录只返回鉴权结果（错密 `unauthorized`）。本模块从不返回 `rate_limited`。滥用交给平台防火墙。

## User-visible states and failure behavior

- Node：超限 → `429 { error: "rate_limited" }`；成功登录重置该 IP 计数。
- 云 isolate：无论失败多少次，本模块都不限速。

## Acceptance criteria

- [x] Node：同一 IP 10 次失败后第 11 次仍是 429。
- [x] 检测到的 serverless：登录从不因本模块返回 `rate_limited`。
- [x] 部署文档写明 serverless 依赖主机防火墙，不依赖 Shukka。

## Exclusions and resolved product decisions

- 检测用 unjs `std-env`，与 #47 同一套 isolate 标志；不用自造 `process.env.CF`。
- 不在 KV/D1 重做窗口。
