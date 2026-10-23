"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useI18n, useMounted } from "@/lib/i18n";
import { useGlobalStats, useLeaderboard, useUserData } from "@/hooks/useAetherData";
import { formatCompact, formatUnits, shortAddress } from "@/lib/format";
import { isConfigured } from "@/lib/config";
import { Banner, Stat } from "@/components/UI";

const DEMO_LEADERS = [
  { owner: "0x7A21f0c9b5A4F0D3cE8A6b2D9fE1c4B7a3C5d201", weight: 148.5, looms: 86, pendingWeight: 0 },
  { owner: "0x3F90aBcD41eD2C9b8A7f6E5d4C3b2A1f0E9d8C77", weight: 121, looms: 71, pendingWeight: 0 },
  { owner: "0x9C4e2B71aD0f3E6b5A8c1D2f4E7b9A0c3D5e6F82", weight: 96.5, looms: 58, pendingWeight: 0 },
  { owner: "0x1B8d4E7a2C5f9D0b3A6e8C1f4D7b2A5c9E0f3B64", weight: 74, looms: 44, pendingWeight: 0 },
  { owner: "0x6E2a9C1f7B4d0A3e8D5c2B9f6A1e4C7d0B3a5F98", weight: 63.5, looms: 39, pendingWeight: 0 },
];

