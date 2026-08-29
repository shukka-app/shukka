# ADR: 管理员口令双写入算法（前缀分派，setup 锁定）

## Status

Accepted.

## Context

管理员密码是单行 hash（[auth-model](auth-model.md)）。今天 `hashPassword` 只写 `scrypt$<salt-hex>$<derived-hex>`，`verifyPassword` 只认 scrypt。scrypt 对现有 Node / Docker 合适，但对日后 Workers Free 的约 10ms CPU 过重。产品要求两种写入算法，**只在首次 setup** 用环境变量选定，初始化后不得换写入方；校验始终按已存前缀分派。见 `docs/prd/password-kdf.md`。

## Decision

1. **可写 scheme** 只有 `scrypt` 与 `pbkdf2`。没有 argon2。
2. **存储格式** 一律 `scheme$…`，从第一个 `$` 前的 token 推断，不加数据库列。
   - scrypt（不变）：`scrypt$<salt-hex>$<derived-hex>`。`node:crypto` `scryptSync`，16 字节 salt，64 字节派生。
   - pbkdf2：`pbkdf2$<iterations>$<salt-hex>$<derived-hex>`。PBKDF2-HMAC-SHA256，16 字节 salt，32 字节派生。
3. **迭代次数** 写入常数 `PBKDF2_ITERATIONS = 100_000`。对单管理员自托管足够；也小到日后 WebCrypto / Workers Free 能在约 10ms 内算完。校验读字符串里的 iterations，不把次数写死在 verify。校验拒绝非正整数或超过 `10_000_000` 的 iterations（避免手改库造成登录挂死）。
4. **环境变量** `SHUKKA_PASSWORD_HASH` 只在 `initializeAdmin` 读取：未设或 `scrypt` → 写 scrypt；`pbkdf2` → 写 pbkdf2；其它值（含空串、`argon2`）→ `invalid_request`。登录与改密不读该变量。
5. **`hashPassword(password, scheme)`** 由调用方传入 scheme。`changePassword` 用已存 hash 的前缀，忽略后来的 env。
6. **`verifyPassword`** 按前缀分派；未知或残缺字符串返回 false（与错密相同）。
7. Node 实现用 `node:crypto`（`scryptSync` / `pbkdf2Sync`）。存储格式不绑定 API，日后 Workers 可用 WebCrypto 写出同一 `pbkdf2$…` 串。

## Alternatives

- **只 scrypt**：现有部署最简单，但挡住 Workers Free。
- **只 pbkdf2**：破坏已有 `scrypt$` 行，也让默认 Docker 路径变弱。
- **登录 rehash / 面板切换 KDF**：多一次写路径和误操作面；产品排除。
- **数据库 scheme 列**：与已存前缀重复，还要迁移。
- **argon2id**：Workers 不友好，产品排除。
- **OWASP 2023 的 600_000 次 PBKDF2**：更硬，但 Workers Free 算不完；单管理员实例接受 100_000。

## Trade-offs & failure bounds

- 已初始化实例改 env **不会**改写 hash。要把 `scrypt$` 换成 `pbkdf2$`，须删 `admin` + `sessions` 后重走 setup。
- 手改 SQLite 中的 `password_hash` 不受支持。前缀可识别则按该 scheme 校验与改密；不可识别则无法登录。
- 100_000 次 SHA-256 PBKDF2 弱于银行级 KDF。本系统是单管理员自托管，另有登录限速。
- `hashPassword` 不再咨询环境变量，避免改密路径误读后来翻转的 env。
