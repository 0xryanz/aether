"use client";

import type { CSSProperties } from "react";
import { boostTier, cx, formatCountdown } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Tier = 2 | 1.5 | 1;

const RELIC_ASPECTS = [
  { core: "#ff8a5c", light: "#ffd3b4", edge: "#ffe4cf" },
  { core: "#f3c48b", light: "#ffe8c9", edge: "#fff3e0" },
  { core: "#a78bfa", light: "#ded3ff", edge: "#efe9ff" },
] as const;

const TIER_ACCENT: Record<string, string> = {
  "2": "#ff8a5c",
  "1.5": "#b49bff",
  "1": "#f3c48b",
};

function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/** Round computed coordinates so SSR and client serialise identical strings. */
function fixed(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

/**
 * Procedural Relic artwork. The token id picks the colour aspect and the
 * sparkle layout, so every Relic looks slightly different without shipping
 * image assets for each token.
 */
export function RelicArt({ id }: { id: number }) {
  const seed = Math.abs(Math.trunc(id)) + 1;
  const aspect = RELIC_ASPECTS[seed % RELIC_ASPECTS.length];
  const uid = `relic-${seed}`;
  const stars = Array.from({ length: 9 }, (_, index) => {
    const angle = noise(seed * 7 + index * 3) * Math.PI * 2;
    const radius = 44 + noise(seed * 13 + index * 5) * 58;
    return {
      x: fixed(100 + Math.cos(angle) * radius),
      y: fixed(116 + Math.sin(angle) * radius * 0.92),
      r: fixed(0.5 + noise(seed * 3 + index * 11) * 0.9),
      opacity: fixed(0.12 + noise(seed * 5 + index * 17) * 0.4),
    };
  });

  return (
    <svg viewBox="0 0 200 240" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="46%" r="52%">
          <stop offset="0%" stopColor={aspect.core} stopOpacity="0.42" />
          <stop offset="52%" stopColor={aspect.core} stopOpacity="0.1" />
          <stop offset="100%" stopColor={aspect.core} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={aspect.light} stopOpacity="0.95" />
          <stop offset="100%" stopColor={aspect.core} stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${uid}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={aspect.core} stopOpacity="0.6" />
          <stop offset="100%" stopColor="#120c18" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${uid}-c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={aspect.core} stopOpacity="0.7" />
          <stop offset="100%" stopColor={aspect.core} stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={`${uid}-d`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1224" stopOpacity="0.95" />
          <stop offset="48%" stopColor={aspect.core} stopOpacity="0.5" />
          <stop offset="100%" stopColor={aspect.core} stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={aspect.core} stopOpacity="0" />
          <stop offset="50%" stopColor={aspect.edge} stopOpacity="0.7" />
          <stop offset="100%" stopColor={aspect.core} stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-blur`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <circle cx="100" cy="118" r="92" fill={`url(#${uid}-aura)`} />
      <circle cx="100" cy="110" r="30" fill={aspect.core} opacity="0.2" filter={`url(#${uid}-blur)`} />

      {stars.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.r} fill={aspect.edge} opacity={star.opacity} />
      ))}

      <ellipse cx="100" cy="208" rx="52" ry="14" fill={aspect.core} opacity="0.16" filter={`url(#${uid}-blur)`} />
      <ellipse cx="100" cy="207" rx="46" ry="9" fill="none" stroke={`url(#${uid}-base)`} strokeWidth="1" />
      <ellipse cx="100" cy="207" rx="26" ry="5" fill="none" stroke={aspect.edge} strokeWidth="0.6" opacity="0.25" />

      <g stroke={aspect.edge} strokeWidth="0.7" strokeLinejoin="round">
        <polygon points="100,24 52,112 100,112" fill={`url(#${uid}-a)`} />
        <polygon points="100,24 148,112 100,112" fill={`url(#${uid}-b)`} />
        <polygon points="52,112 100,112 100,208" fill={`url(#${uid}-c)`} />
        <polygon points="148,112 100,112 100,208" fill={`url(#${uid}-d)`} />
        <polygon points="100,24 77,76 100,112" fill="#ffffff" opacity="0.1" stroke="none" />
        <polygon points="100,112 126,154 100,208" fill="#ffffff" opacity="0.05" stroke="none" />
      </g>

      <path d="M52 112 L100 112 L148 112" stroke={aspect.edge} strokeWidth="0.8" opacity="0.45" fill="none" />
      <path d="M100 24 L100 208" stroke={aspect.edge} strokeWidth="0.7" opacity="0.32" fill="none" />

      <g fill="none" stroke={aspect.edge} strokeWidth="0.8" opacity="0.72">
        <path d="M100 78 L114 106 L100 140 L86 106 Z" />
        <circle cx="100" cy="106" r="2" fill={aspect.edge} stroke="none" />
      </g>

      <g className="relic-shard" fill={aspect.edge} opacity="0.28">
        <polygon points="40,70 46,96 36,102" />
        <polygon points="164,60 170,84 158,90" />
      </g>

      <g fill={aspect.edge}>
        <path d="M100 4 l2.4 6.6 6.6 2.4 -6.6 2.4 -2.4 6.6 -2.4 -6.6 -6.6 -2.4 6.6 -2.4 Z" opacity="0.7" />
      </g>
    </svg>
  );
}

