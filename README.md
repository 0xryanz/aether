# Aether Forge · 以太熔炉

> 币安 Agent ID 驱动的 NFT 挖矿协议 —— 铸造 Relic，燃烧十枚合成 Loom，持有即挖矿。
> 产品需求来源：[`docs/Aether Forge.md`](./docs/Aether%20Forge.md)

Aether Forge 是一个部署在 BNB Chain 上的完整实现：Solidity 合约 + Foundry 测试 + Next.js 官网 / 铸造 / 合成 / 仪表盘 / 仅买单市场 / 公开排行榜 / 收益海报。

---

## 1. 仓库结构

```
aether/
├── docs/Aether Forge.md          产品文档（需求来源）
├── contracts/                    Foundry 合约工程
│   ├── src/
│   │   ├── AetherToken.sol       $AETHER（ERC20 + Permit，45% 挖矿上限）
│   │   ├── AgentRegistry.sol     Agent ID 适配层（运营方登记 .ai 身份）
│   │   ├── RelicNFT.sol          Relic（ERC721，4 枚/身份，1 / 4.5 USDT 阶梯）
│   │   ├── LoomNFT.sol           Loom（ERC721，10 枚 Relic 合成，权重曲线）
│   │   ├── Forge.sol             排放、领取、8% 邀请分成、免费 Relic
│   │   ├── AetherMarket.sol      仅买单订单簿（1% 手续费）
│   │   └── mocks/                MockUSDT / Multicall3（仅本地演示）
│   ├── test/AetherForge.t.sol    21 个单元 / 集成测试
│   └── script/Deploy.s.sol       一键部署 + 7 阶段排放配置
└── web/                          Next.js 15 官网
    ├── src/app/                  首页 / mint / forge / dashboard / market / leaderboard
    ├── src/components/           Header、钱包、UI、海报
    ├── src/hooks/                链上数据、排行榜聚合、链上时钟
    ├── src/lib/                  ABI、wagmi 配置、i18n、海报渲染
    └── scripts/dev-local.mjs     本地一键演示（anvil + 部署 + 造数据）
```

---

## 2. 快速开始（本地完整演示）

