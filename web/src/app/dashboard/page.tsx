"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { addresses, isConfigured } from "@/lib/config";
import { activeChain } from "@/lib/wagmi";
import { forgeAbi } from "@/lib/abi";
import { useLeaderboard, useUserData } from "@/hooks/useAetherData";
import { useI18n, useMounted } from "@/lib/i18n";
import { useChainClock } from "@/hooks/useChainClock";
import { boostTier, formatUnits, shortAddress } from "@/lib/format";
import { renderPoster } from "@/lib/poster";
import { Banner, EmptyState, PageHead, Stat, TxStatus } from "@/components/UI";
import { LoomCard, RelicCard } from "@/components/NftCards";

type TxRequest = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type TxState = "idle" | "signing" | "pending" | "success" | "error";

export default function DashboardPage() {
  const { pick } = useI18n();
  const { address: connectedAddress, isConnected: connected } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const isConnected = mounted && connected;
  const user = useUserData(address);
  const board = useLeaderboard(300);
  const now = useChainClock();
  const client = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? window.localStorage.getItem("aether:ref");
    if (ref && isAddress(ref)) setInviteInput(ref);
  }, []);

  const liveWeight = useMemo(
    () => user.looms.reduce((sum, loom) => sum + boostTier(loom.forgeTime, now), 0),
    [user.looms, now],
  );

  const referralLink = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/?ref=${address ?? ""}`;
  }, [address]);

  const rank = useMemo(() => {
    if (!address) return null;
    const index = board.holders.findIndex((row) => row.owner.toLowerCase() === address.toLowerCase());
    return index >= 0 ? index + 1 : null;
  }, [address, board.holders]);

  const avgClaim = board.earners > 0 ? board.totalClaimed / BigInt(board.earners) : 0n;

  async function send(request: TxRequest) {
    if (!client) throw new Error("No RPC client");
    setState("signing");
    setError(null);
    setNote(null);
    const txHash = await (writeContractAsync as unknown as (request: TxRequest) => Promise<`0x${string}`>)(request);
    setHash(txHash);
    setState("pending");
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return txHash;
  }

  async function handleClaim() {
    try {
      if (user.looms.length === 0) return;
      await send({
        address: addresses.forge,
        abi: forgeAbi,
        functionName: "claim",
        args: [user.looms.map((loom) => loom.id)],
      });
      setState("success");
      setNote(pick("挖矿收益已领取。", "Mining rewards claimed."));
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Claim failed");
    }
  }

  async function handleClaimReferral() {
    try {
      await send({
        address: addresses.forge,
        abi: forgeAbi,
        functionName: "claimReferral",
        args: [],
      });
      setState("success");
      setNote(pick("邀请收益已领取。", "Referral rewards claimed."));
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Claim failed");
    }
  }

  async function handleBind() {
    try {
      if (!isAddress(inviteInput)) throw new Error(pick("请输入有效的邀请人地址", "Enter a valid referrer address"));
      await send({
        address: addresses.forge,
        abi: forgeAbi,
        functionName: "bindReferrer",
        args: [inviteInput as Address],
      });
      setState("success");
      setNote(pick("已绑定邀请人，永久生效。", "Referrer bound. This is permanent."));
      window.localStorage.removeItem("aether:ref");
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Bind failed");
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handlePoster() {
    if (!address) return;
    try {
      setPosterBusy(true);
      const url = await renderPoster({
        address,
        mined: formatUnits(user.mined, 18, 2),
        claimable: formatUnits(user.pending, 18, 2),
        weight: liveWeight.toFixed(1),
        looms: user.loomBalance,
        invites: user.validInvites,
        referralLink,
        rank,
      });
      setPoster(url);
    } catch (cause) {
      const message = cause as { message?: string };
      setError(message.message ?? "Poster failed");
    } finally {
      setPosterBusy(false);
    }
  }

  const shareText = encodeURIComponent(
    pick(
      `我在 Aether Forge 已挖出 ${formatUnits(user.mined, 18, 2)} $AETHER，持有 ${user.loomBalance} 台 Loom。`,
      `I've mined ${formatUnits(user.mined, 18, 2)} $AETHER with ${user.loomBalance} Looms on Aether Forge.`,
    ),
  );
  const shareUrl = encodeURIComponent(referralLink);

  if (!isConnected) {
    return (
      <div className="shell">
        <PageHead
          eyebrow={pick("DASHBOARD", "DASHBOARD")}
          title={pick("我的熔炉", "My furnace")}
          description={pick("连接钱包查看 Relic、Loom、实时收益与邀请分成。", "Connect a wallet to view Relics, Looms, live yield and referrals.")}
        />
        <EmptyState
          title={pick("尚未连接钱包", "Wallet not connected")}
          body={pick("使用右上角的按钮连接，数据会实时刷新。", "Use the button in the header. Data refreshes live.")}
        />
      </div>
    );
  }

  return (
    <div className="shell">
      <PageHead
        eyebrow={pick("DASHBOARD", "DASHBOARD")}
        title={
          <>
            {pick("我的熔炉", "My furnace")}
            {rank && <span className="tag gold" style={{ marginLeft: 14, verticalAlign: "middle" }}>#{rank}</span>}
          </>
        }
        description={pick(
          "持有 Loom 即持续产出。无需质押，收益每秒累积，随时领取。",
          "Hold a Loom and yield accrues every second. No staking, claim anytime.",
        )}
        action={
          <>
            <Link href="/mint" className="btn btn-ghost btn-small">
              {pick("铸造 Relic", "Mint Relic")}
            </Link>
            <Link href="/forge" className="btn btn-primary btn-small">
              {pick("合成 Loom", "Forge Loom")}
            </Link>
          </>
        }
      />

      {!isConfigured && <Banner />}

      {user.referrer === "0x0000000000000000000000000000000000000000" && inviteInput && (
        <div className="callout" style={{ marginBottom: 16 }}>
          <span>◈</span>
          <div className="between" style={{ width: "100%", gap: 12 }}>
            <span>
              {pick("你通过邀请链接进入。绑定后，邀请人将永久获得你挖矿收益的 8%。", "You arrived via a referral. Bind to share 8% of your mining with your referrer, forever.")}
            </span>
            <button type="button" className="btn btn-ghost btn-small" onClick={handleBind}>
              {pick("绑定", "Bind")}
            </button>
          </div>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <Stat
          label={pick("待领取", "CLAIMABLE")}
          value={formatUnits(user.pending, 18, 2)}
          hint="$AETHER"
          accent="gold"
        />
        <Stat label={pick("累计挖出", "MINED")} value={formatUnits(user.mined, 18, 0)} hint="$AETHER" accent="ember" />
        <Stat label={pick("钱包余额", "BALANCE")} value={formatUnits(user.aetherBalance, 18, 2)} hint="$AETHER" />
        <Stat
          label={pick("实时权重", "LIVE WEIGHT")}
          value={liveWeight.toFixed(1)}
          hint={`${user.loomBalance} ${pick("台 Loom", "Looms")}`}
          accent="violet"
        />
      </div>

      <div className="dash-grid" style={{ paddingBottom: 40 }}>
        <div className="stack">
          <section className="panel">
            <div className="between" style={{ marginBottom: 16 }}>
              <div>
                <p className="eyebrow">{pick("挖矿", "MINING")}</p>
                <h3 className="display-md" style={{ marginTop: 8 }}>
                  {pick("我的 Loom", "My Looms")}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={user.looms.length === 0 || user.pending === 0n || state === "signing" || state === "pending"}
                onClick={handleClaim}
              >
                {state === "signing" || state === "pending"
                  ? pick("领取中…", "Claiming…")
                  : pick("领取全部收益", "Claim all")}
              </button>
            </div>

            {user.looms.length === 0 ? (
              <EmptyState
                title={pick("还没有 Loom", "No Looms yet")}
                body={pick("燃烧 10 枚 Relic 合成第一台矿机，立刻开始产出。", "Burn 10 Relics to forge your first Loom and start mining instantly.")}
                cta={{ href: "/forge", label: pick("去合成", "Forge one") }}
              />
            ) : (
              <div className="loom-grid">
                {user.looms.map((loom) => (
                  <LoomCard key={loom.id.toString()} id={loom.id} forgeTime={loom.forgeTime} now={now} />
                ))}
              </div>
            )}

            <TxStatus state={state} hash={hash} error={error} children={note ? <span> {note}</span> : null} />
          </section>

          <section className="panel">
            <div className="between" style={{ marginBottom: 16 }}>
              <div>
                <p className="eyebrow">{pick("邀请", "REFERRALS")}</p>
                <h3 className="display-md" style={{ marginTop: 8 }}>
                  {pick("裂变分成", "Referral engine")}
                </h3>
              </div>
              <span className="tag violet">{user.validInvites}/3 {pick("有效邀请", "VALID")}</span>
            </div>

            <label className="field" style={{ marginBottom: 14 }}>
              <span className="stat-label">{pick("我的邀请链接", "MY INVITE LINK")}</span>
              <div className="invite-link">
                <input className="input" readOnly value={referralLink} />
                <button type="button" className="btn btn-ghost btn-small" onClick={copyLink}>
                  {copied ? pick("已复制", "Copied") : pick("复制", "Copy")}
                </button>
              </div>
            </label>

            <div className="progress" style={{ marginBottom: 16 }}>
              <span style={{ width: `${Math.min(100, (user.validInvites / 3) * 100)}%` }} />
            </div>

            <div className="grid-2">
              <div className="stat-card">
                <span className="stat-label">{pick("可领取分成", "CLAIMABLE")}</span>
                <strong className="stat-value" style={{ fontSize: "1.45rem" }}>
                  {formatUnits(user.referralClaimable, 18, 2)}
                </strong>
                <span className="stat-hint">$AETHER</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">{pick("累计分成", "EARNED")}</span>
                <strong className="stat-value" style={{ fontSize: "1.45rem" }}>
                  {formatUnits(user.referralEarned, 18, 2)}
                </strong>
                <span className="stat-hint">$AETHER</span>
              </div>
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={user.referralClaimable === 0n || state === "signing" || state === "pending"}
                onClick={handleClaimReferral}
              >
                {pick("领取邀请收益", "Claim referral")}
              </button>
              <span className="form-hint">
                {pick("前 3 个有效邀请各奖励 1 枚免费 Relic。", "First 3 valid invites each earn a free Relic.")}
              </span>
            </div>

            {user.referrer === "0x0000000000000000000000000000000000000000" ? (
              <div className="invite-link" style={{ marginTop: 18 }}>
                <input
                  className="input"
                  placeholder={pick("输入邀请人地址进行绑定（仅一次）", "Enter a referrer address (one-time)")}
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                />
                <button type="button" className="btn btn-ghost btn-small" onClick={handleBind}>
                  {pick("绑定", "Bind")}
                </button>
              </div>
            ) : (
              <p className="form-hint" style={{ marginTop: 16 }}>
                {pick("已绑定邀请人", "Referrer")}: <span className="mono">{shortAddress(user.referrer, 6)}</span>
              </p>
            )}
          </section>

          <section className="panel">
            <div className="between" style={{ marginBottom: 14 }}>
              <div>
                <p className="eyebrow">{pick("资产", "ASSETS")}</p>
                <h3 className="display-md" style={{ marginTop: 8 }}>
                  {pick("我的 Relic", "My Relics")}
                </h3>
              </div>
              <span className="tag">{user.relicBalance} RELICS</span>
            </div>
            {user.relicIds.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                {pick("暂无 Relic。", "No Relics yet.")}{" "}
                <Link href="/mint" style={{ color: "var(--gold)" }}>
                  {pick("去铸造 →", "Mint →")}
                </Link>
              </p>
            ) : (
              <div className="relic-grid">
                {user.relicIds.map((id) => (
                  <RelicCard key={id.toString()} id={id} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <p className="eyebrow">{pick("收益对比", "PERFORMANCE")}</p>
            <div style={{ marginTop: 12 }}>
              <div className="kv">
                <span>{pick("我的累计收益", "My mined")}</span>
                <b>{formatUnits(user.mined, 18, 2)} AETHER</b>
              </div>
              <div className="kv">
                <span>{pick("全网人均已领", "Network avg claimed")}</span>
                <b>{formatUnits(avgClaim, 18, 2)} AETHER</b>
              </div>
              <div className="kv">
                <span>{pick("我的排名", "My rank")}</span>
                <b>{rank ? `#${rank}` : "—"}</b>
              </div>
              <div className="kv">
                <span>{pick("全网 Loom", "Network Looms")}</span>
                <b>{board.holders.reduce((sum, row) => sum + row.looms, 0)}</b>
              </div>
            </div>
          </section>

          <section className="panel poster-panel">
            <div className="between">
              <div>
                <p className="eyebrow">{pick("分享", "SHARE")}</p>
                <h3 className="display-md" style={{ marginTop: 8 }}>
                  {pick("收益海报", "Yield poster")}
                </h3>
              </div>
              <span className="tag gold">1080 × 1350</span>
            </div>

            <div className="poster-frame">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster} alt="Aether Forge mining receipt" />
              ) : (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <div className="loom-glyph" style={{ margin: "0 auto 16px" }}>
                    ◈
                  </div>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {pick("生成一张带有你的收益、权重与邀请二维码的海报。", "Generate a receipt with your yield, weight and invite QR.")}
                  </p>
                </div>
              )}
            </div>

            <button type="button" className="btn btn-primary btn-small" onClick={handlePoster} disabled={posterBusy}>
              {posterBusy ? pick("生成中…", "Rendering…") : pick("生成我的收益海报", "Generate poster")}
            </button>

            {poster && (
              <div className="row">
                <a className="btn btn-ghost btn-small" href={poster} download={`aether-forge-${address?.slice(0, 6)}.png`}>
                  {pick("下载 PNG", "Download PNG")}
                </a>
              </div>
            )}

            <div className="row">
              <a
                className="btn btn-ghost btn-small"
                href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                target="_blank"
                rel="noreferrer"
              >
                {pick("分享到 X", "Share on X")}
              </a>
              <a
                className="btn btn-ghost btn-small"
                href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`}
                target="_blank"
                rel="noreferrer"
              >
                Telegram
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
