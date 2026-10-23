"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { cx } from "@/lib/format";

export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-lg">{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {action && <div className="page-head-action">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: "gold" | "violet" | "ember";
}) {
  return (
    <div className={cx("stat-card", accent && `accent-${accent}`)}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="empty-state">
      <div className="empty-rune">◇</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {cta && (
        <Link href={cta.href} className="btn btn-ghost btn-small">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function Banner() {
  const { pick } = useI18n();
  return (
    <div className="config-banner">
      <span className="dot" />
      {pick(
        "合约地址未配置。当前为只读展示模式 —— 运行 pnpm dev:local 部署本地链并写入地址。",
        "Contract addresses are not configured. Running in showcase mode — use pnpm dev:local to deploy locally.",
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("skeleton", className)} />;
}

export function TxStatus({
  state,
  hash,
  error,
  children,
}: {
  state: "idle" | "signing" | "pending" | "success" | "error";
  hash?: string;
  error?: string | null;
  children?: React.ReactNode;
}) {
  const { pick } = useI18n();
  if (state === "idle" && !error) return null;
  return (
    <div className={cx("tx-status", `tx-${state}`)}>
      {state === "signing" && <span>{pick("请在钱包中确认…", "Confirm in your wallet…")}</span>}
      {state === "pending" && (
        <span>
          {pick("交易已提交，等待确认…", "Transaction submitted, waiting…")}
          {hash && <span className="mono tx-hash"> {hash.slice(0, 10)}…</span>}
        </span>
      )}
      {state === "success" && <span>{pick("交易已确认。", "Transaction confirmed.")}{children}</span>}
      {state === "error" && <span className="form-error">{error?.split("\n")[0] ?? pick("交易失败", "Transaction failed")}</span>}
    </div>
  );
}
