# 生产部署：Docker + Nginx + ACME

这套配置把官网跑在三个容器里：

| 容器 | 镜像 | 职责 |
|---|---|---|
| `aether-web` | 由 `web/Dockerfile` 构建 | Next.js standalone（Node 22，非 root 用户，健康检查） |
| `aether-nginx` | 由 `deploy/nginx/Dockerfile` 构建 | TLS 终止、HTTP/2、静态资源缓存、压缩、安全响应头、反向代理 |
| `aether-acme` | `neilpang/acme.sh` | 通过 HTTP-01 webroot 申请 / 续期证书，并触发 Nginx reload |

证书与 ACME challenge 目录通过 `deploy/certs`、`deploy/www` 共享；Web 端口只在 Docker 内网暴露，宿主机只开放 80/443。

---

## 1. 前置条件

- Docker Engine 24+ 与 Docker Compose v2
- 服务器安全组 / 防火墙放行 **80/tcp**（ACME 验证必须）和 **443/tcp**
- 域名 A 记录（以及 AAAA，如果启用了 IPv6）已经指向服务器
- 服务器上没有其他进程占用 80/443（如系统自带 Nginx）

验证解析：

```bash
dig +short forge.example.com
```

---

## 2. 配置

```bash
cp .env.prod.example .env.prod
```

编辑 `.env.prod`：

```ini
DOMAIN=forge.example.com
ACME_EMAIL=ops@example.com
ACME_STAGING=1          # 第一次先用 staging 验证流程
ACME_FORCE=0

NEXT_PUBLIC_CHAIN_ID=56
NEXT_PUBLIC_AETHER_ADDRESS=0x...
NEXT_PUBLIC_RELIC_ADDRESS=0x...
NEXT_PUBLIC_LOOM_ADDRESS=0x...
NEXT_PUBLIC_FORGE_ADDRESS=0x...
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_USDT_ADDRESS=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_USDT_DECIMALS=18
NEXT_PUBLIC_DEPLOY_BLOCK=...
NEXT_PUBLIC_RPC_URL=https://bsc-dataseed.bnbchain.org
NEXT_PUBLIC_DEMO_FAUCET=0
NEXT_PUBLIC_SELF_REGISTER=0
```

> `NEXT_PUBLIC_*` 会在 **构建时** 内联进前端 bundle。修改后必须重新 `build`，只重启容器无效。
> `.env.prod` 已被 `.gitignore` 忽略，不要提交。

```bash
docker compose --env-file .env.prod config   # 校验配置
```

---

## 3. 先用 staging 验证

```bash
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod logs -f acme nginx
```

流程：

1. `aether-web` 启动并通过健康检查；
2. `aether-nginx` 启动；如果本地没有证书，会先生成 **3 天自签名引导证书**，保证 443 可用；
3. `aether-acme` 等待 Nginx，然后申请证书、写入 `deploy/certs/` 并 `touch /certs/.reload`；
4. Nginx 守护进程检测到标记后自动 `nginx -s reload`（通常 20 秒内）。

看到 `certificate installed` 后，用浏览器访问域名。staging 证书浏览器会提示不受信任，这是预期。

```bash
curl -I http://forge.example.com          # 应 301 到 https
curl -I https://forge.example.com         # staging 下加 -k
```

---

## 4. 切换为正式证书

Let's Encrypt 正式环境有「相同域名每周 5 张」的限流，确认 staging 流程无误后再切换：

```bash
docker compose --env-file .env.prod down

# 清除 staging 的 ACME 账户与证书状态
docker volume rm aether-forge_acme_home
rm -f deploy/certs/fullchain.pem deploy/certs/privkey.pem deploy/certs/.issued

# 修改 .env.prod：
#   ACME_STAGING=0
#   ACME_FORCE=1
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod logs -f acme
```

签发成功后 **立刻把 `ACME_FORCE` 改回 `0`** 并再次 `up -d`，否则每次重启都会强制重新签发并触发限流。

> 如果跳过 staging 直接在正式环境签发，也可以；失败时同样先检查 80 端口、DNS 与 `deploy/www` 写入权限，再重试。

---

## 5. 自动续期

- `aether-acme` 每 12 小时执行一次 `acme.sh --cron`，证书到期前 60 天内自动续期；
- 续期时 `--install-cert` 的 `reloadcmd` 会写入 `deploy/certs/.reload`；
- `aether-nginx` 的 entrypoint 守护循环检测该文件并平滑 reload，不断连接；
- 证书、账户状态分别在 `deploy/certs/` 与 Docker volume `aether-forge_acme_home`，请纳入备份。

手动强制续期：

