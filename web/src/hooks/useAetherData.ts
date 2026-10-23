"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import type { Address, AbiEvent, Hex, PublicClient } from "viem";
import { addresses, deployBlock, isConfigured } from "@/lib/config";
import { activeChain } from "@/lib/wagmi";
import { aetherAbi, erc20Abi, forgeAbi, loomAbi, marketAbi, registryAbi, relicAbi } from "@/lib/abi";
import { boostTier } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

type ReadResult = { status: "success" | "failure"; result?: unknown };

function bigintAt(data: readonly ReadResult[] | undefined, index: number): bigint {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as bigint) : 0n;
}

function boolAt(data: readonly ReadResult[] | undefined, index: number): boolean {
  const item = data?.[index];
  return item?.status === "success" ? Boolean(item.result) : false;
}

function addressAt(data: readonly ReadResult[] | undefined, index: number): Address {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as Address) : (ZERO as Address);
}

export type GlobalStats = {
  publicMinted: bigint;
  publicRemaining: bigint;
  teamMinted: bigint;
  nextTokenId: bigint;
  saleActive: boolean;
  bnbPriceUsd: bigint;
  perAgentCap: number;
  loomSupply: bigint;
  emitted: bigint;
  scheduled: bigint;
  totalWeight: bigint;
  miningStart: number;
  miningEnd: number;
  referralShareBps: number;
  forgingActive: boolean;
  aetherSupply: bigint;
  miningMinted: bigint;
  miningRemaining: bigint;
  orderCount: bigint;
  isLoading: boolean;
};

export function useGlobalStats(): GlobalStats {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "publicMinted" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "publicRemaining" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "teamMinted" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "nextTokenId" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "saleActive" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "bnbPriceUsd" },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "perAgentCap" },
      { chainId: activeChain.id, address: addresses.loom, abi: loomAbi, functionName: "totalSupply" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "emittedFromSchedule" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "scheduledEmission" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "totalWeight" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "miningStart" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "miningEnd" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "referralShareBps" },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "forgingActive" },
      { chainId: activeChain.id, address: addresses.aether, abi: aetherAbi, functionName: "totalSupply" },
      { chainId: activeChain.id, address: addresses.aether, abi: aetherAbi, functionName: "miningMinted" },
      { chainId: activeChain.id, address: addresses.aether, abi: aetherAbi, functionName: "miningRemaining" },
      { chainId: activeChain.id, address: addresses.market, abi: marketAbi, functionName: "orderCount" },
    ],
    allowFailure: true,
    query: { enabled: isConfigured, refetchInterval: 15_000 },
  });

  return {
    publicMinted: bigintAt(data, 0),
    publicRemaining: bigintAt(data, 1),
    teamMinted: bigintAt(data, 2),
    nextTokenId: bigintAt(data, 3),
    saleActive: boolAt(data, 4),
    bnbPriceUsd: bigintAt(data, 5),
    perAgentCap: Number(bigintAt(data, 6)) || 4,
    loomSupply: bigintAt(data, 7),
    emitted: bigintAt(data, 8),
    scheduled: bigintAt(data, 9),
    totalWeight: bigintAt(data, 10),
    miningStart: Number(bigintAt(data, 11)),
    miningEnd: Number(bigintAt(data, 12)),
    referralShareBps: Number(bigintAt(data, 13)) || 800,
    forgingActive: boolAt(data, 14),
    aetherSupply: bigintAt(data, 15),
    miningMinted: bigintAt(data, 16),
    miningRemaining: bigintAt(data, 17),
    orderCount: bigintAt(data, 18),
    isLoading,
  };
}

export type LoomHolding = {
  id: bigint;
  forgeTime: number;
  weight: number;
};

export type UserData = {
  agentId: Hex;
  verified: boolean;
  relicBalance: number;
  relicIds: bigint[];
  loomBalance: number;
  looms: LoomHolding[];
  pending: bigint;
  mined: bigint;
  aetherBalance: bigint;
  usdtBalance: bigint;
  usdtAllowanceRelic: bigint;
  usdtAllowanceMarket: bigint;
  relicApprovedForForge: boolean;
  referrer: Address;
  validInvites: number;
  referralClaimable: bigint;
  referralEarned: bigint;
  totalReferralMinted: bigint;
  mintedByAgent: number;
  isLoading: boolean;
  refetch: () => void;
};

