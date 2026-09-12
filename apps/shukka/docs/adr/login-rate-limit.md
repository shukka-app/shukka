# ADR: 云 isolate 上关掉进程内登录限速

## Status

Accepted.

## Context

`src/lib/rate-limit.ts` 用进程内 `Map` 做 15 分钟固定窗口（每 IP 10 次失败，全局 100 次）。Node 自托管（单进程）这样够用。云 isolate 上内存对不齐，换 isolate 等于清零。产品要求：`std-env` 认出云函数时不要跑这个模块；Node 保持原样。见 `docs/prd/login-rate-limit.md`。

## Decision

1. 用 unjs **`std-env`** 判断 isolate：`isWorkerd`、`isEdgeLight`、`isNetlify`、`isFastly`。`isNode` 在 Bun/Deno 兼容模式下也会为真，所以 **不**用 `isNode`；Node 路径以 `runtime === "node"` 且上述标志为假为准。
2. `isCloudFunction()`（`src/lib/runtime.ts`）为真时，`isLimited` 恒为 false，`recordFailure` / `recordSuccess` 为空操作。登录路由不用再写一份分支。
3. 不为限速引入 KV、D1 或其它远程计数。
4. `SHUKKA_TRUST_PROXY` 与窗口常数只作用于 Node。

## Alternatives

- **始终限速**：Worker 上无效，还可能让人以为已经防爆破。
- **KV / D1 窗口**：多一次热路径写；产品排除。
- **自造 `CF` / `VERCEL` 环境变量**：与 #47 的 `std-env` 约定重复。

## Trade-offs & failure bounds

- 云部署的登录防爆破完全交给平台防火墙。Shukka 不在 isolate 上提供第二道计数。
- `std-env` 未列出的新 isolate 若标志都为假，会误走 Node 限速（进程内 Map，跨 isolate 无效）。新 runtime 出现时把标志加进 `isCloudFunction`。
