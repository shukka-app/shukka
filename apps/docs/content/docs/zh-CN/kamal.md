---
title: Kamal
description: 用 Kamal 把 Shukka 公开镜像部署到一台自有主机。
---

这条路径用 [Kamal](https://kamal-deploy.org) 把公开镜像 `ghcr.io/shukka-app/shukka` 部署到一台主机，数据落在命名卷 `shukka-data`。前置：一台 SSH 可登录的 Linux 主机、一个指到它的域名（80 / 443 开放）、部署机装有 Kamal 2。

## deploy.yml

```yaml
# config/deploy.yml
service: shukka

# 公开镜像直接拉取不构建；生产建议钉 tag：ghcr.io/shukka-app/shukka:1.1.1
image: ghcr.io/shukka-app/shukka

# 不构建也用于选拉取的架构变体（arm64 主机改成 arm64）
builder:
  arch: amd64

servers:
  web:
    hosts:
      - 192.0.2.10           # 你的主机

proxy:
  host: updates.example.com  # 指到这台主机的域名
  app_port: 3000             # Shukka 听 3000
  ssl: true
  forward_headers: true      # ssl 时默认不转发 X-Forwarded-*，显式打开
  healthcheck:
    path: /api/health        # 默认 /up，Shukka 没有这条路

volumes:
  - shukka-data:/data        # SQLite 与 encryption.key 都在这块命名卷

env:
  clear:
    SHUKKA_TRUST_PROXY: "1"  # 配合 forward_headers，登录限速取客户端 IP
```

公开镜像匿名可拉，不需要 `registry` 段。加密密钥默认首次启动生成到卷里的 `encryption.key`；想自己管，在 `.kamal/secrets` 写 `SHUKKA_ENCRYPTION_KEY=<64 hex>` 并加：

```yaml
env:
  secret:
    - SHUKKA_ENCRYPTION_KEY
```

## 部署

```bash
kamal setup     # 首次
kamal deploy    # 之后每次
```

实例未初始化时 health 也是 ok，部署不会卡在等密码。完成后打开 `https://updates.example.com` 走 setup，冒烟：

```bash
curl -sS https://updates.example.com/api/health
# {"status":"ok","db":"ok"}
```

## 升级与回滚

升级：`image` 换新 tag 再 `kamal deploy`，启动时自动 migrate。回滚：钉回旧 tag 再 deploy。数据都在 `shukka-data` 卷里，换容器不动卷；`latest` 无法回滚，生产钉版本。

## 运维

- 日志：`kamal app logs -f`。
- 备份：卷在主机 `/var/lib/docker/volumes/shukka-data/`，备份边界与 [自托管部署](/zh-CN/docs/deployment) 的「备份与升级」相同。
- 忘记密码：镜像里没有 sqlite3。先 `kamal app stop`，用临时容器改库，再 `kamal app start` 并重走 setup：

```bash
docker run --rm -v shukka-data:/data alpine \
  sh -c 'apk add --no-cache sqlite && sqlite3 /data/shukka.db "DELETE FROM admin; DELETE FROM sessions;"'
```

## 注意

- **单实例。** SQLite 单写者，`servers` 写多台主机得到的是多个各自独立的实例（各挂各的卷），不是 HA。
- **换容器有短暂重叠。** `kamal deploy` 先起新容器、健康检查过了再停旧的，几秒内两个进程共用同一块卷；同一主机上 SQLite 靠文件锁协调，短暂重叠安全，但不要长期跑两个进程。
