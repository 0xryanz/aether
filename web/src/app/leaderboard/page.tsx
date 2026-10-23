"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useLeaderboard, useUserData } from "@/hooks/useAetherData";
import { useI18n, useMounted } from "@/lib/i18n";
import { useChainClock } from "@/hooks/useChainClock";
import { boostTier, formatUnits, shortAddress } from "@/lib/format";
import { PageHead, Stat } from "@/components/UI";

type Tab = "weight" | "today" | "week";

const DEMO_HOLDERS = [
  { owner: "0x7A21f0c9b5A4F0D3cE8A6b2D9fE1c4B7a3C5d201", weight: 148.5, looms: 86, pendingWeight: 0 },
  { owner: "0x3F90aBcD41eD2C9b8A7f6E5d4C3b2A1f0E9d8C77", weight: 121, looms: 71, pendingWeight: 0 },
  { owner: "0x9C4e2B71aD0f3E6b5A8c1D2f4E7b9A0c3D5e6F82", weight: 96.5, looms: 58, pendingWeight: 0 },
  { owner: "0x1B8d4E7a2C5f9D0b3A6e8C1f4D7b2A5c9E0f3B64", weight: 74, looms: 44, pendingWeight: 0 },
  { owner: "0x6E2a9C1f7B4d0A3e8D5c2B9f6A1e4C7d0B3a5F98", weight: 63.5, looms: 39, pendingWeight: 0 },
  { owner: "0xF41c7A9d2E5b8C0a3D6f9B1e4A7c0D3b6E9a2F55", weight: 52, looms: 31, pendingWeight: 0 },
  { owner: "0x8D2b5E8a1C4f7A0d3B6e9C2f5A8d1B4e7C0f3A69", weight: 44.5, looms: 27, pendingWeight: 0 },
  { owner: "0x2A6d9B3e7C0f4A8d1B5e9C2f6A0d3B7e1C4f8A52", weight: 38, looms: 23, pendingWeight: 0 },
];

const DEMO_EARNERS = [
  { owner: "0x7A21f0c9b5A4F0D3cE8A6b2D9fE1c4B7a3C5d201", amount: 18420n * 10n ** 18n },
  { owner: "0x9C4e2B71aD0f3E6b5A8c1D2f4E7b9A0c3D5e6F82", amount: 12180n * 10n ** 18n },
  { owner: "0x3F90aBcD41eD2C9b8A7f6E5d4C3b2A1f0E9d8C77", amount: 9930n * 10n ** 18n },
  { owner: "0x6E2a9C1f7B4d0A3e8D5c2B9f6A1e4C7d0B3a5F98", amount: 7610n * 10n ** 18n },
  { owner: "0x1B8d4E7a2C5f9D0b3A6e8C1f4D7b2A5c9E0f3B64", amount: 5240n * 10n ** 18n },
];

