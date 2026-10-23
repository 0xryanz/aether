"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { RuneMark } from "./RuneMark";

export function Footer() {
  const { pick } = useI18n();

  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <div className="brand">
            <RuneMark className="brand-mark" />
            <span className="brand-text">
              <strong>AETHER</strong>
              <small>FORGE</small>
            </span>
          </div>
          <p>
            {pick(
              "币安 Agent ID 驱动的 NFT 挖矿协议。铸造 Relic，合成 Loom，持有即挖矿。",
              "Agent ID-native NFT mining on BNB Chain. Mint Relics, forge Looms, mine by holding.",
            )}
          </p>
        </div>

        <div className="footer-col">
          <h4>{pick("协议", "Protocol")}</h4>
          <Link href="/mint">{pick("铸造", "Mint")}</Link>
          <Link href="/forge">{pick("合成", "Forge")}</Link>
          <Link href="/dashboard">{pick("我的熔炉", "Dashboard")}</Link>
        </div>

        <div className="footer-col">
          <h4>{pick("市场", "Market")}</h4>
          <Link href="/market">{pick("仅买单市场", "Bid-only market")}</Link>
          <Link href="/leaderboard">{pick("收益榜", "Leaderboard")}</Link>
        </div>

        <div className="footer-col">
          <h4>{pick("风险提示", "Risk")}</h4>
          <p className="footer-risk">
            {pick(
              "本项目处于早期阶段，代币价格可能剧烈波动，不构成投资建议。请自行评估风险。",
              "Early-stage protocol. Token prices may be volatile. Nothing here is investment advice.",
            )}
          </p>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 Aether Forge</span>
        <span className="mono">BNB CHAIN · AGENT ID NATIVE</span>
      </div>
    </footer>
  );
}
