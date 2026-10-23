"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cx } from "@/lib/format";
import { RuneMark } from "./RuneMark";
import { WalletButton } from "./WalletButton";

export function Header() {
  const pathname = usePathname();
  const { lang, setLang, pick } = useI18n();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/mint", label: pick("铸造 Relic", "Mint Relic") },
    { href: "/forge", label: pick("合成 Loom", "Forge Loom") },
    { href: "/dashboard", label: pick("我的熔炉", "Dashboard") },
    { href: "/market", label: pick("市场", "Market") },
    { href: "/leaderboard", label: pick("排行榜", "Leaderboard") },
  ];

  return (
    <header className="site-header">
      <div className="header-inner shell">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <RuneMark className="brand-mark" />
          <span className="brand-text">
            <strong>AETHER</strong>
            <small>FORGE</small>
          </span>
        </Link>

        <nav className="nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx("nav-link", pathname === link.href && "active")}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="nav-actions">
          <div className="lang-toggle" role="group" aria-label="Language">
            <button
              type="button"
              className={cx(lang === "zh" && "active")}
              onClick={() => setLang("zh")}
            >
              中
            </button>
            <button
              type="button"
              className={cx(lang === "en" && "active")}
              onClick={() => setLang("en")}
            >
              EN
            </button>
          </div>
          <WalletButton />
          <button
            type="button"
            className="menu-btn"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={cx("mobile-nav", open && "open")}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
