"use client";

import { createConfig, http, injected } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { defineChain } from "viem";
import { chainId, rpcUrl } from "./config";

/** Local anvil chain with the canonical Multicall3 wired up by the dev script. */
export const localChain = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl ?? "http://127.0.0.1:8545"] },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

const allChains = [bsc, bscTestnet, localChain] as const;
const requestedChain = allChains.find((chain) => chain.id === chainId) ?? localChain;

// The configured chain must be first: wagmi uses the first chain as the default
// read chain before a wallet is connected.
export const chains =
  requestedChain.id === bsc.id
    ? ([bsc, bscTestnet, localChain] as const)
    : requestedChain.id === bscTestnet.id
      ? ([bscTestnet, bsc, localChain] as const)
      : ([localChain, bsc, bscTestnet] as const);

export const activeChain = chains[0];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
    [localChain.id]: http(rpcUrl ?? "http://127.0.0.1:8545"),
  },
  ssr: false,
});
