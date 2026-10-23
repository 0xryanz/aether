"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { addresses, isConfigured, usdtDecimals } from "@/lib/config";
import { activeChain } from "@/lib/wagmi";
import { erc20Abi, loomAbi, marketAbi, relicAbi } from "@/lib/abi";
import { useOrders, useUserData, type MarketOrder } from "@/hooks/useAetherData";
import { useI18n, useMounted } from "@/lib/i18n";
import { useChainClock } from "@/hooks/useChainClock";
import { formatUnits, parseAmount, shortAddress, timeAgo } from "@/lib/format";
import { Banner, EmptyState, PageHead, TxStatus } from "@/components/UI";

type TxRequest = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

type TxState = "idle" | "signing" | "pending" | "success" | "error";
type Tab = "book" | "create" | "mine";

const ZERO = "0x0000000000000000000000000000000000000000";

export default function MarketPage() {
  const { pick } = useI18n();
  const { address: connectedAddress, isConnected: connected } = useAccount();
  const mounted = useMounted();
  const now = useChainClock();
  const address = mounted ? connectedAddress : undefined;
  const isConnected = mounted && connected;
  const user = useUserData(address);
  const orders = useOrders(120);
  const client = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<Tab>("book");
  const [state, setState] = useState<TxState>("idle");
  const [hash, setHash] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [collection, setCollection] = useState<"relic" | "loom">("relic");
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");

  const { data: relicApproved } = useReadContract({
    address: addresses.relic,
    abi: relicAbi,
    functionName: "isApprovedForAll",
    args: [address ?? ZERO, addresses.market],
    chainId: activeChain.id,
    query: { enabled: Boolean(address) },
  });
  const { data: loomApproved } = useReadContract({
    address: addresses.loom,
    abi: loomAbi,
    functionName: "isApprovedForAll",
    args: [address ?? ZERO, addresses.market],
    chainId: activeChain.id,
    query: { enabled: Boolean(address) },
  });
  const { data: feeBps } = useReadContract({
    address: addresses.market,
    abi: marketAbi,
    functionName: "feeBps",
    chainId: activeChain.id,
    query: { enabled: isConfigured },
  });

  const activeOrders = useMemo(() => orders.orders.filter((order) => order.active), [orders.orders]);
  const myOrders = useMemo(
    () => (address ? orders.orders.filter((order) => order.buyer.toLowerCase() === address.toLowerCase()) : []),
    [orders.orders, address],
  );

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

  async function handleCreate() {
    try {
      const amount = parseAmount(price, usdtDecimals);
      if (amount <= 0n) throw new Error(pick("请输入有效的价格", "Enter a valid price"));
      const parsedTokenId = tokenId.trim() === "" ? 0n : BigInt(tokenId.trim());
      const target = collection === "relic" ? addresses.relic : addresses.loom;

      if (user.usdtAllowanceMarket < amount) {
        await send({
          address: addresses.usdt,
          abi: erc20Abi,
          functionName: "approve",
          args: [addresses.market, amount],
        });
      }
      await send({
        address: addresses.market,
        abi: marketAbi,
        functionName: "createOrder",
        args: [target, parsedTokenId, amount],
      });
      setState("success");
      setNote(pick("买单已挂出，资金已锁定。", "Bid posted and funds escrowed."));
      setPrice("");
      setTokenId("");
      setTab("book");
      orders.refetch();
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Create order failed");
    }
  }

  async function handleCancel(orderId: bigint) {
    try {
      await send({
        address: addresses.market,
        abi: marketAbi,
        functionName: "cancelOrder",
        args: [orderId],
      });
      setState("success");
      setNote(pick("买单已取消，资金已退回。", "Bid cancelled and refunded."));
      orders.refetch();
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Cancel failed");
    }
  }

  async function handleFill(order: MarketOrder, sellTokenId: bigint) {
    try {
      const isRelic = order.collection.toLowerCase() === addresses.relic.toLowerCase();
      if (isRelic && !relicApproved) {
        await send({
          address: addresses.relic,
          abi: relicAbi,
          functionName: "setApprovalForAll",
          args: [addresses.market, true],
        });
      }
      if (!isRelic && !loomApproved) {
        await send({
          address: addresses.loom,
          abi: loomAbi,
          functionName: "setApprovalForAll",
          args: [addresses.market, true],
        });
      }
      await send({
        address: addresses.market,
        abi: marketAbi,
        functionName: "fillOrder",
        args: [order.id, sellTokenId],
      });
      setState("success");
      setNote(pick("成交完成，USDT 已到账（扣除 1% 手续费）。", "Filled. USDT received minus the 1% fee."));
      orders.refetch();
      user.refetch();
    } catch (cause) {
      setState("error");
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Fill failed");
    }
  }

  return (
    <div className="shell">
      <PageHead
        eyebrow={pick("BID-ONLY MARKET", "BID-ONLY MARKET")}
        title={
          <>
            {pick("只挂买单，", "Bids only.")} <span className="gold">{pick("卖家来挑", "Sellers choose.")}</span>
          </>
        }
        description={pick(
          "买家挂出 USDT 买单并锁定资金，卖家选择接受哪一个。成交收取 1% 手续费。",
          "Buyers post USDT bids with funds escrowed; sellers accept whichever bid they like. A 1% fee applies on fill.",
        )}
        action={<span className="tag gold">{feeBps !== undefined ? Number(feeBps) / 100 : 1}% FEE</span>}
      />

      {!isConfigured && <Banner />}

      <div className="tabs">
        <button type="button" className={`tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>
          {pick("买单簿", "Order book")} ({activeOrders.length})
        </button>
        <button type="button" className={`tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
          {pick("挂买单", "Post a bid")}
        </button>
        <button type="button" className={`tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
          {pick("我的挂单", "My orders")} ({myOrders.length})
        </button>
      </div>

      <div style={{ paddingBottom: 60 }}>
        {tab === "book" && (
          <section className="panel">
            {activeOrders.length === 0 ? (
              <EmptyState
                title={pick("还没有买单", "No bids yet")}
                body={pick("成为第一个挂单的人，锁定 USDT 等待卖家接单。", "Be the first: escrow USDT and wait for a seller to accept.")}
                cta={{ href: "/market", label: pick("刷新", "Refresh") }}
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{pick("资产", "ASSET")}</th>
                      <th>{pick("指定 Token", "TOKEN")}</th>
                      <th>{pick("价格", "PRICE")}</th>
                      <th>{pick("买家", "BUYER")}</th>
                      <th>{pick("挂单时间", "AGE")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map((order) => (
                      <OrderRow
                        key={order.id.toString()}
                        order={order}
                        address={address}
                        user={user}
                        now={now}
                        pick={pick}
                        onFill={handleFill}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "create" && (
          <div className="grid-2" style={{ alignItems: "start" }}>
            <section className="panel">
              <p className="eyebrow">{pick("挂出买单", "POST A BID")}</p>
              <h3 className="display-md" style={{ marginTop: 10, marginBottom: 20 }}>
                {pick("锁定 USDT，等待卖家", "Escrow USDT, wait for a seller")}
              </h3>

              {!isConnected ? (
                <EmptyState title={pick("先连接钱包", "Connect a wallet")} body={pick("连接后即可挂单。", "Connect to post a bid.")} />
              ) : (
                <div className="stack">
                  <div className="field">
                    <label>{pick("资产类型", "COLLECTION")}</label>
                    <select className="select" value={collection} onChange={(event) => setCollection(event.target.value as "relic" | "loom")}>
                      <option value="relic">Relic</option>
                      <option value="loom">Loom</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>{pick("指定 Token ID（可选）", "TOKEN ID (OPTIONAL)")}</label>
                      <input
                        className="input"
                        inputMode="numeric"
                        placeholder={pick("留空 = 任意", "Blank = any")}
                        value={tokenId}
                        onChange={(event) => setTokenId(event.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </div>
                    <div className="field">
                      <label>{pick("价格 (USDT)", "PRICE (USDT)")}</label>
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="12.5"
                        value={price}
                        onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))}
                      />
                    </div>
                  </div>
                  <div className="callout">
                    <span>◈</span>
                    <span>
                      {pick(
                        "挂单即锁定资金。成交收取 1% 手续费，取消全额退款。",
                        "Posting escrows the full amount. 1% fee on fill, full refund on cancel.",
                      )}
                    </span>
                  </div>
                  <button type="button" className="btn btn-primary btn-block" onClick={handleCreate} disabled={state === "signing" || state === "pending"}>
                    {state === "signing" || state === "pending" ? pick("处理中…", "Processing…") : pick("挂出买单", "Post bid")}
                  </button>
                  <p className="form-hint">
                    {pick("可用余额", "Available")}: {formatUnits(user.usdtBalance, usdtDecimals, 2)} USDT
                  </p>
                </div>
              )}
            </section>

            <section className="panel">
              <p className="eyebrow">{pick("市场规则", "HOW IT WORKS")}</p>
              <div style={{ marginTop: 12 }}>
                <div className="kv">
                  <span>{pick("模式", "Mode")}</span>
                  <b>{pick("仅买单订单簿", "BID-ONLY BOOK")}</b>
                </div>
                <div className="kv">
                  <span>{pick("计价", "QUOTE")}</span>
                  <b>USDT</b>
                </div>
                <div className="kv">
                  <span>{pick("手续费", "FEE")}</span>
                  <b>{feeBps !== undefined ? Number(feeBps) / 100 : 1}%</b>
                </div>
                <div className="kv">
                  <span>{pick("结算", "SETTLEMENT")}</span>
                  <b>{pick("原子成交", "ATOMIC")}</b>
                </div>
              </div>
              <div className="divider" />
              <p className="form-hint">
                {pick(
                  "卖家无需自己标价：直接浏览买单，选择最合适的价格出售。买家资金在挂单时即锁定，成交不可反悔。",
                  "Sellers never set a price: browse bids and sell into the best one. Buyer funds are escrowed at post time.",
                )}
              </p>
            </section>
          </div>
        )}

        {tab === "mine" && (
          <section className="panel">
            {!isConnected ? (
              <EmptyState title={pick("先连接钱包", "Connect a wallet")} body={pick("连接后查看你的挂单。", "Connect to see your orders.")} />
            ) : myOrders.length === 0 ? (
              <EmptyState
                title={pick("还没有挂单", "No orders yet")}
                body={pick("挂出第一张买单，等待卖家接单。", "Post your first bid and wait for a seller.")}
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{pick("资产", "ASSET")}</th>
                      <th>{pick("Token", "TOKEN")}</th>
                      <th>{pick("价格", "PRICE")}</th>
                      <th>{pick("状态", "STATUS")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {myOrders.map((order) => (
                      <tr key={order.id.toString()}>
                        <td className="mono">#{order.id.toString()}</td>
                        <td>
                          <span className="collection">
                            <span className={`collection-dot ${order.collection.toLowerCase() === addresses.loom.toLowerCase() ? "loom" : ""}`} />
                            {order.collection.toLowerCase() === addresses.loom.toLowerCase() ? "Loom" : "Relic"}
                          </span>
                        </td>
                        <td className="mono">{order.tokenId === 0n ? pick("任意", "ANY") : `#${order.tokenId}`}</td>
                        <td className="price">{formatUnits(order.price, usdtDecimals, 2)} USDT</td>
                        <td>
                          {order.active ? (
                            <span className="tag green">{pick("挂单中", "OPEN")}</span>
                          ) : (
                            <span className="tag">{pick("已结束", "CLOSED")}</span>
                          )}
                        </td>
                        <td>
                          {order.active && (
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => handleCancel(order.id)}>
                              {pick("取消", "Cancel")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <TxStatus state={state} hash={hash} error={error} children={note ? <span> {note}</span> : null} />

        <div className="callout" style={{ marginTop: 22 }}>
          <span>◇</span>
          <span>
            {pick("需要 Relic 来合成 Loom？", "Need Relics to forge a Loom?")}{" "}
            <Link href="/mint" style={{ color: "var(--gold)" }}>
              {pick("直接铸造 →", "Mint directly →")}
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  address,
  user,
  now,
  pick,
  onFill,
}: {
  order: MarketOrder;
  address?: Address;
  user: ReturnType<typeof useUserData>;
  now: number;
  pick: <T>(zh: T, en: T) => T;
  onFill: (order: MarketOrder, tokenId: bigint) => void;
}) {
  const isLoom = order.collection.toLowerCase() === addresses.loom.toLowerCase();
  const tokens = isLoom ? user.looms.map((loom) => loom.id) : user.relicIds;
  const eligible = order.tokenId === 0n ? tokens : tokens.filter((id) => id === order.tokenId);
  const [selected, setSelected] = useState<string>(eligible[0]?.toString() ?? "");
  const own = address && order.buyer.toLowerCase() === address.toLowerCase();

  return (
    <tr>
      <td className="mono">#{order.id.toString()}</td>
      <td>
        <span className="collection">
          <span className={`collection-dot ${isLoom ? "loom" : ""}`} />
          {isLoom ? "Loom" : "Relic"}
        </span>
      </td>
      <td className="mono">{order.tokenId === 0n ? pick("任意", "ANY") : `#${order.tokenId}`}</td>
      <td className="price">{formatUnits(order.price, usdtDecimals, 2)} USDT</td>
      <td className="mono">
        {shortAddress(order.buyer)}
        {own && <span className="tag gold" style={{ marginLeft: 6 }}>{pick("你", "YOU")}</span>}
      </td>
      <td className="dim">{timeAgo(order.createdAt, now)}</td>
      <td>
        {!address ? (
          <span className="dim">—</span>
        ) : own ? (
          <span className="dim">{pick("自己的单", "YOURS")}</span>
        ) : eligible.length === 0 ? (
          <Link href="/mint" className="dim" style={{ fontSize: 11.5 }}>
            {pick("无可用资产", "NO ASSET")}
          </Link>
        ) : (
          <div className="quick-sell">
            {eligible.length > 1 && (
              <select className="select" value={selected} onChange={(event) => setSelected(event.target.value)}>
                {eligible.map((id) => (
                  <option key={id.toString()} value={id.toString()}>
                    #{id.toString()}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => onFill(order, BigInt(selected || eligible[0]))}
            >
              {pick("卖给他", "Sell")}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
