"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { addresses, isConfigured } from "@/lib/config";
import { activeChain } from "@/lib/wagmi";
import { relicAbi, forgeAbi } from "@/lib/abi";
import { useGlobalStats, useUserData } from "@/hooks/useAetherData";
import { useI18n, useMounted } from "@/lib/i18n";
import { formatUnits } from "@/lib/format";
import { Banner, EmptyState, PageHead, TxStatus } from "@/components/UI";

type TxRequest = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type TxState = "idle" | "signing" | "pending" | "success" | "error";

export default function ForgePage() {
  const { pick } = useI18n();
  const { address: connectedAddress, isConnected: connected } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const isConnected = mounted && connected;
  const user = useUserData(address);
  const stats = useGlobalStats();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [forged, setForged] = useState(false);

  const selectedIds = useMemo(() => [...selected].map((value) => BigInt(value)), [selected]);

  function toggle(id: bigint) {
    setForged(false);
    setState("idle");
    setSelected((current) => {
      const next = new Set(current);
      const key = id.toString();
      if (next.has(key)) next.delete(key);
      else if (next.size < 10) next.add(key);
      return next;
    });
  }

  async function send(request: TxRequest) {
    if (!publicClient) throw new Error("No RPC client");
    setState("signing");
    setError(null);
    const txHash = await (writeContractAsync as unknown as (request: TxRequest) => Promise<`0x${string}`>)(request);
    setHash(txHash);
    setState("pending");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return txHash;
  }

  async function handleForge() {
    try {
      if (!user.relicApprovedForForge) {
        await send({
          address: addresses.relic,
          abi: relicAbi,
          functionName: "setApprovalForAll",
          args: [addresses.forge, true],
        });
      }
      await send({
        address: addresses.forge,
        abi: forgeAbi,
        functionName: "forge",
        args: [selectedIds],
      });
      setState("success");
      setSelected(new Set());
      setForged(true);
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Forge failed");
    }
  }

  const progress = Math.min(10, selectedIds.length);
  const missing = Math.max(0, 10 - progress);

  return (
    <div className="shell">
      <PageHead
        eyebrow={pick("LOOM FORGE", "LOOM FORGE")}
        title={
          <>
            {pick("燃烧十枚，", "Burn ten.")} <span className="gold">{pick("铸成矿机", "Forge a machine")}</span>
          </>
        }
        description={pick(
          "十枚 Relic 换一台 Loom。新 Loom 立刻开始挖矿，前 5 天权重 ×2，第 6–10 天 ×1.5。",
          "Ten Relics become one Loom. It starts mining instantly: 2x weight for 5 days, 1.5x for the next 5.",
        )}
        action={
          <Link href="/mint" className="btn btn-ghost btn-small">
            {pick("去铸造 Relic", "Mint more Relics")}
          </Link>
        }
      />

      {!isConfigured && <Banner />}

      <div className="mint-grid" style={{ paddingBottom: 60 }}>
        <section className="panel">
          {!isConnected ? (
            <EmptyState
              title={pick("先连接钱包", "Connect a wallet first")}
              body={pick("连接后即可查看并选择你的 Relic。", "Connect to see and select your Relics.")}
            />
          ) : user.relicBalance === 0 ? (
            <EmptyState
              title={pick("还没有 Relic", "No Relics yet")}
              body={pick(
                "先铸造几枚，或在二级市场接受买单。合成一台 Loom 需要 10 枚。",
                "Mint a few, or accept a bid on the secondary market. A Loom needs ten.",
              )}
              cta={{ href: "/mint", label: pick("去铸造", "Mint now") }}
            />
          ) : (
            <>
              <div className="between" style={{ marginBottom: 14 }}>
                <div>
                  <p className="eyebrow">{pick("选择材料", "SELECT MATERIAL")}</p>
                  <h3 className="display-md" style={{ marginTop: 8 }}>
                    {pick("你的 Relic", "Your Relics")}
                  </h3>
                </div>
                <span className="tag">
                  {user.relicBalance} {pick("枚可用", "AVAILABLE")}
                </span>
              </div>

              <div className="relic-grid">
                {user.relicIds.map((id) => {
                  const isSelected = selected.has(id.toString());
                  return (
                    <button
                      type="button"
                      key={id.toString()}
                      className={`relic-card ${isSelected ? "selected" : ""}`}
                      onClick={() => toggle(id)}
                      aria-pressed={isSelected}
                    >
                      {isSelected && <span className="check">✓</span>}
                      <span className="rune">◇</span>
                      <span className="id">#{id.toString()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="forge-progress">
                <div className="meter">
                  <span style={{ width: `${progress * 10}%` }} />
                </div>
                <span className="forge-count">{progress} / 10</span>
              </div>

              <div className="callout" style={{ marginTop: 18 }}>
                <span>◈</span>
                <span>
                  {progress < 10
                    ? pick(
                        `已选择 ${progress} / 10 枚，还需 ${missing} 枚。从上方挑选或补足 Relic。`,
                        `${progress} / 10 selected, ${missing} more to go. Pick from your Relics above.`,
                      )
                    : pick(
                        "已选满十枚。确认后将一次性燃烧，生成一枚可转让的 Loom NFT。",
                        "Ten selected. They will be burned together into one transferable Loom NFT.",
                      )}
                </span>
              </div>

              <div className="row" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={progress !== 10 || state === "signing" || state === "pending" || !stats.forgingActive}
                  onClick={handleForge}
                >
                  {!stats.forgingActive
                    ? pick("合成暂停", "Forge paused")
                    : state === "signing" || state === "pending"
                      ? pick("熔炼中…", "Forging…")
                      : pick("燃烧并合成 Loom", "Burn & forge Loom")}
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelected(new Set())}>
                  {pick("清空", "Clear")}
                </button>
              </div>

              <TxStatus
                state={state}
                hash={hash}
                error={error}
                children={
                  forged ? (
                    <span>
                      {" "}
                      {pick("Loom 已生成，挖矿已开始。", "Loom forged. Mining has begun.")}{" "}
                      <Link href="/dashboard" style={{ color: "var(--gold)" }}>
                        {pick("查看仪表盘 →", "Open dashboard →")}
                      </Link>
                    </span>
                  ) : null
                }
              />
            </>
          )}
        </section>

        <aside className="stack">
          <div className="loom-visual">
            <div className="loom-glyph">◈</div>
            <div>
              <p className="eyebrow" style={{ justifyContent: "center" }}>
                {pick("合成预览", "PREVIEW")}
              </p>
              <h3 className="display-md" style={{ marginTop: 8 }}>
                Loom NFT
              </h3>
            </div>
            <div className="row" style={{ justifyContent: "center" }}>
              <span className="tag gold">×2 · 5D</span>
              <span className="tag violet">×1.5 · 5D</span>
              <span className="tag">×1 · FOREVER</span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, maxWidth: "30ch" }}>
              {pick(
                "权重每秒参与全网分配。转让 Loom 时，权重与剩余加速一并转移。",
                "Weight shares the network pool every second. On transfer, weight and remaining boost move with it.",
              )}
            </p>
          </div>

          <div className="panel">
            <p className="eyebrow">{pick("全网状态", "NETWORK")}</p>
            <div style={{ marginTop: 10 }}>
              <div className="kv">
                <span>{pick("全网 Loom", "Total Looms")}</span>
                <b>{Number(stats.loomSupply).toLocaleString("en-US")}</b>
              </div>
              <div className="kv">
                <span>{pick("全网权重", "Total weight")}</span>
                <b>{formatUnits(stats.totalWeight, 18, 1)}</b>
              </div>
              <div className="kv">
                <span>{pick("已产出", "Mined")}</span>
                <b>{formatUnits(stats.emitted, 18, 0)} AETHER</b>
              </div>
              <div className="kv">
                <span>{pick("我的 Relic", "My Relics")}</span>
                <b>{user.relicBalance}</b>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
