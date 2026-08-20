---
title: API 密钥
description: API key 的能力面、生命周期与使用方式。
---

API key 形如 `shk_<random>`，绑定单个 app，供 CI / agent / 脚本以程序化方式操作该 app。

## 能力面

绑定 app 内、面板能点的读写操作，key 基本都能做：

- 读 app 详情、改 app 设置（改设置会触发 S3 写探测）
- channel / version / release note 的 CRUD
- 设 `currentVersion`（promote draft / 回滚）
- 读下载计数与趋势
- 上传版本（`upload/init` + `upload/finalize`）

key **不能**做的：

- 列出 / 创建其他 app、删除整个 app
- 签发 / 吊销 / 删除 API key（key 生命周期只在面板）
- 改管理员密码等实例级操作（`/api/admin/*` 仅 session）

用 A app 的 key 操作 B app 返回 403；key 吊销或无效返回 401。

## 生命周期

- 在 app 详情的 **API keys** 标签页创建与吊销。
- **明文只在创建响应中出现一次**，此后不可再取得；数据库里只存 hash。没记下来就吊销重建。
- 吊销立即生效。

## 使用

```bash
curl -s "$SHUKKA_URL/api/v1/apps/my-app" \
  -H "Authorization: Bearer shk_…"
```

错误响应统一为 `{ error, message }` 信封，`error` 取自固定码集：`unauthorized`、`forbidden`、`not_found`、`conflict`、`invalid_request`、`storage_error`、`metadata_error`。

完整的可调用操作见 [API 参考](/zh-CN/api)。