export function useUserData(account?: Address): UserData {
  const enabled = Boolean(account) && isConfigured;

  const base = useReadContracts({
    contracts: [
      { chainId: activeChain.id, address: addresses.registry, abi: registryAbi, functionName: "agentIdOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "balanceOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.loom, abi: loomAbi, functionName: "balanceOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "pendingForWallet", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "minedBy", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.aether, abi: aetherAbi, functionName: "balanceOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.usdt, abi: erc20Abi, functionName: "balanceOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.usdt, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, addresses.relic] },
      { chainId: activeChain.id, address: addresses.usdt, abi: erc20Abi, functionName: "allowance", args: [account ?? ZERO, addresses.market] },
      { chainId: activeChain.id, address: addresses.relic, abi: relicAbi, functionName: "isApprovedForAll", args: [account ?? ZERO, addresses.forge] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "referrerOf", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "validInvites", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "referralClaimable", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "referralEarned", args: [account ?? ZERO] },
      { chainId: activeChain.id, address: addresses.forge, abi: forgeAbi, functionName: "totalReferralMinted", args: [account ?? ZERO] },
    ],
    allowFailure: true,
    query: { enabled, refetchInterval: 10_000 },
  });

  const agentId = (base.data?.[0]?.status === "success" ? (base.data[0].result as Hex) : ZERO32) as Hex;
  const relicBalance = Number(bigintAt(base.data, 1));
  const loomBalance = Number(bigintAt(base.data, 2));

  const relicReads = useReadContracts({
    contracts: Array.from({ length: relicBalance }, (_, index) => ({
      chainId: activeChain.id,
      address: addresses.relic,
      abi: relicAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [account ?? ZERO, BigInt(index)] as const,
    })),
    allowFailure: true,
    query: { enabled: enabled && relicBalance > 0 },
  });

  const loomReads = useReadContracts({
    contracts: Array.from({ length: loomBalance }, (_, index) => ({
      chainId: activeChain.id,
      address: addresses.loom,
      abi: loomAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [account ?? ZERO, BigInt(index)] as const,
    })),
    allowFailure: true,
    query: { enabled: enabled && loomBalance > 0 },
  });

  const loomIds = useMemo(
    () =>
      (loomReads.data ?? [])
        .map((item) => (item.status === "success" ? (item.result as bigint) : 0n))
        .filter((id) => id > 0n),
    [loomReads.data],
  );

  const forgeTimes = useReadContracts({
    contracts: loomIds.map((id) => ({
      chainId: activeChain.id,
      address: addresses.loom,
      abi: loomAbi,
      functionName: "forgeTime" as const,
      args: [id] as const,
    })),
    allowFailure: true,
    query: { enabled: enabled && loomIds.length > 0 },
  });

  const now = Math.floor(Date.now() / 1000);
  const looms = useMemo(
    () =>
      loomIds.map((id, index) => {
        const raw = forgeTimes.data?.[index];
        const forgeTime = raw?.status === "success" ? Number(raw.result as bigint) : now;
        return { id, forgeTime, weight: boostTier(forgeTime, now) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loomIds, forgeTimes.data],
  );

  const agentRead = useReadContracts({
    contracts: [
      {
        chainId: activeChain.id,
        address: addresses.relic,
        abi: relicAbi,
        functionName: "mintedByAgent",
        args: [agentId],
      },
    ],
    allowFailure: true,
    query: { enabled: enabled && agentId !== ZERO },
  });
  const mintedByAgent = Number(bigintAt(agentRead.data, 0));

  return {
    agentId,
    verified: agentId !== ZERO32,
    relicBalance,
    relicIds: (relicReads.data ?? [])
      .map((item) => (item.status === "success" ? (item.result as bigint) : 0n))
      .filter((id) => id > 0n),
    loomBalance,
    looms,
    pending: bigintAt(base.data, 3),
    mined: bigintAt(base.data, 4),
    aetherBalance: bigintAt(base.data, 5),
    usdtBalance: bigintAt(base.data, 6),
    usdtAllowanceRelic: bigintAt(base.data, 7),
    usdtAllowanceMarket: bigintAt(base.data, 8),
    relicApprovedForForge: boolAt(base.data, 9),
    referrer: addressAt(base.data, 10),
    validInvites: Number(bigintAt(base.data, 11)),
    referralClaimable: bigintAt(base.data, 12),
    referralEarned: bigintAt(base.data, 13),
    totalReferralMinted: bigintAt(base.data, 14),
    mintedByAgent,
    isLoading: base.isLoading,
    refetch: () => {
      base.refetch();
      agentRead.refetch();
      relicReads.refetch();
      loomReads.refetch();
      forgeTimes.refetch();
    },
  };
}

export type MarketOrder = {
  id: bigint;
  buyer: Address;
  collection: Address;
  tokenId: bigint;
  price: bigint;
  createdAt: number;
  active: boolean;
};

export function useOrders(limit = 120): { orders: MarketOrder[]; isLoading: boolean; refetch: () => void } {
  const countRead = useReadContracts({
    contracts: [{ chainId: activeChain.id, address: addresses.market, abi: marketAbi, functionName: "orderCount" }],
    allowFailure: true,
    query: { enabled: isConfigured, refetchInterval: 10_000 },
  });

  const count = Number(bigintAt(countRead.data, 0));
  const start = Math.max(0, count - limit);

  const reads = useReadContracts({
    contracts: Array.from({ length: Math.max(0, count - start) }, (_, index) => ({
      chainId: activeChain.id,
      address: addresses.market,
      abi: marketAbi,
      functionName: "orderAt" as const,
      args: [BigInt(start + index)] as const,
    })),
    allowFailure: true,
    query: { enabled: isConfigured && count > 0, refetchInterval: 10_000 },
  });

  const orders = useMemo(() => {
    const rows: MarketOrder[] = [];
    (reads.data ?? []).forEach((item, index) => {
      if (item.status !== "success") return;
      const value = item.result as readonly [Address, Address, bigint, bigint, bigint, boolean];
      const [buyer, collection, tokenId, price, createdAt, active] = value;
      rows.push({ id: BigInt(start + index), buyer, collection, tokenId, price, createdAt: Number(createdAt), active });
    });
    return rows.sort((a, b) => Number(b.id - a.id));
  }, [reads.data, start]);

  return {
    orders,
    isLoading: countRead.isLoading || reads.isLoading,
    refetch: () => {
      countRead.refetch();
      reads.refetch();
    },
  };
}

export type HolderRow = {
  owner: Address;
  weight: number;
  looms: number;
  pendingWeight: number;
};

export type EarnerRow = {
  owner: Address;
  amount: bigint;
};

export type LeaderboardData = {
  holders: HolderRow[];
  today: EarnerRow[];
  week: EarnerRow[];
  totalClaimed: bigint;
  earners: number;
  totalWeight: number;
  isLoading: boolean;
};

async function fetchLogsChunked(
  client: PublicClient,
  params: { address: Address; event: AbiEvent },
  fromBlock: bigint,
  toBlock: bigint,
  chunk = 5_000n,
): Promise<Array<{ args: Record<string, unknown>; blockNumber: bigint }>> {
  const logs: Array<{ args: Record<string, unknown>; blockNumber: bigint }> = [];
  const maxChunks = 60;
  let start = fromBlock;
  for (let i = 0; i < maxChunks && start <= toBlock; i += 1) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    try {
      const batch = await client.getLogs({
        address: params.address,
        event: params.event,
        fromBlock: start,
        toBlock: end,
      });
      for (const log of batch) {
        logs.push({ args: (log.args ?? {}) as Record<string, unknown>, blockNumber: log.blockNumber ?? 0n });
      }
    } catch {
      // Range too wide for the RPC; shrink and retry once.
      const halfEnd = start + (end - start) / 2n;
      if (halfEnd > start) {
        const batch = await client.getLogs({
          address: params.address,
          event: params.event,
          fromBlock: start,
          toBlock: halfEnd,
        }).catch(() => []);
        for (const log of batch) {
          logs.push({ args: (log.args ?? {}) as Record<string, unknown>, blockNumber: log.blockNumber ?? 0n });
        }
        start = halfEnd + 1n;
        continue;
      }
    }
    start = end + 1n;
  }
  return logs;
}

export function useLeaderboard(maxLooms = 1_200): LeaderboardData {
  const client = usePublicClient({ chainId: activeChain.id });
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", chainKey(), maxLooms],
    enabled: isConfigured && Boolean(client),
    refetchInterval: 30_000,
    queryFn: async (): Promise<LeaderboardData> => {
      if (!client) throw new Error("no client");

      const latestBlock = await client.getBlock();
      const now = Number(latestBlock.timestamp);

      const supply = await client.readContract({
        address: addresses.loom,
        abi: loomAbi,
        functionName: "totalSupply",
      });
      const total = Math.min(Number(supply), maxLooms);
      const ids = Array.from({ length: total }, (_, index) => BigInt(index + 1));

      const chunks: Array<typeof ids> = [];
      for (let i = 0; i < ids.length; i += 250) chunks.push(ids.slice(i, i + 250));

      const owned: Array<{ id: bigint; owner: Address; forgeTime: number }> = [];
      for (const chunk of chunks) {
        const calls = chunk.flatMap((id) => [
          { address: addresses.loom, abi: loomAbi, functionName: "ownerOf" as const, args: [id] as const },
          { address: addresses.loom, abi: loomAbi, functionName: "forgeTime" as const, args: [id] as const },
        ]);
        const results = await client.multicall({ contracts: calls, allowFailure: true });
        for (let i = 0; i < chunk.length; i += 1) {
          const ownerResult = results[i * 2];
          const timeResult = results[i * 2 + 1];
          if (ownerResult?.status !== "success" || timeResult?.status !== "success") continue;
          owned.push({
            id: chunk[i],
            owner: ownerResult.result as Address,
            forgeTime: Number(timeResult.result as bigint),
          });
        }
      }

      const grouped = new Map<Address, { weight: number; looms: number }>();
      for (const item of owned) {
        const row = grouped.get(item.owner) ?? { weight: 0, looms: 0 };
        row.weight += boostTier(item.forgeTime, now);
        row.looms += 1;
        grouped.set(item.owner, row);
      }
      const holders = [...grouped.entries()]
        .map(([owner, row]) => ({ owner, weight: row.weight, looms: row.looms, pendingWeight: 0 }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 100);

      const logs = await fetchLogsChunked(
        client,
        { address: addresses.forge, event: claimedLogEvent() },
        deployBlock,
        latestBlock.number,
      );

      const blockNumbers = [...new Set(logs.map((log) => log.blockNumber.toString()))].slice(-500);
      const timestamps = new Map<string, number>();
      await Promise.all(
        blockNumbers.map(async (blockNumber) => {
          try {
            const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
            timestamps.set(blockNumber, Number(block.timestamp));
          } catch {
            timestamps.set(blockNumber, 0);
          }
        }),
      );

      const dayStart = now - (now % 86_400);
      const weekStart = dayStart - 6 * 86_400;
      const todayMap = new Map<Address, bigint>();
      const weekMap = new Map<Address, bigint>();
      let totalClaimed = 0n;
      const earnersSet = new Set<string>();

      for (const log of logs) {
        const user = log.args.user as Address | undefined;
        const amount = (log.args.amount as bigint | undefined) ?? 0n;
        if (!user) continue;
        const ts = timestamps.get(log.blockNumber.toString()) ?? 0;
        totalClaimed += amount;
        earnersSet.add(user.toLowerCase());
        if (ts >= dayStart) todayMap.set(user, (todayMap.get(user) ?? 0n) + amount);
        if (ts >= weekStart) weekMap.set(user, (weekMap.get(user) ?? 0n) + amount);
      }

      const toRows = (map: Map<Address, bigint>): EarnerRow[] =>
        [...map.entries()]
          .map(([owner, amount]) => ({ owner, amount }))
          .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
          .slice(0, 20);

      return {
        holders,
        today: toRows(todayMap),
        week: toRows(weekMap),
        totalClaimed,
        earners: earnersSet.size,
        totalWeight: holders.reduce((sum, row) => sum + row.weight, 0),
        isLoading: false,
      };
    },
  });

  return (
    data ?? {
      holders: [],
      today: [],
      week: [],
      totalClaimed: 0n,
      earners: 0,
      totalWeight: 0,
      isLoading,
    }
  );
}

function chainKey(): string {
  return String(process.env.NEXT_PUBLIC_CHAIN_ID ?? "0");
}

function claimedLogEvent(): AbiEvent {
  return {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "referralAmount", type: "uint256", indexed: false },
    ],
  } as const;
}
