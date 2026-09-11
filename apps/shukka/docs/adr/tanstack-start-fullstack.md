# ADR: TanStack Start 单应用全栈

## Context

Shukka 需要面板 UI、鉴权 API、无鉴权更新 endpoint 三类 HTTP 表面。仓库脚手架已选定 TanStack 生态（React 19 + TanStack Query/Router）。

## Decision

整个产品是一个 TanStack Start 应用：页面走文件路由，API 走 server routes（`server.handlers`），Nitro 构建为单个 Node 服务部署。不拆 workspace、不引入独立后端框架。

- 面板页面：`src/routes/` 下的 React 路由。
- 上传 API：`/api/v1/*` server routes。
- 更新 feed：`/api/update/*` server routes。
- 现有 react-router-dom 脚手架代码迁移到 TanStack Router 并移除 react-router-dom 依赖。

## Alternatives

- **Hono + Vite SPA 双包 workspace**：边界更显式，但单管理员自托管场景下多一层构建/部署协调，收益不成比例。
- **Next.js**：与既有 TanStack 依赖冲突，长驻自托管服务与流式 302 场景无优势。

## Trade-offs & failure bounds

- Server routes 与页面同进程：feed 流量高峰会与面板争资源；可接受，制品字节不经过本服务（见 [presigned-direct-upload](presigned-direct-upload.md)）。
- TanStack Start 迭代较快，升级需要跟 breaking change；锁定版本、升级走独立提交。
