---
title: 版本元数据
description: 给版本附加自定义 JSON，在面板编辑，并从客户端读取。
---

每个版本都可以附带一份自定义 JSON 对象。字段由你定义，含义由你的客户端解释；Shukka 负责保存与读取，不改变更新源的内容。

```json
{
  "build": { "commit": "abc123" },
  "labels": ["desktop", "preview"]
}
```

顶层必须是对象，可以嵌套对象、数组及其他 JSON 值。默认值为 `{}`；大小上限为 **16 KiB，按紧凑 JSON 的 UTF-8 编码计算**，不含 API 请求外层结构。已发布版本的元数据公开可读，请勿填写凭据或密钥。

## 上传时传入

在现有的 [GitHub Action 发布步骤](/zh-CN/docs/ci)中添加 `metadata`：

```yaml
with:
  # 保留现有的服务器、应用、channel 与制品输入。
  metadata: '{"build":{"commit":"abc123"},"labels":["desktop","preview"]}'
```

使用独立上传脚本时，在现有上传配置之外设置对应的环境变量：

```sh
SHUKKA_METADATA='{"build":{"commit":"abc123"}}' node scripts/shukka-upload.mjs
```

JSON 无效、顶层不是对象或对象超限时，上传器会在开始上传前报错。直接调用 API 时，在 `POST /api/v1/upload/finalize` 的请求体中传入可选的 `metadata` 对象。元数据与版本原子保存，包括通过 `release: true` 立即发布的情况。

## 在面板编辑

1. 切换到 admin 或 developer 视图，打开应用的 **Channels** 标签页。
2. 点击版本行的**元数据**，弹窗会读取该版本当前的 JSON。
3. 修改 JSON 后点击**保存元数据**。保存替换整个对象，填写 `{}` 可以清空。

草稿、当前版本和已发布历史版本都可以编辑。校验失败或请求失败会保留输入；关闭未保存的编辑时会先确认是否放弃。多人同时保存同一版本时，以最后一次成功写入为准。

content 视图隐藏这个入口；视图角色只控制展示，不参与鉴权。元数据不要求开启 Release log。编辑元数据不会改变制品、发布时间或 channel 的当前版本。

## 读取精确版本

```http
GET /api/v1/apps/my-app/channels/stable/versions/1.4.0/metadata
```

```json
{
  "version": "1.4.0",
  "metadata": {
    "build": { "commit": "abc123" }
  }
}
```

先让 updater 选定目标版本，再按该应用、channel 和版本读取元数据。元数据不会跨版本或跨 channel 继承。这次独立读取失败时如何处理，由客户端决定。

已发布版本公开可读，被其他版本替换为历史版本后仍可读取。匿名读取草稿返回 `404`；有效的管理员会话或绑定该应用的 API key 可以读取草稿。显式发送 `Authorization` 时会校验凭据：无效 key 返回 `401`，绑定其他应用的 key 返回 `403`。

GET 响应带有 `Cache-Control: no-store`。读取元数据不会增加更新检查计数。

## 通过 API 替换

向同一 URL 发送 `PUT`，使用管理员会话或该应用的 API key 鉴权：

```json
{
  "metadata": {
    "build": { "commit": "def456" }
  }
}
```

返回值与 GET 相同，为 `{ version, metadata }`。PUT 替换整个对象，不合并字段；发送 `{ "metadata": {} }` 可以清空。无效写入不会改变已保存的对象。
