# shukka-docs

Shukka 的公开文档站，面向部署与使用 Shukka 的用户。基于 [fumadocs](https://fumadocs.dev)（Next.js App Router + Tailwind CSS v4），使用 Fumadocs 内置 i18n，支持 `zh-CN` 与 `en-US`。访问 `/` 时按 `Accept-Language` 进入对应语言前缀（`/zh-CN/docs`、`/en-US/docs`）。

## 开发

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 生产构建（next build）
npm start          # 运行构建产物
```

## 内容结构

内容在 `content/docs/{zh-CN,en-US}/`（Fumadocs `parser: 'dir'`），与 [shukka 主仓库](https://github.com/akarachen/shukka)的关系是「从仓库事实提炼的对外文档」，不是 `docs/` 目录的镜像（主仓库的 `docs/prd/`、`docs/adr/`、`docs/spec.md` 是开发用内部文档）：

| 路径 | 内容 | 主要事实来源 |
|------|------|--------------|
| `index.mdx` | 简介与快速开始 | 主仓库 `README.md` |
| `deployment.md` | 自托管部署指南 | `docs/prd/deploy.md` |
| `cloudflare.md` | Cloudflare Workers 部署 | `docs/prd/dual-runtime.md`、`docs/prd/deploy.md` |
| `guide/` | 面板使用指南（应用与渠道、发布、API 密钥、发布日志） | `docs/prd/*.md`、`docs/spec.md`、`.claude/skills/shukka-ops/` |
| `integration/` | Electron / Tauri 客户端集成 | `README.md`、`docs/prd/updater-adapters.md`、`tests/e2e/` |
| `ci.md` | GitHub Action 与上传脚本 | `action.yml`、`scripts/shukka-upload.mjs` |

写作纪律：每条命令、URL 路径、环境变量、文件名都必须与主仓库代码一致；内部文档与代码不一致时以代码为准。

## API 参考（Scalar）

`/api` 路由用 [Scalar](https://scalar.com/)（`ApiReferenceReact`，客户端渲染）展示 `public/openapi.json`。主题色取自 Shukka 面板 token（`app/global.css` 的 `--scalar-*`），配置在 `lib/scalar-options.ts`。

`public/openapi.json` 是从主仓库的 spec 生成器（`src/server/openapi.ts`）提取的静态快照。主仓库 API 变更后重新生成：

```bash
npm run sync:openapi
# 可选环境变量：
#   SHUKKA_REPO    shukka 检出路径（默认 ../shukka）
#   SHUKKA_ORIGIN  写入 spec servers[0].url 的地址（默认 https://updates.example.com）
```

该脚本在 shukka 仓库里以 `npx tsx -e` 一次性执行提取，不会向 shukka 仓库写入任何文件。

## 主题

`app/global.css` 把 Shukka 面板的设计 token（`src/styles.css`：暖灰米色单色 + 焦橙强调色，明暗双主题）映射到 fumadocs 的 `--color-fd-*` 变量与圆角阶梯；字体为 Instrument Sans / Geist Mono（fontsource 本地加载）。
