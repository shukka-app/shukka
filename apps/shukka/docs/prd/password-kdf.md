# PRD: 管理员口令哈希算法（setup 时锁定）

## Problem

管理员密码今天一律写成 `scrypt$`。scrypt 故意偏慢，适合现有 Docker / VPS，但不适合日后 CPU 预算极短的运行时（Workers Free 约 10ms）。需要在首次 setup 选定写入算法，初始化之后不得再换，避免已有实例被环境变量悄悄改写成另一种 hash。

## Users

- **运维 / 管理员**：安装时决定口令哈希算法；之后只登录与改密，不接触 KDF。
- **已有 Docker / VPS 实例**：升级后继续用默认 scrypt，行为不变。

## Goals

1. 两种写入算法，只在**首次 setup** 由 `SHUKKA_PASSWORD_HASH` 选定。
2. 未设或 `scrypt`：继续写今天的 `scrypt$<salt-hex>$<derived-hex>`。
3. `pbkdf2`：写 `pbkdf2$…`，登录与改密可用。
4. 初始化之后，改密与后续管理员 hash **沿用已存前缀**，忽略后来的环境变量翻转。
5. `verify` 按已存前缀分派，始终同时接受 `scrypt$` 与 `pbkdf2$`。
6. 非法环境变量（如 `argon2`）使 setup 以 `invalid_request` 失败。

## Non-goals

- argon2 / argon2id。
- 登录时 rehash。
- 面板 UI 或设置项切换 KDF。
- 为 scheme 加数据库列或迁移（从已存 `scheme$…` 前缀推断）。
- 自动把已有 `scrypt$` 转成 `pbkdf2$`。
- 把管理员密码本身做成环境变量。

## Flows

### 运维：默认安装（Docker / VPS）

1. 不设 `SHUKKA_PASSWORD_HASH`（或设 `scrypt`）。
2. 首次打开面板走 setup，设置至少 8 位密码。
3. 库中管理员 hash 以 `scrypt$` 开头；登录与改密继续写 `scrypt$`。

### 运维：setup 前选择 pbkdf2

1. 在**尚未初始化**时设置 `SHUKKA_PASSWORD_HASH=pbkdf2`。
2. 走 setup。库中 hash 以 `pbkdf2$` 开头。
3. 之后即使把环境变量改成 `scrypt` 或删掉，改密仍写 `pbkdf2$`。

### 运维：已初始化后翻转环境变量

1. 实例已有 `scrypt$`（或 `pbkdf2$`）管理员行。
2. 把 `SHUKKA_PASSWORD_HASH` 改成另一种算法并重启。
3. 登录仍按已存前缀校验；改密仍写同一前缀。环境变量不再被咨询。

### 运维：把已有 scrypt 实例迁到只适合 pbkdf2 的运行时

面板不会转换。删除 `admin` 与 `sessions` 后设 `SHUKKA_PASSWORD_HASH=pbkdf2`，重走 setup（与忘记密码恢复同一路径）。手改 SQLite 中的 hash 不受支持。

## User-visible states and failure behavior

- 未初始化 + 合法 env（未设 / `scrypt` / `pbkdf2`）：setup 成功，写入对应前缀。
- 未初始化 + 非法 env：setup 返回 `invalid_request`，不写入 `admin` 行。
- 已初始化 + 任意 env：登录与改密不读该变量；错误密码仍是 `unauthorized`。
- 已存前缀无法识别：校验失败（与错误密码相同，不泄内部格式）。

## Acceptance criteria

- [x] 未设 `SHUKKA_PASSWORD_HASH` 时，setup / 登录 / 改密的管理员 hash 保持 `scrypt$`。
- [x] 仅在首次 setup 前设 `pbkdf2` 才会写入 `pbkdf2$`；此后改密仍为 `pbkdf2$`，即使 env 改成 `scrypt`。
- [x] scrypt setup 之后把 env 改成 `pbkdf2`，改密不会写成 `pbkdf2$`。
- [x] 代码已能写 `pbkdf2$` 时，既有 `scrypt$` 仍能通过校验；两种前缀都能登录。
- [x] `SHUKKA_PASSWORD_HASH=argon2`（及其他非法值）使 setup 以 `invalid_request` 失败。
- [x] 部署文档写明：安装时选定，初始化后锁定；已有 `scrypt$` 要上 CF Free 须重走 setup。

## Exclusions and resolved product decisions

- 默认 scrypt，现有 Docker / VPS 安装不变。
- 写入算法锁在首次 setup，不锁在进程启动。
- 从已存字符串前缀推断 scheme，不加列。
- 不提供登录 rehash、设置页切换、argon2。
- 用户向安装文案在 [shukka-app/docs](https://github.com/shukka-app/docs) 跟进；本仓库合同在 `docs/prd/deploy.md` 与 `docs/spec.md`。
