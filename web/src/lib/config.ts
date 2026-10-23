const ZERO = "0x0000000000000000000000000000000000000000" as const;

function envAddress(value: string | undefined): `0x${string}` {
  return (value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : ZERO) as `0x${string}`;
}

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

export const addresses = {
  aether: envAddress(process.env.NEXT_PUBLIC_AETHER_ADDRESS),
  relic: envAddress(process.env.NEXT_PUBLIC_RELIC_ADDRESS),
  loom: envAddress(process.env.NEXT_PUBLIC_LOOM_ADDRESS),
  forge: envAddress(process.env.NEXT_PUBLIC_FORGE_ADDRESS),
  market: envAddress(process.env.NEXT_PUBLIC_MARKET_ADDRESS),
  registry: envAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
  usdt: envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS),
} as const;

export const usdtDecimals = Number(process.env.NEXT_PUBLIC_USDT_DECIMALS ?? 18);
export const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");
export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || undefined;

export const demo = {
  faucet: process.env.NEXT_PUBLIC_DEMO_FAUCET === "1",
  selfRegister: process.env.NEXT_PUBLIC_SELF_REGISTER === "1",
};

/** Every page degrades to a read-only showcase when addresses are missing. */
export const isConfigured = Object.values(addresses).every((address) => address !== ZERO);

export const chainMeta = {
  56: { name: "BNB Chain", explorer: "https://bscscan.com", currency: "BNB" },
  97: { name: "BNB Testnet", explorer: "https://testnet.bscscan.com", currency: "tBNB" },
  31337: { name: "Anvil Local", explorer: "", currency: "ETH" },
} as const;

export function explorerTx(hash: string): string | null {
  const meta = chainMeta[chainId as keyof typeof chainMeta];
  return meta?.explorer ? `${meta.explorer}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  const meta = chainMeta[chainId as keyof typeof chainMeta];
  return meta?.explorer ? `${meta.explorer}/address/${address}` : null;
}
