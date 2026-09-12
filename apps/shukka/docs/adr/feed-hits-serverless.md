# ADR: 云 isolate 上跳过 recordHit

## Status

Accepted.

## Context

`recordHit` 在每次公开 feed 命中时同步双写版本计数器与 `hit_buckets`（[hit-trends](hit-trends.md)）。云 isolate 上热路径写远程 SQLite 不可接受，进程内缓冲也不可靠。产品要求 serverless 不记 feed 命中，用量看平台日志。见 `docs/prd/feed-hits-serverless.md`。

## Decision

1. `recordHit` 在 `isCloudFunction()` 为真时直接返回。feed 路由不另写分支。
2. 趋势读接口与面板入口保留；无写入则序列为空。不在本变更里按 runtime 藏 UI。
3. 不为命中引入 KV、Analytics Engine、或采样队列。

## Alternatives

- **始终写入**：挡住 Worker 热路径。
- **定时刷缓冲**：isolate 随时销毁，不可靠。
- **删趋势 API**：Node 仍需要；serverless 空序列即可。

## Trade-offs & failure bounds

- 云部署的面板计数与趋势会一直空。这是声明过的产品行为，不是故障。
- App API 制品 302 本来就不计命中；本决策不改变那条路径。