前置：Node 20+、pnpm、[Foundry](https://book.getfoundry.sh/getting-started/installation)。

```bash
# 安装前端依赖
pnpm --dir web install

# 启动 anvil、部署合约、生成演示数据、写入 web/.env.local、启动官网
pnpm dev:local
```

打开 <http://localhost:3000>。

脚本会：

1. 启动（或重置）`127.0.0.1:8545` 的 anvil；
2. 部署全部合约并配置 7 阶段排放；
3. 注册 10 个 Agent ID、铸造 40 枚 Relic、合成 3 台 Loom（含邀请关系与 8% 分成）；
4. 时间前进 7 天并领取部分收益，生成排行榜与可领取余额；
5. 挂出 Loom / Relic 买单；
6. 自动写入 `web/.env.local` 并运行 `next dev`。

演示钱包（anvil 账户 #0，私钥为 Foundry 公开测试私钥）：

```
地址：0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
私钥：0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

> 该演示账户拥有 1 台 Loom、2 个有效邀请、12 枚可再次合成的 Relic，以及待领取的 `$AETHER`。
> 本地链被 `evm_increaseTime` 前进了 7 天，前端使用「链上时钟」展示加速倒计时与榜单时间窗口。

若只想重置链上数据、不启动前端：

```bash
pnpm dev:local -- --no-serve
pnpm --dir web dev
```

---

## 3. 合约设计

### 3.1 资产与流程

| 资产 | 标准 | 关键规则 |
|---|---|---|
| **Relic** | ERC721 | 总量 100,000（公开 95,000 + 团队 5,000）；每个 Agent ID 最多 4 枚；第 1 枚 1 USDT，第 2–4 枚各 4.5 USDT；支持 USDT / BNB；铸造款 80% → 流动性地址，20% → 国库 |
| **Loom** | ERC721 | 燃烧 10 枚 Relic 合成；可转让；权重跟随持有者；前 5 天 ×2，第 6–10 天 ×1.5，之后 ×1 |
| **$AETHER** | ERC20 + Permit | 总量 1,000,000,000；55% 部署时分配，45% 由 Forge 按排放计划铸造，硬上限 |

### 3.2 挖矿会计（`Forge.sol`）

- 全局累计器 `accPerWeight`（每 1e18 权重的累计产出）+ 精确检查点。
- 权重会随时间变化（加速到期），合约用 **最小堆** 记录每个到期时刻，任何交互（`claim` / `forge` / `sync`）都会在到期时刻精确结算，因此即使 30 天不交互，领取金额依然精确。
- `pending()` / `pendingForWallet()` 是只读视图：会复制堆到内存并重放到当前时间，UI 展示的数字与最终 claim 一致。
- 排放计划一次性配置：`configureSchedule(start, durations[], ratesPerSecond[])`；`emittedFromSchedule` 累计已分配量。
- 领取金额由当前持有人获得；转让 Loom 会把「尚未领取的累计收益」一并转给新持有人（类似 MasterChef 的债务随仓位走）。

### 3.3 邀请分成的会计口径

> 产品文档：「邀请人永久获得对方 Loom 挖矿收益的 8%」。

实现选择：**被邀请人拿 100%，邀请人额外获得 8%**，由挖矿储备铸造，而不是从被邀请人收益中扣除。

- 领取时把 8% 记入 `referralClaimable[referrer]`，邀请人通过 `claimReferral()` 单独领取。
- 有效邀请：被邀请人必须完成至少 1 次铸造或合成；绑定后自动激活。
- 前 3 个有效邀请各奖励 1 枚免费 Relic（从 5,000 团队份额铸造）。
- 排放计划配置时强制预留 `1/11` 的预算给邀请加成，保证 8% 额外铸造不会突破 45% 上限。

### 3.4 仅买单市场（`AetherMarket.sol`）

- 买家 `createOrder(collection, tokenId, price)` 挂出 USDT 买单，资金立即锁定在合约。
- `tokenId = 0` 表示接受该系列任意 Token；否则只接受指定 Token。
- 卖家 `fillOrder(orderId, tokenId)`：原子完成 NFT 转移 + USDT 结算，收取 1% 手续费给国库。
- 取消订单全额退款；手续费上限 5%（默认 1%）。

### 3.5 权限与风控

- 所有可升级参数集中在 `Ownable2Step`；部署脚本可在部署完成后把所有权移交给多签。
- `AetherToken.setMiningEngine`、`RelicNFT.setForge`、`LoomNFT.setForge` 均为一次性绑定。
- 排放计划只能配置一次，且 `start` 不得早于当前时间；部署脚本默认预留 600 秒。
- `AgentRegistry` 支持 operator 批量登记；`selfRegister` 仅用于本地演示，默认关闭（`ALLOW_SELF_REGISTRATION`）。
- Relic 的 USDT 收款地址受保护，`rescueERC20` 无法动 USDT。
- 重入保护覆盖铸造、合成、领取、市场成交。

---

## 4. 测试

```bash
cd contracts
forge test
```

当前 **21 个测试全部通过**，覆盖：

- 价格阶梯、80/20 分账、USDT/BNB 支付与 BNB 找零
- Agent ID 门槛、每身份 4 枚上限
- 10 枚 Relic 合成、重复/不足/未授权校验
- 单 Loom 全额排放、双 Loom 加速曲线精确分配（27.5 vs 22.5 权重日）
- 跨钱包领取、转让后收益归属
- 8% 邀请分成、前 3 个邀请免费 Relic、邀请一次性绑定
- 仅买单市场成交 1% 手续费、取消退款、指定 Token 校验
- 排放预算上限与一次性配置

```bash
# 本地部署（不含造数据）
cd contracts
PRIVATE_KEY=0x... forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

部署结果写入 `contracts/deployments/<chainId>.json`。

---

## 5. 部署到 BNB Chain

### 5.1 环境变量

```bash
export PRIVATE_KEY=0x...                 # 部署者
export USDT_ADDRESS=0x55d398...          # BSC-USDT（18 位小数）
export USDT_DECIMALS=18
export OWNER=0x...                       # 最终多签
export TREASURY=0x...                    # 20% 铸造款 + 市场手续费
export LIQUIDITY=0x...                   # 80% 铸造款（流动性管理地址）
export TEAM_BENEFICIARY=0x...            # 团队 vesting 受益人
export ECOSYSTEM=0x...
export BNB_PRICE_USD=600000000000000000000   # 600 USD，18 位
export MINING_START_DELAY=3600
export SALE_ACTIVE=true
```

### 5.2 部署

```bash
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BSC_RPC_URL" \
  --broadcast --verify --etherscan-api-key "$BSCSCAN_API_KEY"
```

部署内容包括：

- `VestingWallet`：团队份额锁仓 12 个月，随后 24 个月线性释放；
- 7 个排放阶段（3 天/阶段，共 21 天，前高后低），总排放 401,760,000 `$AETHER`，为 8% 邀请加成预留约 1/11；
- 市场允许 Relic / Loom 两个系列，手续费 1%。

### 5.3 部署后必做

1. 多签对每个 `Ownable2Step` 合约调用 `acceptOwnership()`（token / registry / relic / loom / forge / market / vesting）。
2. 设置 `AgentRegistry` operator，接入币安 Agent ID 验证服务并批量登记钱包。
3. 根据实际上线价格调用 `RelicNFT.setPrices()`（仅铸造前）与 `setBnbPriceUsd()`。
4. 前端 `.env.local` 填入地址与 `NEXT_PUBLIC_DEPLOY_BLOCK`。
5. 独立审计后再开启 `setSaleActive(true)`。

---

## 6. 官网

技术栈：Next.js 15（App Router）+ React 19 + wagmi 2 + viem 2 + TanStack Query，自研设计系统（无 UI 框架依赖）。

| 页面 | 功能 |
|---|---|
| `/` | 品牌首页、实时协议数据、资产层级、玩法、加速曲线、邀请机制、排行榜预览、代币经济、路线图 |
| `/mint` | Agent ID 验证（本地演示可自助登记）、数量选择、USDT/BNB 支付、授权/铸造、进度条、测试水龙头 |
| `/forge` | Relic 网格多选、`approve` + 燃烧合成、加速预览 |
| `/dashboard` | 实时待领取、Loom 加速倒计时、领取全部、邀请链接/绑定/分成/免费 Relic 进度、Relic 展示、收益海报（1080×1350 PNG + 二维码）与 X/Telegram 分享 |
| `/market` | 买单簿、挂买单、我的挂单/取消、以任意 Relic/Loom 接受买单（自动 approve） |
| `/leaderboard` | 权重 Top 100、今日/本周领取榜、个人排名与全网人均对比 |

其他实现：

- 中英双语，默认英文（右上角切换并持久化）；
- 移动端适配、`prefers-reduced-motion` 支持；
- `?ref=0x...` 邀请链接自动捕获并引导绑定；
- 错误/交易状态内联提示，所有写入均为用户自签；
- 链上时钟（`useChainClock`）保证本地时间跳跃时倒计时与榜单窗口正确；
- 排行榜直接从 `Claimed` 事件 + Loom 所有权聚合（最多 1,200 台）；规模更大时建议换成 The Graph / Ponder。

### 前端环境

复制 `web/.env.example` 为 `web/.env.local`，填写部署地址：

```
NEXT_PUBLIC_CHAIN_ID=56
NEXT_PUBLIC_AETHER_ADDRESS=...
NEXT_PUBLIC_RELIC_ADDRESS=...
NEXT_PUBLIC_LOOM_ADDRESS=...
NEXT_PUBLIC_FORGE_ADDRESS=...
NEXT_PUBLIC_MARKET_ADDRESS=...
NEXT_PUBLIC_REGISTRY_ADDRESS=...
NEXT_PUBLIC_USDT_ADDRESS=...
NEXT_PUBLIC_USDT_DECIMALS=18
NEXT_PUBLIC_DEPLOY_BLOCK=...
NEXT_PUBLIC_RPC_URL=...
```

`NEXT_PUBLIC_DEMO_FAUCET` / `NEXT_PUBLIC_SELF_REGISTER` 仅限本地，主网必须为 `0`。

```bash
pnpm --dir web build
pnpm --dir web start
```

品牌资源：`web/src/app/icon.svg`（favicon）、`web/public/icon-512.png`、`web/public/apple-icon.png`、`web/public/favicon.ico`、`web/public/og.png`（社交分享图），并已通过 `web/src/app/manifest.ts` 提供 PWA manifest。

### 6.4 Docker + Nginx + ACME 生产部署

仓库内置了完整的三容器生产方案：

- `aether-web`：Next.js standalone 镜像（多阶段构建、非 root、健康检查）
- `aether-nginx`：TLS 终止、HTTP/2、gzip、静态资源代理缓存、安全头、限流
- `aether-acme`：`neilpang/acme.sh` 通过 HTTP-01 webroot 自动签发 / 续期证书，并触发 Nginx 平滑 reload

```bash
cp .env.prod.example .env.prod     # 填 DOMAIN、邮箱、合约地址
docker compose --env-file .env.prod up -d --build
docker compose --env-file .env.prod logs -f acme nginx
```

完整步骤（staging 验证、切换正式证书、续期、优化说明、排障）见 **[`deploy/README.md`](./deploy/README.md)**。

---

## 7. 已知边界与上线前清单

- **Agent ID**：本仓库的 `AgentRegistry` 是运营方登记适配层，不自带币安官方验证。生产环境需要把 operator 接到官方 Agent ID 校验（或 EIP-712 签名 + 后端见证），并关闭 `selfRegister`。
- **BNB/USD 价格**：当前由 owner 手动设置，主网建议接 Chainlink BNB/USD 或部署价格适配器。
- **排行榜索引**：前端最多聚合 1,200 台 Loom；真实规模请使用 The Graph、Ponder 或自建索引服务，并保留链上核心数据作为最终来源。
- **流动性**：合约把 80% 铸造款转给 `LIQUIDITY` 地址，未直接创建 PancakeSwap 池。上线时可改为流动性管理器合约或多签操作流程。
- **审计**：合约未经第三方审计，请勿直接部署主网资金。
- **风险**：早期项目、代币价格波动、排放与邀请加成都会影响实际收益；本项目不构成投资建议。

---

### 7.1 钱包里没钱，网站却显示 99 ETH？

这是**钱包网络和网站读取的链不一致**，不是网站凭空造余额。

网站的所有链上数据（余额、Relic/Loom、挖矿、订单、排行榜）都固定读取 `NEXT_PUBLIC_CHAIN_ID` 指定的链；本地演示是 Anvil `31337`。MetaMask 默认停在以太坊主网或 BNB Chain，它显示的是那条链上的余额，所以是 0；而网站在读 Anvil，所以能看到测试资金。

现在页面会做三件事：

1. 顶部出现黄色提示条：`Your wallet is on BNB Smart Chain; the site is reading Anvil Local.`
2. 钱包菜单里不再显示错误网络下的余额，而是提示先切换网络；
3. 点 **Switch to Anvil Local** 会调用 `wallet_switchEthereumChain`，如果钱包里没有这条链，会自动用 `wallet_addEthereumChain` 添加。

如果一键切换失败，在 MetaMask 手动添加：

| 字段 | 值 |
|---|---|
| Network name | Anvil Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | ETH |

同时确认：

- MetaMask 当前选中的账户就是接收测试币的地址（例如 `0x55f9…D8b43a`），不是另一个空账户；
- `127.0.0.1` 只在浏览器和 Anvil 同一台机器时有效；远程演示需要把 RPC 换成可访问的地址；
- 重新运行 `pnpm dev:local` 会重置 Anvil，之前的测试余额会消失。

---

## 8. 常用命令

```bash
pnpm dev:local               # 本地全栈演示
pnpm dev                     # 仅前端（需已有 .env.local）
pnpm build                   # 生产构建
pnpm typecheck               # TypeScript 检查
pnpm contracts:test          # Foundry 测试
pnpm contracts:build         # 编译合约
pnpm contracts:fmt           # forge fmt
```

---

© 2026 Aether Forge · MIT License