export default function LeaderboardPage() {
  const { pick } = useI18n();
  const { address: connectedAddress } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const board = useLeaderboard(1_200);
  const user = useUserData(address);
  const [tab, setTab] = useState<Tab>("weight");
  const now = useChainClock();

  const isDemo = !board.holders.length;
  const holders = isDemo ? DEMO_HOLDERS : board.holders;
  const today = isDemo ? DEMO_EARNERS : board.today;
  const week = isDemo ? DEMO_EARNERS : board.week;
  const earners = tab === "today" ? today : week;

  const myRank = useMemo(() => {
    if (!address) return null;
    const index = board.holders.findIndex((row) => row.owner.toLowerCase() === address.toLowerCase());
    return index >= 0 ? index + 1 : null;
  }, [address, board.holders]);

  const avg = board.earners > 0 ? board.totalClaimed / BigInt(board.earners) : 0n;
  const networkWeight = holders.reduce((sum, row) => sum + row.weight, 0);
  const myWeight = user.looms.reduce((sum, loom) => sum + boostTier(loom.forgeTime, now), 0);

  return (
    <div className="shell">
      <PageHead
        eyebrow={pick("PUBLIC LEADERBOARD", "PUBLIC LEADERBOARD")}
        title={
          <>
            {pick("谁的熔炉", "Whose furnace")} <span className="gold">{pick("最亮？", "burns brightest?")}</span>
          </>
        }
        description={pick(
          "全网 Loom 权重、今日与本周收益实时排行。数据直接由链上事件聚合，无需登录。",
          "Live rankings by Loom weight and daily / weekly yield, aggregated straight from on-chain events.",
        )}
      />

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <Stat
          label={pick("全网权重", "TOTAL WEIGHT")}
          value={networkWeight.toFixed(1)}
          hint={`${holders.reduce((sum, row) => sum + row.looms, 0)} LOOMS`}
          accent="gold"
        />
        <Stat label={pick("累计领取", "TOTAL CLAIMED")} value={formatUnits(board.totalClaimed, 18, 0)} hint="$AETHER" accent="ember" />
        <Stat label={pick("领取地址", "EARNERS")} value={String(board.earners || DEMO_EARNERS.length)} hint={pick("独立钱包", "WALLETS")} />
        <Stat
          label={pick("人均收益", "AVG CLAIM")}
          value={formatUnits(avg || 7610n * 10n ** 18n, 18, 0)}
          hint="$AETHER"
          accent="violet"
        />
      </div>

      {mounted && board.isLoading && (
        <p className="form-hint" style={{ marginBottom: 12 }}>
          {pick("正在聚合链上数据…", "Aggregating on-chain data…")}
        </p>
      )}

      <div className="board-grid" style={{ paddingBottom: 60 }}>
        <section className="panel board-card">
          <div className="between" style={{ marginBottom: 14 }}>
            <div>
              <h3>
                {tab === "weight" && pick("Loom 权重 Top 100", "Loom weight · Top 100")}
                {tab === "today" && pick("今日收益榜", "Today's earners")}
                {tab === "week" && pick("本周收益榜", "This week's earners")}
              </h3>
              <p className="sub">
                {tab === "weight"
                  ? pick("按当前有效权重排序（含加速）", "Ranked by effective weight, boosts included")
                  : pick("按已领取的 $AETHER 排序", "Ranked by claimed $AETHER")}
              </p>
            </div>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button type="button" className={`tab ${tab === "weight" ? "active" : ""}`} onClick={() => setTab("weight")}>
                {pick("权重", "Weight")}
              </button>
              <button type="button" className={`tab ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}>
                {pick("今日", "Today")}
              </button>
              <button type="button" className={`tab ${tab === "week" ? "active" : ""}`} onClick={() => setTab("week")}>
                {pick("本周", "Week")}
              </button>
            </div>
          </div>

          {tab === "weight" && (
            <div className="board-list">
              {holders.map((row, index) => (
                <div
                  className={`board-row ${address && row.owner.toLowerCase() === address.toLowerCase() ? "me" : ""}`}
                  key={row.owner + index}
                >
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="who">
                    <span className="avatar-dot">{index + 1}</span>
                    <span className="mono">{shortAddress(row.owner, 5)}</span>
                    {address && row.owner.toLowerCase() === address.toLowerCase() && <span className="tag gold">{pick("你", "YOU")}</span>}
                  </span>
                  <span className="val">
                    {row.weight.toFixed(1)} W · {row.looms} {pick("台", "LOOMS")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab !== "weight" && earners.length === 0 && (
            <div className="board-empty">
              {pick("这个时间段还没有领取记录。", "No claims in this window yet.")}
            </div>
          )}

          {tab !== "weight" && earners.length > 0 && (
            <div className="board-list">
              {earners.map((row, index) => (
                <div
                  className={`board-row ${address && row.owner.toLowerCase() === address.toLowerCase() ? "me" : ""}`}
                  key={row.owner + index}
                >
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="who">
                    <span className="avatar-dot">{index + 1}</span>
                    <span className="mono">{shortAddress(row.owner, 5)}</span>
                  </span>
                  <span className="val">{formatUnits(row.amount, 18, 2)} AETHER</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="stack">
          <section className="panel">
            <p className="eyebrow">{pick("我的位置", "MY POSITION")}</p>
            <div className="my-rank" style={{ marginTop: 12 }}>
              <span className="stat-label">{pick("权重排名", "WEIGHT RANK")}</span>
              <div className="display-md" style={{ color: myRank ? "var(--gold)" : "var(--muted)" }}>
                {address ? (myRank ? `#${myRank}` : pick("未上榜", "Unranked")) : "—"}
              </div>
              <div className="kv" style={{ marginTop: 12 }}>
                <span>{pick("我的权重", "My weight")}</span>
                <b>{myWeight.toFixed(1)} W</b>
              </div>
              <div className="kv">
                <span>{pick("我的 Loom", "My Looms")}</span>
                <b>{user.loomBalance}</b>
              </div>
              <div className="kv">
                <span>{pick("我的累计收益", "My mined")}</span>
                <b>{formatUnits(user.mined, 18, 2)}</b>
              </div>
              <div className="kv">
                <span>{pick("全网人均", "Network avg")}</span>
                <b>{formatUnits(avg, 18, 2)}</b>
              </div>
            </div>
            {!address && (
              <p className="form-hint" style={{ marginTop: 12 }}>
                {pick("连接钱包查看你的排名。", "Connect a wallet to see your rank.")}
              </p>
            )}
          </section>

          <section className="panel">
            <p className="eyebrow">{pick("榜单说明", "METHOD")}</p>
            <p className="form-hint" style={{ marginTop: 10, lineHeight: 1.7 }}>
              {pick(
                "权重 = 每台 Loom 当前有效权重之和（前 5 天 ×2，6–10 天 ×1.5，之后 ×1）。收益榜基于 Claimed 事件，按区块时间归入今日 / 本周。",
                "Weight = sum of each Loom's effective weight (2x for 5 days, 1.5x for the next 5, then 1x). Earnings use Claimed events bucketed by block time.",
              )}
            </p>
            {isDemo && (
              <p className="form-hint" style={{ marginTop: 12, color: "var(--gold)" }}>
                {pick("当前展示的是示例数据。", "Showing sample data.")}
              </p>
            )}
          </section>

          <section className="panel">
            <p className="eyebrow">{pick("下一站", "NEXT")}</p>
            <div className="stack" style={{ marginTop: 12 }}>
              <a className="btn btn-primary btn-small" href="/forge">
                {pick("合成 Loom，冲榜", "Forge a Loom")}
              </a>
              <a className="btn btn-ghost btn-small" href="/dashboard">
                {pick("生成收益海报", "Generate poster")}
              </a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
