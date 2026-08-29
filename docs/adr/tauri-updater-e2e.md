# ADR: 用真实 Tauri 进程 + plugin-updater 做 feed e2e

## Context

Shukka 的 Tauri feed 是生成的静态 `platforms` JSON，`url` 为 302 到存储，`signature` 为 `.sig` 正文。HTTP 测试只能证明 JSON 形状；证明不了 `tauri-plugin-updater` 会请求哪个 target、会不会跟随 302、minisign 是否对得上。

完整打包安装（codesign / AppImage 替换 / NSIS）在 CI 里不可靠，也不属于 Shukka 的责任。

## Decision

1. **拉起真正的 Tauri 进程**（`tests/e2e/tauri-app`，无窗口）。在 `setup` 里用 Rust API：`updater_builder().pubkey().endpoints().check()`，再 `download()`。不调用 `install`。
2. **模拟 updater 产物**：同一版本目录含 darwin / linux / windows 文件名（Tauri adapter 的 `inferFeedTarget` 能认出）+ `tauri signer sign` 写出的 `.sig`。一次 finalize 上传整目录，不带 `latest.json`，由 adapter 生成 feed。
3. **断言到 download + 验签**：`check` 看到新版本，`download` 成功（跟随 302 并用 e2e 公钥校验 minisign）。应用自身版本固定 `1.0.0`。
4. **HTTP 本机**：`dangerousInsecureTransportProtocol: true`，否则 release 构建拒绝非 HTTPS endpoint。
5. **密钥每次生成**：`tauri signer generate --ci`，公钥经环境变量注入，不入库。
6. **依赖隔离**：Tauri / Rust 在 `tests/e2e/tauri-app/`，不进根 `npm ci`。`npm run check` 不跑此套。
7. **不测 install / relaunch**。

## Alternatives

- **只 curl latest.json**：抓不到 plugin 的 target 选择、302、验签。
- **打成已安装应用再更新**：与 Electron e2e 同一理由排除。
- **单独写一个 minisign 客户端**：测的不是 plugin-updater。

## Trade-offs & failure bounds

- 不覆盖 `install`。那一步失败不表示 feed 坏了。
- 首次 `cargo build` 要几分钟并需要本机 Rust；CI 用 `dtolnay/rust-toolchain` + 缓存。
- `tauri::generate_context!()` 在编译期要求 `frontendDist` 路径存在。e2e 应用无真实前端，用 `tests/e2e/tauri-app/frontend/index.html` 占位；不能叫 `dist`（根 `.gitignore` 会忽略）。
- plugin 主版本若改 JSON 字段或 target 名，e2e 会红——这是要的。
