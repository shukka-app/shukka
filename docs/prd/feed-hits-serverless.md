# PRD: 云函数上不记 feed 命中

## Problem

公开 feed 每次 yml / 制品 302 都同步写 SQLite（`recordHit`：总量计数器 + 小时 bucket）。这假设长驻进程和本地 WAL。云 isolate 上热路径写远程库撑不住，定时刷内存缓冲也不可靠。请求量已经在平台日志里。

## Users

- **运维**：Node 自托管继续看面板计数与趋势；Worker / Edge 部署用 Cloudflare / 主机分析，不指望 Shukka 第二套计数。

## Goals

1. `std-env` 判定为云 isolate 时，`/api/update/*` 不写 hit 行、不递增版本计数器。
2. 自托管 Node 保持今天的双写与趋势 API。
3. spec / 部署文档写明：命中计数与趋势是自托管专有能力。

## Non-goals

- 改 Node 的 hit 语义、采样、或通用异步队列。
- 在 KV / Analytics Engine 重做计数。
- 藏面板趋势入口（无写入时读接口自然为空）。

## Flows

### 运维：Docker / VPS

feed 检查与制品 302 仍计入计数器与 bucket；趋势图与今天相同。

### 运维：云 isolate

feed 仍返回 yml / 302。计数器与 `hit_buckets` 不增加。趋势接口可继续存在，序列为空。看量用平台日志。

## User-visible states and failure behavior

- Node：与 `docs/prd/hit-trends.md` 相同。
- 云 isolate：feed 成功不伴随命中写入；面板计数保持 0（除非从别处导入）。

## Acceptance criteria

- [x] spec / 部署文档写明命中计数与趋势是自托管专有。
- [x] 云 isolate 上 `/api/update/*` 不写 hit 行、不递增计数器。
- [x] Node 的 recordHit / feed 路径测试保持原样。

## Exclusions and resolved product decisions

- 检测与 #52 同一 `isCloudFunction()`。
- 不在本 issue 改 Node 写路径。
