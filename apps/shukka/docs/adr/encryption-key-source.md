# ADR: S3 加密密钥的三个互斥来源

## Status

Accepted.

## Context

S3 secret 用 AES-256-GCM 加密后落库（[per-app-s3-and-secrets](per-app-s3-and-secrets.md)）。原先密钥只从 `{SHUKKA_DATA_DIR}/encryption.key` 读取，没有则首次启动生成；`SHUKKA_KEY_PATH` 可改路径。这对 Docker + 卷够用，但 systemd `EnvironmentFile`、secret manager 挂载文件、以及只把 secret 放进环境变量的安装方式需要另外两个入口。

产品约束见 `docs/prd/deploy.md`：filepath 与 value 二选一；都未设则保持今天的自动生成；冲突或非法 hex 拒绝启动。

## Decision

`loadEncryptionKey()` 在模块加载时解析一次（进程起不来即失败）：

1. `SHUKKA_ENCRYPTION_KEY` 与任一 filepath 来源（`SHUKKA_ENCRYPTION_KEY_FILEPATH` 或弃用别名 `SHUKKA_KEY_PATH`）同时出现 → 抛错。
2. `SHUKKA_ENCRYPTION_KEY_FILEPATH` 与 `SHUKKA_KEY_PATH` 都设且字符串不同 → 抛错。相同则当作 filepath。
3. 只设 `SHUKKA_ENCRYPTION_KEY` → 把值当 64 位 hex（trim 后）解析为 32 字节。不写任何密钥文件。空或非法 hex → 抛错。
4. 只设 filepath（新名或别名）→ 只读该文件，不自动创建，也不往 `./data` 另写一份（除非该路径就是那个文件）。文件不存在、空、非法 hex → 抛错。
5. 都未设 → 今天的默认：读 `{SHUKKA_DATA_DIR}/encryption.key`，没有则生成 `randomBytes(32).toString('hex')` 并 `0600` 写入。
6. 云 isolate（`isCloudFunction()`）：只接受 `SHUKKA_ENCRYPTION_KEY`。filepath / 默认写文件不受支持。见 [dual-runtime](dual-runtime.md)。

密钥材料格式不变：64 个 hex 字符，与现有 `encryption.key` 文件一致。AES-GCM 密文格式不变。`SHUKKA_KEY_PATH` 只保留一个版本。

不在本决策里改口令哈希（管理员密码 KDF 见 [password-kdf](password-kdf.md)）。

## Alternatives

- **filepath 覆盖时仍自动生成缺失文件**：与「从 secret 挂载只读」冲突；拒绝。自动生成只留给「两个新变量都未设」。
- **FILEPATH 与 KEY_PATH 不同时以 FILEPATH 为准**：静默忽略旧变量容易配错环境；拒绝，与 VALUE 冲突同一策略。
- **非法 hex 推迟到第一次加解密**：进程会起来但一改 app 就 `storage_error`；拒绝，启动时失败。
- **必填环境变量、取消自动生成**：破坏现有 Docker + 卷安装；拒绝。

## Trade-offs & failure bounds

- value 模式把备份边界拆开：丢掉 env 里的密钥等于丢掉全部已存 S3 secret，与丢掉 `encryption.key` 一样不可恢复。
- 模块加载即解析：Vite 热重载走 `globalThis` 缓存，与现有 `__shukkaKey` 相同；测不同 env 组合时调用导出的 `loadEncryptionKey()`，不依赖重载进程。
- 弃用别名一个版本后删除 `SHUKKA_KEY_PATH`；现存只设旧名的单元继续工作。
