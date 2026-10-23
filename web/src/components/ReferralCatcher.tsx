"use client";

import { useEffect } from "react";
import { isAddress } from "viem";

/**
 * Captures ?ref= from any landing page and remembers it until the visitor
 * connects and binds the referrer from the dashboard.
 */
export function ReferralCatcher() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && isAddress(ref)) {
      window.localStorage.setItem("aether:ref", ref);
    }
  }, []);

  return null;
}
