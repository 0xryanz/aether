"use client";

import { useEffect, useState } from "react";
import { useBlock } from "wagmi";
import { activeChain } from "@/lib/wagmi";
import { useNow } from "@/lib/i18n";

/**
 * Wall clock aligned to the chain. Useful when a local anvil devnet has been
 * time-warped forward (the browser clock would otherwise be days behind).
 */
export function useChainClock(): number {
  const localNow = useNow(1000);
  const { data: block } = useBlock({ chainId: activeChain.id, query: { refetchInterval: 6_000 } });
  const [skew, setSkew] = useState(0);

  useEffect(() => {
    if (!block) return;
    setSkew(Number(block.timestamp) - Math.floor(Date.now() / 1000));
  }, [block]);

  return localNow + skew;
}