```bash
docker compose --env-file .env.prod exec acme acme.sh --renew -d "$(grep ^DOMAIN= .env.prod | cut -d= -f2)" --ecc --force
docker exec aether-nginx nginx -s reload
```

---

## 6. Nginx 做了哪些优化

`deploy/nginx/nginx.conf`：

- `worker_processes auto`、`worker_connections 8192`、`worker_rlimit_nofile 65535`、`multi_accept`、`epoll`
- `sendfile` / `tcp_nopush` / `tcp_nodelay`，`open_file_cache` 降低静态文件 syscall
- 全局 `gzip`（level 6，覆盖 JS/CSS/JSON/SVG/WASM/字体）；Next.js 自身压缩已关闭，避免重复压缩
- upstream `keepalive 64`，代理连接复用；代理缓冲区显式配置
- `server_tokens off`，超时时间收紧（client 15s / send 30s / keepalive 65s）
- `map $http_upgrade` 支持 WebSocket 升级（预留给未来实时功能）
- `limit_req_zone`（25 r/s per IP，burst 60）与 `limit_conn`（32 并发/IP）
- 访问日志输出到 Docker stdout（`json-file` 轮转 20 MB × 5），不再写容器内文件

`aether.conf.template`：

- 80 → 443 永久重定向，保留 `/.well-known/acme-challenge/` 纯 HTTP
- HTTP/2、TLS 1.2/1.3、ECDSA 优先、session cache 20 MB、session tickets off、OCSP stapling
- HSTS（1 年，含子域）、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`
- `/_next/static/`：代理缓存 365 天 + 浏览器 `immutable`，`stale-if-error`、`proxy_cache_lock`
- 图片/字体/图标：30 天缓存
- 动态页面关闭 `proxy_buffering`，兼容 App Router streaming SSR
- `/api/` 单独限流；`/healthz` 不记日志用于健康检查
- 未知 SNI 直接 `return 444`

---

## 7. 日常运维

```bash
# 状态
docker compose --env-file .env.prod ps

# 日志
docker compose --env-file .env.prod logs -f --tail=200 web nginx acme

# 更新前端（重新构建以刷新 NEXT_PUBLIC_*）
git pull
docker compose --env-file .env.prod build --pull web
docker compose --env-file .env.prod up -d

# 只重载 Nginx 配置
docker exec aether-nginx nginx -t && docker exec aether-nginx nginx -s reload

# 证书状态
docker compose --env-file .env.prod exec acme acme.sh --list
```

备份：

```bash
tar czf aether-deploy-$(date +%F).tgz deploy/certs deploy/acme .env.prod
docker run --rm -v aether-forge_acme_home:/data -v "$PWD":/backup alpine \
  tar czf /backup/acme-home-$(date +%F).tgz -C /data .
```

---

## 8. 常见问题

| 现象 | 排查 |
|---|---|
| ACME 报 `Invalid response ... 404` | `deploy/www/.well-known/acme-challenge/` 是否可写；80 端口是否被占用或被 CDN 拦截；`curl http://$DOMAIN/.well-known/acme-challenge/test` 是否命中 Nginx |
| 申请被 Let's Encrypt 限流 | 先用 `ACME_STAGING=1` 调试；正式环境重复签发会触发每周 5 张限制，等待或换 staging |
| 502 Bad Gateway | `docker compose logs web`；确认 `aether-web` 健康；Next 构建时地址是否正确 |
| 证书更新后浏览器仍旧证书 | `docker exec aether-nginx nginx -s reload`；检查 `deploy/certs/fullchain.pem` 的修改时间 |
| 首页正常但静态资源 404 | 确认构建上下文包含 `public/` 与 `.next/static`；`docker compose build --no-cache web` |
| 修改了合约地址但页面还是旧的 | `NEXT_PUBLIC_*` 是构建期变量，必须重新 build |
| HSTS 导致无法降级 HTTP | HSTS 是浏览器级缓存；测试环境不要开启 HSTS，或使用新域名/清缓存 |

### 安全建议

- 上线前把 `.env.prod` 权限设为 `600`，仅部署用户可读；
- 不要把 Docker socket 挂进任何容器；
- 证书私钥位于宿主机 `deploy/certs/`，注意备份与访问控制；
- 生产环境保持 `NEXT_PUBLIC_DEMO_FAUCET=0`、`NEXT_PUBLIC_SELF_REGISTER=0`；
- 如接入 CDN/WAF，在 `nginx.conf` 中配置 `set_real_ip_from` 与 `real_ip_header`，否则按 IP 限流会失效；
- 正式域名确认后再考虑 HSTS preload。
