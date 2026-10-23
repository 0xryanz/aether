"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useI18n, useMounted } from "@/lib/i18n";
import { activeChain, chains } from "@/lib/wagmi";
import { useSwitchToAppChain } from "@/hooks/useSwitchToAppChain";

/**
 * Shown when the wallet is connected to a different chain than the app.
 * Balance and contract data on the site always come from the configured chain,
 * which is confusing without this hint.
 */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const mounted = useMounted();
  const { pick } = useI18n();
  const { switchToAppChain, isSwitching } = useSwitchToAppChain();
  const [error, setError] = useState<string | null>(null);

  if (!mounted || !isConnected || chainId === undefined || chainId === activeChain.id) return null;

  const currentName = chains.find((chain) => chain.id === chainId)?.name ?? `Chain ${chainId}`;

  async function handleSwitch() {
    setError(null);
    try {
      await switchToAppChain();
    } catch (cause) {
      const message = cause as { shortMessage?: string; message?: string };
      setError(message.shortMessage ?? message.message ?? "Network switch failed");
    }
  }

  return (
    <div className="network-banner">
      <span className="network-dot" />
      <span className="network-copy">
        {pick(
          `钱包当前在 ${currentName}，网站展示的是 ${activeChain.name} 上的数据。`,
          `Your wallet is on ${currentName}; the site is reading ${activeChain.name}.`,
        )}
      </span>
      <button type="button" className="btn btn-ghost btn-small" onClick={handleSwitch} disabled={isSwitching}>
        {isSwitching ? pick("切换中…", "Switching…") : pick(`切换到 ${activeChain.name}`, `Switch to ${activeChain.name}`)}
      </button>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