export default function HomePage() {
  const { pick } = useI18n();
  const { address: connectedAddress } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const stats = useGlobalStats();
  const user = useUserData(address);
  const board = useLeaderboard(300);

  const leaders = board.holders.length ? board.holders.slice(0, 5) : DEMO_LEADERS;
  const emissionPct = useMemo(() => {
    if (stats.scheduled === 0n) return 0;
    return Math.min(100, Number((stats.emitted * 10_000n) / stats.scheduled) / 100);
  }, [stats.emitted, stats.scheduled]);

  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{pick("币安 Agent ID · BNB CHAIN", "BINANCE AGENT ID · BNB CHAIN")}</p>
            <h1 className="hero-title display-xl">
              {pick("熔铸以太，", "Forge the aether.")}
              <br />
              <em>{pick("持有即挖矿。", "Hold, and mine.")}</em>
            </h1>
            <p className="hero-sub">
              {pick(
                "铸造 Relic，燃烧十个合成 Loom。无需质押、无需每日签到 —— 放在钱包里，$AETHER 持续流向你。邀请好友再永久抽取 8% 挖矿收益。",
                "Mint Relics. Burn ten into a Loom. No staking, no daily check-ins — keep it in your wallet and $AETHER streams to you. Invite friends and earn 8% of their mining, forever.",
              )}
            </p>

            <div className="hero-actions">
              <Link href="/mint" className="btn btn-primary">
                {pick("铸造 Relic", "Mint a Relic")} <span>→</span>
              </Link>
              <Link href="/forge" className="btn btn-ghost">
                {pick("合成 Loom", "Forge a Loom")}
              </Link>
            </div>

            {!isConfigured && <Banner />}

            <div className="hero-stats">
              <div>
                <span className="label">{pick("已挖出", "Mined")}</span>
                <span className="value">
                  {stats.isLoading ? <span className="skeleton" /> : formatCompact(Number(stats.emitted / 10n ** 18n), 1)}
                  <small> $AETHER</small>
                </span>
              </div>
              <div>
                <span className="label">{pick("Loom 总数", "Looms")}</span>
                <span className="value">
                  {stats.isLoading ? <span className="skeleton" /> : Number(stats.loomSupply).toLocaleString("en-US")}
                </span>
              </div>
              <div>
                <span className="label">{pick("全网权重", "Network weight")}</span>
                <span className="value">
                  {stats.isLoading ? (
                    <span className="skeleton" />
                  ) : (
                    formatUnits(stats.totalWeight, 18, 1)
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="orb-stage">
              <div className="orb-halo" />
              <div className="orb-ring r1" />
              <div className="orb-ring r2" />
              <div className="orb-ring r3" />
              <div className="ticks">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span key={index} style={{ transform: `rotate(${index * 30}deg)` }} />
                ))}
              </div>
              <div className="orb-core">
                <strong>$AETHER</strong>
                <small>{pick("持续产出中", "STREAMING")}</small>
              </div>
              <div className="float-tag t1">×2 · DAY 1–5</div>
              <div className="float-tag t2">8% REFERRAL</div>
              <div className="float-tag t3">HOLD TO MINE</div>
              <div className="float-tag t4">AGENT ID GATED</div>
              <div className="orb-note">{pick("十大遗物 · 熔为一机", "TEN RELICS · ONE LOOM")}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="shell">
          <div className="stat-strip">
            <div className="stat-card">
              <span className="stat-label">{pick("铸造进度", "Mint progress")}</span>
              <strong className="stat-value">
                {Number(stats.publicMinted).toLocaleString("en-US")}
                <span className="muted" style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)" }}>
                  {" "}
                  / 95,000
                </span>
              </strong>
              <span className="stat-hint">{pick("公开铸造 95,000 枚 Relic", "95,000 public Relics")}</span>
            </div>
            <div className="stat-card accent-gold">
              <span className="stat-label">{pick("挖矿储备", "Mining reserve")}</span>
              <strong className="stat-value">45%</strong>
              <span className="stat-hint">{pick("450,000,000 $AETHER", "450,000,000 $AETHER")}</span>
            </div>
            <div className="stat-card accent-ember">
              <span className="stat-label">{pick("排放完成度", "Emission")}</span>
              <strong className="stat-value">{emissionPct.toFixed(1)}%</strong>
              <span className="stat-hint">
                {pick("当前阶段", "Current stage")} · {stats.miningStart ? (Date.now() / 1000 >= stats.miningStart ? pick("进行中", "Live") : pick("即将开始", "Upcoming")) : "—"}
              </span>
            </div>
            <div className="stat-card accent-violet">
              <span className="stat-label">{pick("邀请分成", "Referral")}</span>
              <strong className="stat-value">8%</strong>
              <span className="stat-hint">{pick("永久、可单独领取", "Lifetime, claim separately")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{pick("资产层级", "ASSET LAYERS")}</p>
              <h2 className="display-lg" style={{ marginTop: 14 }}>
                {pick("三件套，一条上升路径", "Three assets, one upward path")}
              </h2>
            </div>
            <p className="lede">
              {pick(
                "Relic 是材料，Loom 是矿机，$AETHER 是产出。每一步都可在二级市场流动，每一步都增加你的权重。",
                "Relic is the material, Loom is the machine, $AETHER is the yield. Every step is liquid on the secondary market.",
              )}
            </p>
          </div>

          <div className="asset-grid">
            <article className="asset-card">
              <div className="glyph">◇</div>
              <h3>Relic</h3>
              <p>
                {pick(
                  "基础 NFT，每个 Agent ID 最多铸造 4 枚。第 1 枚 1 USDT，第 2–4 枚各 4.5 USDT。",
                  "The base NFT. Up to 4 per Agent ID. First for 1 USDT, the next three for 4.5 USDT each.",
                )}
              </p>
              <div className="meta">
                <span>SUPPLY <b>100,000</b></span>
                <span>ROLE <b>{pick("合成材料", "MATERIAL")}</b></span>
              </div>
            </article>
            <article className="asset-card">
              <div className="glyph">◈</div>
              <h3>Loom</h3>
              <p>
                {pick(
                  "燃烧 10 枚 Relic 合成。可转让、可交易，挖矿权重跟随持有者，无需质押。",
                  "Forge by burning 10 Relics. Transferable and tradeable; mining weight follows the holder. No staking.",
                )}
              </p>
              <div className="meta">
                <span>FORGE <b>10 RELICS</b></span>
                <span>BOOST <b>×2 → ×1</b></span>
              </div>
            </article>
            <article className="asset-card">
              <div className="glyph">✦</div>
              <h3>$AETHER</h3>
              <p>
                {pick(
                  "协议产出代币，总量 10 亿。45% 用于 Loom 挖矿，按链上阶段逐步释放。",
                  "The protocol token. 1B fixed supply, 45% reserved for Loom miners and released in on-chain stages.",
                )}
              </p>
              <div className="meta">
                <span>SUPPLY <b>1,000,000,000</b></span>
                <span>CHAIN <b>BNB</b></span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{pick("核心循环", "THE LOOP")}</p>
              <h2 className="display-lg" style={{ marginTop: 14 }}>
                {pick("从铸造到持续产出，四步", "Four steps from mint to yield")}
              </h2>
            </div>
            <p className="lede">
              {pick(
                "全程链上，随时可查。合成无需等待铸造结束，挖矿从 Loom 诞生的那一秒开始计算。",
                "Fully on-chain and auditable. Forge whenever you like; mining starts the second your Loom is born.",
              )}
            </p>
          </div>

          <div className="steps">
            {[
              {
                t: pick("验证身份", "Verify identity"),
                d: pick("使用已注册的币安 Agent ID（.ai）登录，每个身份最多铸造 4 枚 Relic。", "Sign in with a registered Binance Agent ID (.ai). Max 4 Relics per identity."),
              },
              {
                t: pick("铸造 Relic", "Mint Relics"),
                d: pick("支持 USDT 或 BNB 支付。铸造资金的 80% 实时注入流动性，20% 归团队运营。", "Pay in USDT or BNB. 80% of proceeds go straight to liquidity, 20% to operations."),
              },
              {
                t: pick("合成 Loom", "Forge a Loom"),
                d: pick("凑齐 10 枚 Relic，一键燃烧合成。新 Loom 立刻获得最高挖矿权重。", "Collect 10 Relics and burn them in one click. Fresh Looms start at maximum weight."),
              },
              {
                t: pick("持有并领取", "Hold and claim"),
                d: pick("无需任何操作，收益每秒累积。随时 claim，转入钱包或参与市场。", "Do nothing. Yield accrues every second. Claim whenever you want."),
              },
            ].map((step, index) => (
              <article className="step-card" key={step.t}>
                <span className="index">0{index + 1}</span>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell feature-split">
          <div>
            <p className="eyebrow">{pick("新机加速", "NEW LOOM BOOST")}</p>
            <h2 className="display-lg" style={{ marginTop: 14 }}>
              {pick("越早合成，权重越高", "Forge earlier, weigh heavier")}
            </h2>
            <p className="lede" style={{ marginTop: 16 }}>
              {pick(
                "每一台新 Loom 在前 10 天享受加速权重，随后回到基准 1。权重加成完全写在合约里，任何人都能验证。",
                "Every new Loom enjoys an accelerated weight for its first 10 days, then returns to 1. The curve is enforced on-chain.",
              )}
            </p>

            <div className="boost-timeline">
              <div className="boost-bar">
                <div>×2</div>
                <div>×1.5</div>
                <div>×1</div>
              </div>
              <div className="boost-scale">
                <span>{pick("第 1–5 天", "DAY 1–5")}</span>
                <span>{pick("第 6–10 天", "DAY 6–10")}</span>
                <span>{pick("第 11 天起", "DAY 11+")}</span>
              </div>
            </div>

            <div className="callout warm" style={{ marginTop: 26 }}>
              <span>◈</span>
              <span>
                <b>{pick("受让同样有效。", "Boosts travel with the token.")}</b>{" "}
                {pick(
                  "转让 Loom 时，剩余加速时间与挖矿权重一并转移，二级市场买家可以直接接棒。",
                  "Transfer a Loom and its remaining boost transfers too — secondary buyers inherit the clock.",
                )}
              </span>
            </div>
          </div>

          <div className="invite-visual">
            <p className="eyebrow">{pick("邀请裂变", "REFERRAL ENGINE")}</p>
            <p className="percent">8%</p>
            <p className="lede" style={{ marginTop: 10 }}>
              {pick(
                "邀请人永久获得被邀请人 Loom 挖矿收益的 8%，单独累积、单独领取。前 3 个有效邀请各奖励 1 枚免费 Relic。",
                "Referrers earn 8% of their invitees' Loom mining, accrued and claimed separately. The first 3 valid invites each reward a free Relic.",
              )}
            </p>
            <div className="invite-chain">
              <div className="invite-node">
                <b>{pick("你", "YOU")}</b>
                {pick("邀请人", "REFERRER")}
              </div>
              <span className="invite-arrow">→</span>
              <div className="invite-node">
                <b>{pick("好友", "FRIEND")}</b>
                {pick("铸造 / 合成", "MINT / FORGE")}
              </div>
              <span className="invite-arrow">→</span>
              <div className="invite-node">
                <b>8%</b>
                {pick("永久分成", "FOREVER")}
              </div>
            </div>
            <div className="row" style={{ marginTop: 24 }}>
              <span className="tag gold">{pick("3 枚免费 Relic", "3 FREE RELICS")}</span>
              <span className="tag violet">{pick("实时结算", "REAL-TIME")}</span>
              <span className="tag">{pick("链上可验证", "ON-CHAIN")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="grid-2" style={{ alignItems: "stretch" }}>
            <div className="panel">
              <div className="between" style={{ marginBottom: 6 }}>
                <div>
                  <p className="eyebrow">{pick("全网权重榜", "NETWORK WEIGHT")}</p>
                  <h3 className="display-md" style={{ marginTop: 10 }}>
                    {pick("谁在熔炼？", "Who is forging?")}
                  </h3>
                </div>
                <Link href="/leaderboard" className="btn btn-ghost btn-small">
                  {pick("完整榜单", "Full board")}
                </Link>
              </div>

              <div className="leader-preview">
                {leaders.map((row, index) => (
                  <div className="leader-row" key={row.owner + index}>
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="who">
                      <span className="avatar-dot">{index + 1}</span>
                      <span className="mono">{shortAddress(row.owner)}</span>
                      {address && row.owner.toLowerCase() === address.toLowerCase() && (
                        <span className="tag gold">{pick("你", "YOU")}</span>
                      )}
                    </span>
                    <span className="amount">{(row.weight / 1).toFixed(1)} W</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="eyebrow">{pick("收益仪表盘", "YOUR FURNACE")}</p>
              <h3 className="display-md" style={{ marginTop: 10 }}>
                {user.verified
                  ? pick("熔炉已点火", "Your furnace is lit")
                  : pick("等待你的第一枚 Relic", "Waiting for your first Relic")}
              </h3>
              <p className="muted" style={{ fontSize: "0.92rem", marginTop: 8 }}>
                {pick(
                  "连接钱包即可查看 Relic、Loom、实时收益与邀请分成。收益每秒增长，随时领取。",
                  "Connect a wallet to see Relics, Looms, live yield and referral earnings. Yield grows every second.",
                )}
              </p>

              <div className="grid-2" style={{ marginTop: 24 }}>
                <div className="stat-card">
                  <span className="stat-label">{pick("待领取", "CLAIMABLE")}</span>
                  <strong className="stat-value" style={{ fontSize: "1.4rem" }}>
                    {address ? formatUnits(user.pending, 18, 2) : "—"}
                  </strong>
                  <span className="stat-hint">$AETHER</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">{pick("我的权重", "MY WEIGHT")}</span>
                  <strong className="stat-value" style={{ fontSize: "1.4rem" }}>
                    {address ? user.looms.reduce((sum, loom) => sum + loom.weight, 0).toFixed(1) : "—"}
                  </strong>
                  <span className="stat-hint">{user.loomBalance} {pick("台 Loom", "Looms")}</span>
                </div>
              </div>

              <div className="row" style={{ marginTop: 20 }}>
                <Link href="/dashboard" className="btn btn-primary btn-small">
                  {pick("打开仪表盘", "Open dashboard")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{pick("代币经济", "TOKENOMICS")}</p>
              <h2 className="display-lg" style={{ marginTop: 14 }}>
                {pick("1,000,000,000 $AETHER", "1,000,000,000 $AETHER")}
              </h2>
            </div>
            <p className="lede">
              {pick(
                "挖矿储备占 45%，团队份额锁仓 12 个月后线性释放 24 个月。铸造资金的 80% 持续注入流动性。",
                "45% is reserved for miners. Team tokens cliff for 12 months, then vest linearly over 24. 80% of mint proceeds flow into liquidity.",
              )}
            </p>
          </div>

          <div className="panel">
            <div className="token-bar">
              <span style={{ width: "45%" }} />
              <span style={{ width: "20%" }} />
              <span style={{ width: "15%" }} />
              <span style={{ width: "10%" }} />
              <span style={{ width: "10%" }} />
            </div>
            <div className="token-legend">
              <div>
                <b>45% · {pick("挖矿储备", "MINING")}</b>
                {pick("Loom 持有者产出", "Loom emissions")}
              </div>
              <div>
                <b>20% · {pick("流动性", "LIQUIDITY")}</b>
                {pick("铸造资金注入", "Mint proceeds")}
              </div>
              <div>
                <b>15% · {pick("团队与顾问", "TEAM")}</b>
                {pick("12 个月锁仓", "12mo cliff")}
              </div>
              <div>
                <b>10% · {pick("生态营销", "ECOSYSTEM")}</b>
                {pick("活动与空投", "Events & airdrops")}
              </div>
              <div>
                <b>10% · {pick("国库", "TREASURY")}</b>
                {pick("长期发展", "Long-term")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">{pick("路线图", "ROADMAP")}</p>
              <h2 className="display-lg" style={{ marginTop: 14 }}>
                {pick("从铸造到治理", "From mint to governance")}
              </h2>
            </div>
          </div>

          <div className="roadmap">
            {[
              {
                phase: "PHASE 1",
                title: pick("上线前", "Pre-launch"),
                items: [pick("合约开发与测试", "Contract development"), pick("官网与市场", "Site & market"), pick("社区预热", "Community warm-up")],
                active: true,
              },
              {
                phase: "PHASE 2",
                title: pick("公开发售", "Public launch"),
                items: [pick("公开铸造启动", "Mint opens"), pick("合成与挖矿", "Forge & mine"), pick("邀请与排行榜", "Invites & leaderboard")],
                active: true,
              },
              {
                phase: "PHASE 3",
                title: pick("流动性", "Liquidity"),
                items: [pick("$AETHER 交易入口", "$AETHER trading"), pick("完整排放", "Full emissions"), pick("社区活动", "Community campaigns")],
                active: false,
              },
              {
                phase: "PHASE 4",
                title: pick("扩展", "Expansion"),
                items: [pick("Loom 升级", "Loom upgrades"), pick("治理", "Governance"), pick("AI Agent 玩法", "AI agent gameplay")],
                active: false,
              },
            ].map((phase) => (
              <article className={`roadmap-card${phase.active ? " active" : ""}`} key={phase.phase}>
                <span className="phase">{phase.phase}</span>
                <h4>{phase.title}</h4>
                <ul>
                  {phase.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="shell">
          <div className="cta-band">
            <p className="eyebrow" style={{ justifyContent: "center" }}>
              {pick("现在开始", "START NOW")}
            </p>
            <h2 className="display-lg">
              {pick("第一枚 Relic，只差一个钱包", "One wallet away from your first Relic")}
            </h2>
            <p className="lede" style={{ margin: "0 auto 26px" }}>
              {pick(
                "铸造、合成、挖矿全部在链上完成。无托管、无锁仓、无每日任务。",
                "Mint, forge and mine without custody, locks, or daily tasks.",
              )}
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <Link href="/mint" className="btn btn-primary">
                {pick("开始铸造", "Start minting")}
              </Link>
              <Link href="/leaderboard" className="btn btn-ghost">
                {pick("查看排行榜", "View leaderboard")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
