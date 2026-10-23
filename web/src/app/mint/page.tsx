"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { keccak256, stringToHex, type Address } from "viem";
import { addresses, isConfigured, usdtDecimals } from "@/lib/config";
import { activeChain } from "@/lib/wagmi";
import { erc20Abi, registryAbi, relicAbi } from "@/lib/abi";
import { useGlobalStats, useUserData } from "@/hooks/useAetherData";
import { useI18n, useMounted } from "@/lib/i18n";
import { formatUnits } from "@/lib/format";
import { Banner, PageHead, TxStatus } from "@/components/UI";

type TxRequest = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type TxState = "idle" | "signing" | "pending" | "success" | "error";

export default function MintPage() {
  const { pick } = useI18n();
  const { address: connectedAddress, isConnected: connected } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const isConnected = mounted && connected;
  const user = useUserData(address);
  const stats = useGlobalStats();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();
  const { data: nativeBalance } = useBalance({ address, chainId: activeChain.id, query: { enabled: Boolean(address) } });

  const [quantity, setQuantity] = useState(1);
  const [currency, setCurrency] = useState<"usdt" | "bnb">("usdt");
  const [agentName, setAgentName] = useState("");
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [mintedCount, setMintedCount] = useState(0);

  const verified = user.verified;
  const remainingCap = Math.max(0, stats.perAgentCap - user.mintedByAgent);
  const maxQuantity = Math.max(1, Math.min(remainingCap, 4, quantity));

  const { data: quoteUsd } = useReadContract({
    address: addresses.relic,
    abi: relicAbi,
    functionName: "quoteUsd",
    args: [user.agentId, BigInt(maxQuantity)],
    chainId: activeChain.id,
    query: { enabled: isConfigured && verified && remainingCap > 0, refetchInterval: 12_000 },
  });
  const { data: usdtAmount } = useReadContract({
    address: addresses.relic,
    abi: relicAbi,
    functionName: "toUsdtUnits",
    args: [quoteUsd ?? 0n],
    chainId: activeChain.id,
    query: { enabled: Boolean(quoteUsd) },
  });
  const { data: bnbAmount } = useReadContract({
    address: addresses.relic,
    abi: relicAbi,
    functionName: "quoteNative",
    args: [user.agentId, BigInt(maxQuantity)],
    chainId: activeChain.id,
    query: { enabled: isConfigured && verified && remainingCap > 0 },
  });
  const { data: selfRegistrationEnabled } = useReadContract({
    address: addresses.registry,
    abi: registryAbi,
    functionName: "selfRegistrationEnabled",
    chainId: activeChain.id,
    query: { enabled: isConfigured },
  });

  const priceTable = useMemo(
    () => [1, 4.5, 4.5, 4.5].map((price, index) => ({ index, price })),
    [],
  );
  const unitPrices = [1, 4.5, 4.5, 4.5];
  function batchTotal(count: number): number {
    let total = 0;
    for (let i = 0; i < count; i += 1) total += unitPrices[user.mintedByAgent + i] ?? 0;
    return total;
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

  async function handleMint() {
    try {
      if (currency === "usdt") {
        const amount = usdtAmount ?? 0n;
        if (user.usdtAllowanceRelic < amount) {
          await send({
            address: addresses.usdt,
            abi: erc20Abi,
            functionName: "approve",
            args: [addresses.relic, amount],
          });
        }
        await send({
          address: addresses.relic,
          abi: relicAbi,
          functionName: "mintWithUSDT",
          args: [BigInt(maxQuantity)],
        });
      } else {
        const value = bnbAmount ?? 0n;
        if ((nativeBalance?.value ?? 0n) < value) throw new Error(pick("BNB 余额不足", "Insufficient BNB"));
        await send({
          address: addresses.relic,
          abi: relicAbi,
          functionName: "mintWithBNB",
          args: [BigInt(maxQuantity)],
          value,
        });
      }
      setMintedCount(maxQuantity);
      setState("success");
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Transaction failed");
    }
  }

  async function handleSelfRegister() {
    try {
      const normalized = agentName.trim();
      if (normalized.length < 3) throw new Error(pick("请输入至少 3 个字符的 Agent ID", "Enter an Agent ID of at least 3 characters"));
      await send({
        address: addresses.registry,
        abi: registryAbi,
        functionName: "selfRegister",
        args: [keccak256(stringToHex(normalized))],
      });
      setState("success");
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Registration failed");
    }
  }

  async function handleFaucet() {
    try {
      await send({
        address: addresses.usdt,
        abi: erc20Abi,
        functionName: "mint",
        args: [address as Address, 10_000n * 10n ** BigInt(usdtDecimals)],
      });
      setState("success");
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Faucet failed");
    }
  }

  const soldPct = stats.publicMinted > 0n ? Math.min(100, Number((stats.publicMinted * 10_000n) / 95_000n) / 100) : 0;

  return (
    <div className="shell">
      <PageHead
        eyebrow={pick("RELIC MINT", "RELIC MINT")}
        title={
          <>
            {pick("铸造你的第一枚", "Mint your first")} <span className="gold">Relic</span>
          </>
        }
        description={pick(
          "每个 Agent ID 限铸 4 枚：首枚 1 USDT，其余各 4.5 USDT。凑齐十枚即可燃烧合成 Loom。",
          "Four Relics per Agent ID: 1 USDT for the first, 4.5 USDT for each of the next three. Collect ten to forge a Loom.",
        )}
        action={
          <Link href="/forge" className="btn btn-ghost btn-small">
            {pick("去合成 Loom", "Go to forge")}
          </Link>
        }
      />

      {!isConfigured && <Banner />}

      <div className="mint-grid" style={{ paddingBottom: 60 }}>
        <section className="panel">
          <div className="stepper">
            <span className={`step-pill ${verified ? "done" : "active"}`}>
              <b>{verified ? "✓" : "1"}</b> {pick("验证 Agent ID", "Verify Agent ID")}
            </span>
            <span className={`step-pill ${verified ? "active" : ""}`}>
              <b>2</b> {pick("选择数量", "Choose quantity")}
            </span>
            <span className="step-pill">
              <b>3</b> {pick("支付", "Pay")}
            </span>
          </div>

          {!isConnected ? (
            <div className="empty-state">
              <div className="empty-rune">◇</div>
              <h3>{pick("先连接钱包", "Connect a wallet first")}</h3>
              <p>{pick("使用右上角的连接按钮，支持任意注入式钱包。", "Use the connect button in the header. Any injected wallet works.")}</p>
            </div>
          ) : (
            <>
              <div className="verify-box" style={{ marginBottom: 20 }}>
                <div className="agent">
                  <span className={`verify-icon ${verified ? "ok" : ""}`}>{verified ? "✓" : "◇"}</span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {verified ? pick("Agent ID 已验证", "Agent ID verified") : pick("需要 Agent ID", "Agent ID required")}
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 2 }}>
                      {verified ? `${user.agentId.slice(0, 12)}…${user.agentId.slice(-8)}` : pick("每个身份限铸 4 枚", "Cap of 4 per identity")}
                    </div>
                  </div>
                </div>
                {verified && (
                  <span className="tag gold">
                    {user.mintedByAgent} / {stats.perAgentCap} {pick("已铸", "MINTED")}
                  </span>
                )}
              </div>

              {!verified && (
                <div className="callout" style={{ marginBottom: 20, flexDirection: "column", gap: 10 }}>
                  <div>
                    <b>{pick("如何获得 Agent ID？", "How do I get an Agent ID?")}</b>{" "}
                    {pick(
                      "在币安创建 Agentic Wallet 并领取 .ai 身份，然后让运营方登记你的钱包。",
                      "Create a Binance Agentic Wallet, claim your .ai identity, then have an operator register your wallet.",
                    )}
                  </div>
                  {selfRegistrationEnabled && (
                    <div className="invite-link" style={{ width: "100%" }}>
                      <input
                        className="input"
                        placeholder={pick("演示环境：输入 agent 名称，如 alice.ai", "Demo: enter an agent name, e.g. alice.ai")}
                        value={agentName}
                        onChange={(event) => setAgentName(event.target.value)}
                      />
                      <button type="button" className="btn btn-ghost btn-small" onClick={handleSelfRegister}>
                        {pick("验证", "Verify")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="field" style={{ marginBottom: 16 }}>
                <label>{pick("数量", "Quantity")}</label>
                <div className="quantity-picker">
                  {[1, 2, 3, 4].map((value) => {
                    const disabled = value > remainingCap || !verified;
                    return (
                      <button
                        key={value}
                        type="button"
                        className={`qty-btn ${maxQuantity === value ? "active" : ""}`}
                        disabled={disabled}
                        onClick={() => setQuantity(value)}
                      >
                        <b>{value}</b>
                        <span>{value <= remainingCap ? `${batchTotal(value)} USDT` : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>{pick("支付方式", "Payment")}</label>
                <div className="pay-toggle">
                  <button type="button" className={currency === "usdt" ? "active" : ""} onClick={() => setCurrency("usdt")}>
                    USDT
                  </button>
                  <button type="button" className={currency === "bnb" ? "active" : ""} onClick={() => setCurrency("bnb")}>
                    BNB
                  </button>
                </div>
              </div>

              <div className="price-table">
                <div className="price-row">
                  <span>{pick("本次数量", "Quantity")}</span>
                  <b>{verified ? maxQuantity : "—"}</b>
                </div>
                <div className="price-row">
                  <span>{pick("应付金额", "Total")}</span>
                  <b>
                    {!verified
                      ? "—"
                      : currency === "usdt"
                        ? `${formatUnits(usdtAmount, usdtDecimals, 2)} USDT`
                        : `${formatUnits(bnbAmount, 18, 5)} BNB`}
                  </b>
                </div>
                <div className="price-row">
                  <span>{pick("资金去向", "Proceeds")}</span>
                  <b>80% LP · 20% {pick("运营", "OPS")}</b>
                </div>
              </div>

              <div className="row" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!verified || remainingCap === 0 || stats.isLoading || state === "signing" || state === "pending"}
                  onClick={handleMint}
                >
                  {remainingCap === 0
                    ? pick("已达上限", "Cap reached")
                    : state === "signing" || state === "pending"
                      ? pick("处理中…", "Processing…")
                      : pick("铸造 Relic", "Mint Relic")}
                </button>
                {currency === "usdt" && (
                  <span className="form-hint">
                    {pick("余额", "Balance")}: {formatUnits(user.usdtBalance, usdtDecimals, 2)} USDT
                  </span>
                )}
                {currency === "bnb" && nativeBalance && (
                  <span className="form-hint">
                    {pick("余额", "Balance")}: {Number(nativeBalance.formatted).toFixed(4)} {nativeBalance.symbol}
                  </span>
                )}
              </div>

              {stats.saleActive === false && (
                <p className="form-error" style={{ marginTop: 10 }}>
                  {pick("铸造暂未开放。", "Minting is not open yet.")}
                </p>
              )}
              {!stats.saleActive && !stats.isLoading && (
                <p className="form-hint" style={{ marginTop: 6 }}>
                  {pick("关注官方公告获取开放时间。", "Follow official channels for the opening time.")}
                </p>
              )}

              <TxStatus
                state={state}
                hash={hash}
                error={error}
                children={
                  mintedCount > 0 ? (
                    <span>
                      {" "}
                      {pick(`已铸造 ${mintedCount} 枚 Relic。`, `${mintedCount} Relic(s) minted.`)}{" "}
                      <Link href="/forge" style={{ color: "var(--gold)" }}>
                        {pick("去合成 →", "Forge now →")}
                      </Link>
                    </span>
                  ) : null
                }
              />
            </>
          )}
        </section>

        <aside className="stack">
          <div className="panel">
            <p className="eyebrow">{pick("价格阶梯", "PRICE LADDER")}</p>
            <div className="price-table" style={{ marginTop: 14 }}>
              {priceTable.map((row) => (
                <div className="price-row" key={row.index}>
                  <span>
                    {row.index === 0 ? pick("第 1 枚", "First relic") : pick(`第 ${row.index + 1} 枚`, `Relic ${row.index + 1}`)}
                  </span>
                  <b>{row.price} USDT</b>
                </div>
              ))}
              <div className="price-row">
                <span>{pick("满 4 枚合计", "All four")}</span>
                <b>14.5 USDT</b>
              </div>
            </div>
            <div className="supply-meter">
              <div className="meter">
                <span style={{ width: `${soldPct}%` }} />
              </div>
              <div className="meter-label">
                <span>{pick("公开铸造进度", "PUBLIC SALE")}</span>
                <span>
                  {Number(stats.publicMinted).toLocaleString("en-US")} / 95,000
                </span>
              </div>
            </div>
            {demoFaucet() && (
              <button type="button" className="btn btn-ghost btn-small btn-block" style={{ marginTop: 16 }} onClick={handleFaucet}>
                {pick("领取测试 USDT", "Get test USDT")}
              </button>
            )}
          </div>

          <div className="panel">
            <p className="eyebrow">{pick("铸造规则", "RULES")}</p>
            <div style={{ marginTop: 10 }}>
              <div className="kv">
                <span>{pick("身份门槛", "Identity")}</span>
                <b>{pick("已注册 .ai", "Registered .ai")}</b>
              </div>
              <div className="kv">
                <span>{pick("每身份上限", "Per identity")}</span>
                <b>4</b>
              </div>
              <div className="kv">
                <span>{pick("团队预留", "Team reserve")}</span>
                <b>5,000</b>
              </div>
              <div className="kv">
                <span>{pick("合成消耗", "Forge cost")}</span>
                <b>10 RELICS</b>
              </div>
            </div>
            <p className="form-hint" style={{ marginTop: 14 }}>
              {pick(
                "资金实时拆分：80% 进入 $AETHER 流动性，20% 进入团队运营。",
                "Funds split instantly: 80% to $AETHER liquidity, 20% to operations.",
              )}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function demoFaucet(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_FAUCET === "1";
}
