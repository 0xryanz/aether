"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cx } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { RelicCard } from "./NftCards";

const AUTO_CLOSE_MS = 7000;
const EXIT_MS = 320;

/**
 * Celebration overlay shown right after a successful mint. It reveals the
 * freshly minted Relic card(s), auto-dismisses after a few seconds, and can be
 * closed manually by button, backdrop click, or Escape.
 */
export function MintReveal({ ids, onClose }: { ids: bigint[]; onClose: () => void }) {
  const { pick } = useI18n();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    exitTimer.current = window.setTimeout(() => onCloseRef.current(), EXIT_MS);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const autoTimer = window.setTimeout(beginClose, AUTO_CLOSE_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") beginClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(autoTimer);
      if (exitTimer.current !== undefined) window.clearTimeout(exitTimer.current);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [beginClose]);

  const first = ids[0];
  const last = ids[ids.length - 1];
  const range = ids.length === 1 ? `#${first.toString()}` : `#${first.toString()} – #${last.toString()}`;

  const sparks = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    const distance = 148 + (index % 4) * 42;
    return {
      dx: Math.round(Math.cos(angle) * distance),
      dy: Math.round(Math.sin(angle) * distance),
      delay: 0.12 + (index % 5) * 0.06,
    };
  });

  return (
    <div
      className={cx("reveal-overlay", closing && "closing")}
      role="presentation"
      onClick={beginClose}
    >
      <div className="reveal-rays" aria-hidden="true" />
      <div className="reveal-halo" aria-hidden="true" />

      <div
        className={cx("reveal-dialog", ids.length > 1 && "multi", closing && "closing")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-reveal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="reveal-close"
          onClick={beginClose}
          aria-label={pick("关闭", "Close")}
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="reveal-sparks" aria-hidden="true">
          {sparks.map((spark, index) => (
            <span
              key={index}
              className="reveal-spark"
              style={
                {
                  "--dx": `${spark.dx}px`,
                  "--dy": `${spark.dy}px`,
                  "--delay": `${spark.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <p className="reveal-eyebrow">
          <span className="reveal-eyebrow-dot" aria-hidden="true" />
          {pick("铸造完成", "MINT COMPLETE")}
        </p>
        <h2 className="reveal-title" id="mint-reveal-title">
          {ids.length > 1
            ? pick(`铸成 ${ids.length} 枚 Relic`, `${ids.length} Relics minted`)
            : pick("Relic 已铸成", "Relic minted")}
        </h2>
        <p className="reveal-sub">
          <b>{range}</b>
          <span aria-hidden="true">·</span>
          {pick("已加入你的收藏", "added to your collection")}
        </p>

        <div className={cx("reveal-cards", ids.length > 1 && "multi")}>
          {ids.map((id, index) => (
            <div
              className="reveal-card"
              key={id.toString()}
              style={{ "--i": index } as CSSProperties}
            >
              <RelicCard id={id} />
            </div>
          ))}
        </div>

        <div className="reveal-actions">
          <Link className="btn btn-primary" href="/forge" onClick={beginClose}>
            {pick("去合成 Loom", "Forge a Loom")}
          </Link>
          <button type="button" className="btn btn-ghost" onClick={beginClose}>
            {pick("继续铸造", "Keep minting")}
          </button>
        </div>

        <p className="reveal-hint">{pick("几秒后自动关闭 · 按 Esc 关闭", "Closes automatically · Esc to dismiss")}</p>
        <span className="reveal-progress" style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }} aria-hidden="true" />
      </div>
    </div>
  );
}
