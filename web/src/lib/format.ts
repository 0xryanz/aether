export function shortAddress(address?: string | null, size = 4): string {
  if (!address) return "—";
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function formatUnits(value: bigint | undefined, decimals = 18, maxFraction = 2): string {
  if (value === undefined) return "—";
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  const wholeText = whole.toLocaleString("en-US");
  if (maxFraction === 0) return `${negative ? "-" : ""}${wholeText}`;
  const fractionText = fraction.toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  return `${negative ? "-" : ""}${wholeText}${fractionText ? `.${fractionText}` : ""}`;
}

export function formatCompact(value: number, fraction = 1): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: fraction }).format(value);
}

export function formatUsdt(value: bigint | undefined, decimals = 18, maxFraction = 2): string {
  return `${formatUnits(value, decimals, maxFraction)} USDT`;
}

export function parseAmount(value: string, decimals = 18): bigint {
  const [whole, fraction = ""] = value.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const hh = `${h}`.padStart(2, "0");
  const mm = `${m}`.padStart(2, "0");
  const ss = `${s}`.padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function timeAgo(timestamp: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function boostTier(forgeTime: number, now = Math.floor(Date.now() / 1000)): 2 | 1.5 | 1 {
  const age = Math.max(0, now - forgeTime);
  if (age < 5 * 86400) return 2;
  if (age < 10 * 86400) return 1.5;
  return 1;
}

export function boostSecondsLeft(forgeTime: number, now = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, forgeTime + 10 * 86400 - now);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