/**
 * Procedural Loom artwork: an astrolabe-like machine whose orbit speed and
 * accent colour depend on the current boost tier.
 */
export function LoomArt({ id, tier = 2 }: { id: number; tier?: Tier }) {
  const accent = TIER_ACCENT[String(tier)] ?? TIER_ACCENT["2"];
  const uid = `loom-${Math.abs(Math.trunc(id))}-${String(tier).replace(".", "-")}`;
  const ticks = Array.from({ length: 36 }, (_, index) => {
    const angle = (index / 36) * Math.PI * 2;
    const outer = index % 3 === 0 ? 84 : 81;
    return {
      x1: fixed(100 + Math.cos(angle) * 75),
      y1: fixed(100 + Math.sin(angle) * 75),
      x2: fixed(100 + Math.cos(angle) * outer),
      y2: fixed(100 + Math.sin(angle) * outer),
      opacity: index % 3 === 0 ? 0.55 : 0.22,
    };
  });
  const spokes = Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    return {
      x1: fixed(100 + Math.cos(angle) * 28),
      y1: fixed(100 + Math.sin(angle) * 28),
      x2: fixed(100 + Math.cos(angle) * 62),
      y2: fixed(100 + Math.sin(angle) * 62),
    };
  });
  const orbits = [0.6, 2.7, 4.5].map((ratio) => {
    const angle = ratio * Math.PI;
    return { x: fixed(100 + Math.cos(angle) * 84), y: fixed(100 + Math.sin(angle) * 84) };
  });

  return (
    <svg viewBox="0 0 200 200" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="52%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.34" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.08" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-core`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1de" />
          <stop offset="45%" stopColor={accent} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.1" />
        </linearGradient>
        <filter id={`${uid}-blur`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <circle cx="100" cy="100" r="96" fill={`url(#${uid}-aura)`} />
      <circle cx="100" cy="100" r="34" fill={accent} opacity="0.14" filter={`url(#${uid}-blur)`} />

      <g className="loom-orbit" stroke={accent} fill="none">
        <circle cx="100" cy="100" r="88" strokeWidth="0.8" strokeDasharray="1.5 7" opacity="0.5" />
        {ticks.map((tick, index) => (
          <line
            key={index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            strokeWidth={index % 3 === 0 ? 1 : 0.6}
            opacity={tick.opacity}
          />
        ))}
      </g>

      <circle cx="100" cy="100" r="70" stroke={`url(#${uid}-ring)`} strokeWidth="0.9" fill="none" opacity="0.7" />
      <circle cx="100" cy="100" r="52" stroke={accent} strokeWidth="0.6" fill="none" opacity="0.2" strokeDasharray="2 5" />

      <g stroke={accent} strokeWidth="0.7" opacity="0.3">
        {spokes.map((spoke, index) => (
          <line key={index} x1={spoke.x1} y1={spoke.y1} x2={spoke.x2} y2={spoke.y2} />
        ))}
      </g>

      <g className="loom-threads" fill="none" stroke={accent} strokeWidth="0.8">
        <path d="M46 100 C72 68 128 132 154 100" opacity="0.5" />
        <path d="M54 120 C80 92 120 148 146 120" opacity="0.32" />
        <path d="M54 80 C80 108 120 52 146 80" opacity="0.32" />
      </g>

      {orbits.map((orbit, index) => (
        <circle key={index} cx={orbit.x} cy={orbit.y} r={index === 1 ? 2.6 : 1.8} fill={accent} opacity="0.85" />
      ))}

      <g className="loom-core">
        <path d="M100 66 L124 100 L100 134 L76 100 Z" fill={`url(#${uid}-core)`} stroke={accent} strokeWidth="0.9" />
        <path d="M100 80 L113 100 L100 120 L87 100 Z" fill="#0a0710" opacity="0.6" />
        <circle cx="100" cy="100" r="3" fill="#fff3e2" />
      </g>
    </svg>
  );
}

export function RelicCard({
  id,
  selected = false,
  onClick,
  className,
}: {
  id: bigint;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const { pick } = useI18n();
  const label = `Relic #${id.toString()}`;

  const content = (
    <>
      <span className="nft-frame">
        <RelicArt id={Number(id)} />
        <span className="nft-serial">#{id.toString()}</span>
        {selected && (
          <span className="nft-check" aria-hidden="true">
            ✓
          </span>
        )}
        <span className="nft-sheen" aria-hidden="true" />
      </span>
      <span className="nft-info">
        <span className="nft-line">
          <span className="nft-name">Relic</span>
          <span className="nft-kind">{pick("合成材料", "FORGE MATERIAL")}</span>
        </span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cx("nft-card", "nft-relic", selected && "is-selected", className)}
        onClick={onClick}
        aria-pressed={selected}
        aria-label={label}
      >
        {content}
      </button>
    );
  }

  return (
    <article className={cx("nft-card", "nft-relic", className)} aria-label={label}>
      {content}
    </article>
  );
}

