"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { activeChain } from "@/lib/wagmi";

/**
 * Switch the wallet to the app's configured chain, adding it first when the
 * wallet does not know it yet (common for local anvil / testnets).
 */
export function useSwitchToAppChain() {
  const { connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isSwitching, setIsSwitching] = useState(false);

  async function switchToAppChain() {
    setIsSwitching(true);
    try {
      try {
        await switchChainAsync({ chainId: activeChain.id });
        return;
      } catch {
        // 4902 = unrecognized chain; fall through and add it.
      }

      const provider = (await connector?.getProvider()) as
        | { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined;
      if (!provider) throw new Error("Wallet provider unavailable");

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${activeChain.id.toString(16)}`,
            chainName: activeChain.name,
            nativeCurrency: activeChain.nativeCurrency,
            rpcUrls: [activeChain.rpcUrls.default.http[0]],
            blockExplorerUrls: activeChain.blockExplorers?.default?.url
              ? [activeChain.blockExplorers.default.url]
              : [],
          },
        ],
      });
      await switchChainAsync({ chainId: activeChain.id });
    } finally {
      setIsSwitching(false);
    }
  }

  return { switchToAppChain, isSwitching };
}
