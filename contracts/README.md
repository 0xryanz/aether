# Aether Forge Contracts

Solidity 0.8.24 + Foundry + OpenZeppelin 5.1。

```bash
forge build
forge test
forge fmt
```

| 合约 | 说明 |
|---|---|
| `AetherToken` | $AETHER（ERC20 + Permit），55% 部署时分配，45% 挖矿储备硬上限 |
| `AgentRegistry` | Agent ID 适配层；operator 登记钱包 ↔ .ai 身份，本地可开启 selfRegister |
| `RelicNFT` | 100,000 枚；每 Agent ID 4 枚；1 / 4.5 USDT 阶梯；USDT/BNB；80/20 分账 |
| `LoomNFT` | 10 枚 Relic 燃烧合成；权重 ×2 → ×1.5 → ×1；权重随持有人转移 |
| `Forge` | 7 阶段排放、精确检查点会计、领取、8% 邀请分成、前 3 个邀请免费 Relic |
| `AetherMarket` | 仅买单订单簿；USDT 托管；1% 手续费；支持指定 tokenId |

部署：`script/Deploy.s.sol`（见根目录 README 与 `.env.example`）。
本地一键演示：仓库根目录 `pnpm dev:local`。