export function LoomCard({
  id,
  forgeTime,
  now,
  className,
}: {
  id: bigint;
  forgeTime: number;
  now: number;
  className?: string;
}) {
  const { pick } = useI18n();
  const tier = boostTier(forgeTime, now);
  const phaseSeconds = 5 * 86400;
  const left = tier === 1 ? 0 : Math.max(0, forgeTime + (tier === 2 ? phaseSeconds : 2 * phaseSeconds) - now);
  const remainingPct = tier === 1 ? 100 : Math.min(100, (left / phaseSeconds) * 100);
  const tierClass = `tier-${String(tier).replace(".", "-")}`;
  const style = { "--nft-accent": TIER_ACCENT[String(tier)] } as CSSProperties;

  return (
    <article className={cx("nft-card", "nft-loom", tierClass, className)} style={style} aria-label={`Loom #${id.toString()}`}>
      <span className="nft-frame">
        <LoomArt id={Number(id)} tier={tier} />
        <span className="nft-serial">#{id.toString()}</span>
        <span className="nft-tierbadge">×{tier}</span>
        <span className="nft-sheen" aria-hidden="true" />
      </span>
      <span className="nft-info">
        <span className="nft-line">
          <span className="nft-name">Loom</span>
          <span className="nft-live">
            <i />
            {pick("挖矿中", "MINING")}
          </span>
        </span>
        <span className="nft-stats">
          <span>
            <em>{pick("权重", "WEIGHT")}</em>
            <b>×{tier}</b>
          </span>
          <span>
            <em>{tier === 1 ? pick("状态", "STATUS") : pick("加速剩余", "BOOST LEFT")}</em>
            <b>{tier === 1 ? pick("基础", "BASE") : formatCountdown(left)}</b>
          </span>
        </span>
        <span className="nft-bar">
          <span style={{ width: `${remainingPct}%` }} />
        </span>
      </span>
    </article>
  );
}

/** Small collection marker used inside the order tables. */
export function TokenTile({ kind }: { kind: "relic" | "loom" }) {
  return (
    <span className={cx("token-tile", `token-tile-${kind}`)} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        {kind === "relic" ? (
          <path d="M12 3.5 20 12 12 20.5 4 12Z" stroke="currentColor" strokeWidth="1.1" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="0.9" strokeDasharray="1.5 2.6" />
            <path d="M12 6.5 17 12 12 17.5 7 12Z" stroke="currentColor" strokeWidth="1.1" />
          </>
        )}
      </svg>
    </span>
  );
}
