# ADR: Node Nitro 与 Cloudflare Worker 两套构建

## Status

Accepted.

## Context

产品要双运行时：自托管仍是 TanStack Start + Nitro Node；Cloudflare Worker 也必须是全面板。预备工作（libsql 动态入口、aws4fetch、setup 锁定的 pbkdf2、isolate 上关掉限速与 recordHit、环境变量密钥）已落地。见 `docs/prd/dual-runtime.md`。

面板、路由、server handlers 是同一份，没有第二套 UI。TanStack Start 上 Workers 的官方路径就是 `@cloudflare/vite-plugin` + `@tanstack/react-start/server-entry`。本仓库默认 `vite.config.ts` 走 `nitro()` 是为了 Docker / `node .output/server/index.mjs`，和官方 Worker 插件不能塞进同一次构建。

Worker 的 vars / secrets 是 bindings。Shukka 在模块加载时读 `process.env` 建库、加载加密密钥，所以入口先把 bindings 抄到 `process.env`，再动态加载官方 `server-entry`。这不是再适配一层面板。

## Decision

1. **两套 Vite 配置**。默认 `vite.config.ts` 保持 `nitro()`（`npm run build` → `.output/`）。`vite.config.worker.ts` 用 `cloudflare({ viteEnvironment: { name: 'ssr' } })` + `tanstackStart()`，不要 nitro。
2. **`src/worker.ts`** 是 wrangler `main`：先 `applyWorkerEnv(env)`，再动态 `import('@tanstack/react-start/server-entry')`。这样 `createDb()` / `loadEncryptionKey()` 能读到 `process.env`。
3. **`wrangler.jsonc`**：`nodejs_compat`，`compatibility_date` 2026-08-28。不把 secret 写进仓库。
4. **云上密钥**：只接受 `SHUKKA_ENCRYPTION_KEY`。filepath / 默认写 `{data}/encryption.key` 在 isolate 上关闭。
5. **云上数据库**：已有 `createWebDb()` + `SHUKKA_DB_URL`。不在 isolate 内 migrate。
6. **不改** Node 的模块顶层 `await createDb()` / 默认生成密钥文件。

## Alternatives

- **Nitro `cloudflare_module` preset**：少一个 Vite 文件，但 TanStack 官方 Worker 路径是 Cloudflare Vite 插件；两套 preset 抢一个 `vite.config.ts` 会弄坏 Docker 构建。
- **到处 `import { env } from 'cloudflare:workers'`**：Node 构建不能静态依赖该模块。
- **丢掉 Nitro、只维护 Worker 构建**：违背「Docker 仍是推荐自托管」。

## Trade-offs & failure bounds

- 两套构建：Worker 插件变更不自动等于 Node 产物仍好。两边都要能 `vite build`。
- 若有人忘了 `applyWorkerEnv`，Worker 会在缺 `SHUKKA_DB_URL` / 密钥时启动失败。
- `nodejs_compat` 不加载原生 addon；依赖的是 libsql web + aws4fetch + `node:crypto`。
- 本 PR 不代替一次真实账号上的 setup→发版走查。
