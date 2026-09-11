# ADR: 认证模型——首启设密的单管理员 + 单 app API key

## Context

三类调用方：管理员（面板）、CI（上传）、终端应用（匿名读 feed）。单管理员自托管，无用户体系。

## Decision

- **面板**：首次启动进入 setup 页设置管理员密码（`scrypt$` 或 `pbkdf2$` hash 落库，scheme 在首次 setup 锁定，见 [password-kdf](password-kdf.md)）；登录换 HttpOnly session cookie（session 表存 SQLite，带过期）；面板内可改密，改密使既有 session 失效且沿用已存 scheme。
- **上传 API**：API key 形如 `shk_<random>`，明文只在创建响应出现一次，库中存 SHA-256 hash；每个 key 绑定一个 app，只能操作该 app；可吊销，吊销即时生效。
- **更新 feed**：`/api/update/*` 完全无鉴权，这是产品契约（electron-updater 无凭证读取）。

## Alternatives

- **环境变量密码**：少一个 setup 页，但改密要重启、密码明文躺在部署配置里。
- **key 多 app / 全局 key**：授权面大，校验与 UI 复杂化，v1 不需要。

## Trade-offs & failure bounds

- 忘记密码的恢复路径：删除数据库中 admin 记录（文档提供 CLI/SQL 一行），重走 setup；不做邮箱找回。
- 无速率限制之外的防爆破设计。自托管 Node 的登录接口做固定窗口限速；云 isolate 关掉该模块，交给平台防火墙（见 [login-rate-limit](login-rate-limit.md)）。
