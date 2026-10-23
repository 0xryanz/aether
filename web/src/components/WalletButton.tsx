"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { useI18n, useMounted } from "@/lib/i18n";
import { cx, shortAddress } from "@/lib/format";
import { activeChain, chains } from "@/lib/wagmi";
import { useSwitchToAppChain } from "@/hooks/useSwitchToAppChain";

export function WalletButton() {
  const { address: connectedAddress, status: connectionStatus, chainId: connectedChainId } = useAccount();
  const mounted = useMounted();
  const address = mounted ? connectedAddress : undefined;
  const status = mounted ? connectionStatus : "disconnected";
  const chainId = mounted ? connectedChainId : undefined;
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchToAppChain, isSwitching: switching } = useSwitchToAppChain();
  const { data: balance } = useBalance({
    address,
    chainId: activeChain.id,
    query: { enabled: Boolean(address) },
  });
  const { pick } = useI18n();
  const walletOptions = useMemo(() => {
    const injected = connectors.filter((connector) => connector.type === "injected");
    const named = injected.filter((connector) => connector.id !== "injected");
    const source = named.length > 0 ? named : injected;
    const seen = new Set<string>();
    return source.filter((connector) => {
      if (seen.has(connector.id)) return false;
      seen.add(connector.id);
      return true;
    });
  }, [connectors]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const wrongNetwork = Boolean(address) && chainId !== activeChain.id;
  const walletChainName =
    chains.find((chain) => chain.id === chainId)?.name ?? (chainId ? `Chain ${chainId}` : activeChain.name);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="wallet-wrap" ref={ref}>
      {status === "connected" && address ? (
        <button
          type="button"
          className={cx("wallet-btn", wrongNetwork && "warn")}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="dot" />
          {wrongNetwork ? pick("网络错误", "Wrong network") : shortAddress(address)}
        </button>
      ) : (
        <button
          type="button"
          className="wallet-btn"
          onClick={() => setOpen((value) => !value)}
          disabled={isPending}
        >
          {isPending ? pick("连接中…", "Connecting…") : pick("连接钱包", "Connect")}
        </button>
      )}

      {open && (
        <div className="wallet-panel">
          {status === "connected" && address ? (
            <>
              <div className="wallet-panel-head">
                <span className="mono">{shortAddress(address, 6)}</span>
                <span className={cx("tag", wrongNetwork && "warn")}>{walletChainName}</span>
              </div>
              {wrongNetwork ? (
                <p className="wallet-warn">
                  {pick(
                    `钱包网络不对。网站读取的是 ${activeChain.name} 上的余额，请切换后继续。`,
                    `Wrong network. The site reads balances on ${activeChain.name} — switch to continue.`,
                  )}
                </p>
              ) : (
                balance && (
                  <div className="wallet-balance">
                    {Number(balance.formatted).toFixed(4)} {balance.symbol}
                    <span className="wallet-balance-chain"> · {activeChain.name}</span>
                  </div>
                )
              )}
              {wrongNetwork && (
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={switching}
                  onClick={() => switchToAppChain()}
                >
                  {switching ? pick("切换中…", "Switching…") : pick(`切换到 ${activeChain.name}`, `Switch to ${activeChain.name}`)}
                </button>
              )}
              <button type="button" className="panel-row" onClick={copyAddress}>
                <span>{pick("复制地址", "Copy address")}</span>
                <span className="muted">{copied ? pick("已复制", "Copied") : "⧉"}</span>
              </button>
              <button type="button" className="panel-row danger" onClick={() => { disconnect(); setOpen(false); }}>
                {pick("断开连接", "Disconnect")}
              </button>
            </>
          ) : (
            <>
              <p className="wallet-panel-title">{pick("选择钱包", "Select a wallet")}</p>
              <p className="wallet-panel-note">
                {pick(
                  "支持币安 Agentic Wallet、MetaMask 等浏览器钱包。",
                  "Works with Binance Agentic Wallet, MetaMask and other browser wallets.",
                )}
              </p>

              {walletOptions.length === 0 ? (
                <div className="wallet-empty">
                  <p>{pick("没有检测到钱包扩展。", "No wallet extension detected.")}</p>
                  <div className="row">
                    <a className="wallet-install" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                      MetaMask ↗
                    </a>
                    <a className="wallet-install" href="https://www.binance.com/en/web3wallet" target="_blank" rel="noreferrer">
                      {pick("币安钱包", "Binance Wallet")} ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div className="wallet-list">
                  {walletOptions.map((connector) => {
                    const isGeneric = connector.id === "injected";
                    const label = isGeneric ? pick("浏览器钱包", "Browser wallet") : connector.name;
                    return (
                      <button
                        key={connector.uid}
                        type="button"
                        className="wallet-option"
                        disabled={isPending}
                        onClick={() => {
                          connect({ connector });
                          setOpen(false);
                        }}
                      >
                        <span className="wallet-option-icon">
                          {connector.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={connector.icon} alt="" />
                          ) : (
                            "◇"
                          )}
                        </span>
                        <span className="wallet-option-name">{label}</span>
                        <span className="wallet-option-tag">{pick("已检测", "Detected")}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {isPending && <p className="wallet-panel-fine">{pick("请在钱包中确认…", "Confirm in your wallet…")}</p>}
              {error && <p className="form-error">{error.message.split("\n")[0]}</p>}
              <p className="wallet-panel-fine">
                {pick("仅签名，不托管资产。", "Non-custodial. You only sign transactions.")}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
