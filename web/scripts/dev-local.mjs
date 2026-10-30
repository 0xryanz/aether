#!/usr/bin/env node
/**
 * One-command local devnet for Aether Forge.
 *
 * Usage:
 *   pnpm dev:local
 *   pnpm dev:local --fund 0xYourWallet --fund-amount 1000   # also fund a wallet
 *
 * Starts (or resets) anvil, deploys the contracts, seeds a demo scenario with
 * Looms, referrals, claims and market bids, writes web/.env.local, then starts
 * Next.js. The seeded wallet is anvil account #0.
 */
import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseEther,
  parseUnits,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(HERE, "..");
const ROOT_DIR = resolve(WEB_DIR, "..");
const CONTRACTS_DIR = join(ROOT_DIR, "contracts");
const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const SERVE = !process.argv.includes("--no-serve");

/** Read `--name value` / `--name=value` from argv, falling back to an env var. */
function optionValue(name, envName) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  const prefix = `${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : process.env[envName];
}

// Optional: send real ETH to a wallet that is not one of the anvil accounts
// (e.g. the MetaMask account you test with), so it has gas on the local chain.
const FUND_INPUT = optionValue("--fund", "FUND_ADDRESS");
const FUND_AMOUNT = optionValue("--fund-amount", "FUND_AMOUNT") ?? "1000";
let fundTarget = null;
if (FUND_INPUT) {
  if (!isAddress(FUND_INPUT, { strict: false })) fail(`invalid --fund address: ${FUND_INPUT}`);
  fundTarget = getAddress(FUND_INPUT);
  try {
    parseEther(FUND_AMOUNT);
  } catch {
    fail(`invalid --fund-amount: ${FUND_AMOUNT} (expected a decimal ETH amount, e.g. 1000)`);
  }
}

const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
];

const erc20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);
const registryAbi = parseAbi(["function selfRegister(bytes32 agentId)"]);
const relicAbi = parseAbi([
  "function approve(address to, uint256 tokenId)",
  "function mintWithUSDT(uint256 quantity)",
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
]);
const forgeAbi = parseAbi([
  "function forge(uint256[] relicIds) returns (uint256)",
  "function bindReferrer(address referrer)",
  "function claim(uint256[] loomIds) returns (uint256)",
  "function claimReferral() returns (uint256)",
  "function validInvites(address referrer) view returns (uint256)",
]);
const loomAbi = parseAbi(["function nextTokenId() view returns (uint256)"]);
const marketAbi = parseAbi(["function createOrder(address collection, uint256 tokenId, uint256 price) returns (uint256)"]);

const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC), pollingInterval: 100 });

// Foundry is often installed by foundryup into ~/.foundry/bin, which may not be
// on the PATH inherited by this script (e.g. when started from an IDE).
const FOUNDRY_FALLBACK_DIRS = [join(homedir(), ".foundry", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];

function findBinary(name) {
  const dirs = [...(process.env.PATH ?? "").split(":"), ...FOUNDRY_FALLBACK_DIRS].filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

const ANVIL_BIN = findBinary("anvil");
const FORGE_BIN = findBinary("forge");

function missingBinary(name) {
  fail(`${name} not found. Install Foundry (https://getfoundry.sh) or add ~/.foundry/bin to PATH.`);
}

function log(message) {
  console.log(`\x1b[38;5;215m[aether]\x1b[0m ${message}`);
}

function fail(message) {
  console.error(`\x1b[31m[aether] ${message}\x1b[0m`);
  process.exit(1);
}

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function waitForRpc() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await rpc("eth_chainId");
      return true;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    }
  }
  return false;
}

async function ensureAnvil() {
  let up = await waitForRpc();
  if (up) {
    log("anvil already running — resetting to a clean chain");
    await rpc("anvil_reset");
    return null;
  }

  log(`starting anvil on ${RPC}`);
  if (!ANVIL_BIN) missingBinary("anvil");
  const child = spawn(ANVIL_BIN, ["--silent", "--port", "8545"], { detached: true, stdio: "ignore" });
  child.unref();
  up = await waitForRpc();
  if (!up) fail("anvil did not start. Is Foundry installed and on PATH?");
  return child;
}

function deploy() {
  log("deploying contracts");
  if (!FORGE_BIN) missingBinary("forge");
  const result = spawnSync(
    FORGE_BIN,
    ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", RPC, "--broadcast", "--with-gas-price", "10gwei"],
    {
      cwd: CONTRACTS_DIR,
      env: {
        ...process.env,
        PRIVATE_KEY: ANVIL_KEYS[0],
        MINING_START_DELAY: "600",
        ALLOW_SELF_REGISTRATION: "1",
        SALE_ACTIVE: "true",
      },
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    if (result.error) fail(`could not run forge: ${result.error.message}`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    fail("deployment failed");
  }

  const file = join(CONTRACTS_DIR, "deployments", "31337.json");
  if (!existsSync(file)) fail("deployment file missing");
  return JSON.parse(readFileSync(file, "utf8"));
}

function wallet(index) {
  return createWalletClient({
    account: privateKeyToAccount(ANVIL_KEYS[index]),
    chain: hardhat,
    transport: http(RPC),
  });
}

const accounts = ANVIL_KEYS.map((key) => privateKeyToAccount(key));

async function write(index, request) {
  const hash = await wallet(index).writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${request.functionName}`);
  return receipt;
}

/**
 * Send native ETH from an anvil account. This is a real transaction, unlike
 * anvil_setBalance, so wallets see a new block, an incoming transfer and a
 * refreshed balance.
 */
async function fund(index, to, amount) {
  log(`sending ${amount} ETH to ${to}`);
  const hash = await wallet(index).sendTransaction({ to, value: parseEther(amount) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Funding transaction reverted");
  return receipt;
}

async function increaseTime(seconds) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

async function read(request) {
  return publicClient.readContract(request);
}

async function main() {
  await ensureAnvil();
  const deployment = deploy();

  const multicallArtifact = join(CONTRACTS_DIR, "out", "Multicall3.sol", "Multicall3.json");
  if (existsSync(multicallArtifact)) {
    const artifact = JSON.parse(readFileSync(multicallArtifact, "utf8"));
    await rpc("anvil_setCode", [
      "0xcA11bde05977b3631167028862bE2a173976CA11",
      artifact.deployedBytecode.object,
    ]);
    log("installed Multicall3 for batched reads");
  }

  if (fundTarget) await fund(0, fundTarget, FUND_AMOUNT);

  const relic = deployment.relic;
  const forge = deployment.forge;
  const loom = deployment.loom;
  const market = deployment.market;
  const registry = deployment.registry;
  const usdt = deployment.usdt;

  const users = accounts.map((account) => account.address);
  log(`seeding demo with ${users.length} agents (${users[0]} is the demo wallet)`);

  // Fund everyone with mock USDT.
  for (let i = 0; i < users.length; i += 1) {
    await write(0, {
      address: usdt,
      abi: erc20,
      functionName: "mint",
      args: [users[i], parseUnits("20000", 18)],
    });
  }

  // Register agent identities (self-registration is enabled for local dev).
  for (let i = 0; i < users.length; i += 1) {
    await write(i, {
      address: registry,
      abi: registryAbi,
      functionName: "selfRegister",
      args: [keccak256(stringToHex(`agent${i}.aether.ai`))],
    });
  }

  // Account 0 is the referral hub: accounts 2 and 3 join through it.
  await write(2, { address: forge, abi: forgeAbi, functionName: "bindReferrer", args: [users[0]] });
  await write(3, { address: forge, abi: forgeAbi, functionName: "bindReferrer", args: [users[0]] });

  // Mint 4 Relics each (the per-agent cap).
  const startId = await read({ address: relic, abi: relicAbi, functionName: "nextTokenId" });
  for (let i = 0; i < users.length; i += 1) {
    await write(i, {
      address: usdt,
      abi: erc20,
      functionName: "approve",
      args: [relic, parseUnits("15", 18)],
    });
    await write(i, { address: relic, abi: relicAbi, functionName: "mintWithUSDT", args: [4n] });
  }

  // Start mining (deploy configured a 600s delay).
  await increaseTime(720);

  const endId = await read({ address: relic, abi: relicAbi, functionName: "nextTokenId" });
  const owners = new Map();
  for (let id = startId; id < endId; id += 1n) {
    const owner = await read({ address: relic, abi: relicAbi, functionName: "ownerOf", args: [id] });
    owners.set(id.toString(), owner);
  }
  const ownerIndex = new Map(users.map((address, index) => [address.toLowerCase(), index]));
  const used = new Set();

  async function gather(targetIndex, count) {
    const chosen = [];
    for (const [idText, owner] of owners) {
      if (chosen.length === count) break;
      const id = BigInt(idText);
      if (used.has(idText)) continue;
      if (owner.toLowerCase() !== users[targetIndex].toLowerCase()) {
        const source = ownerIndex.get(owner.toLowerCase());
        if (source === undefined) continue;
        await write(source, {
          address: relic,
          abi: relicAbi,
          functionName: "transferFrom",
          args: [owner, users[targetIndex], id],
        });
      }
      owners.set(idText, users[targetIndex]);
      used.add(idText);
      chosen.push(id);
    }
    if (chosen.length < count) throw new Error("not enough Relics to seed");
    return chosen;
  }

  async function forgeFor(index) {
    const ids = await gather(index, 10);
    await write(index, {
      address: relic,
      abi: relicAbi,
      functionName: "setApprovalForAll",
      args: [forge, true],
    });
    await write(index, { address: forge, abi: forgeAbi, functionName: "forge", args: [ids] });
    return (await read({ address: loom, abi: loomAbi, functionName: "nextTokenId" })) - 1n;
  }

  // Wave A: the demo wallet forges, then mines for six days and claims.
  const demoLoom = await forgeFor(0);
  await increaseTime(6 * 86400);
  await write(0, { address: forge, abi: forgeAbi, functionName: "claim", args: [[demoLoom]] });

  // Wave B: two invitees forge fresh Looms, so they still show a 2x boost.
  const inviteeLoomA = await forgeFor(2);
  const inviteeLoomB = await forgeFor(3);

  // Buy-side market: two live bids plus one premium Loom bid.
  await write(4, { address: usdt, abi: erc20, functionName: "approve", args: [market, parseUnits("500", 18)] });
  await write(4, {
    address: market,
    abi: marketAbi,
    functionName: "createOrder",
    args: [loom, 0n, parseUnits("120", 18)],
  });
  await write(5, { address: usdt, abi: erc20, functionName: "approve", args: [market, parseUnits("100", 18)] });
  await write(5, {
    address: market,
    abi: marketAbi,
    functionName: "createOrder",
    args: [relic, 0n, parseUnits("8", 18)],
  });

  // Sweep every spare Relic to the demo wallet so it can forge again in the UI.
  for (const [idText, owner] of owners) {
    if (used.has(idText)) continue;
    const id = BigInt(idText);
    if (owner.toLowerCase() !== users[0].toLowerCase()) {
      const source = ownerIndex.get(owner.toLowerCase());
      if (source === undefined) continue;
      await write(source, {
        address: relic,
        abi: relicAbi,
        functionName: "transferFrom",
        args: [owner, users[0], id],
      });
    }
    owners.set(idText, users[0]);
    used.add(idText);
  }

  await increaseTime(86400);

  // Invitee A claims, which credits the 8% referral to the demo wallet.
  await write(2, { address: forge, abi: forgeAbi, functionName: "claim", args: [[inviteeLoomA]] });
  await write(0, { address: forge, abi: forgeAbi, functionName: "claimReferral" });

  const validInvites = await read({
    address: forge,
    abi: forgeAbi,
    functionName: "validInvites",
    args: [users[0]],
  });

  writeFileSync(
    join(WEB_DIR, ".env.local"),
    `# Generated by web/scripts/dev-local.mjs — local anvil demo
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_AETHER_ADDRESS=${deployment.aether}
NEXT_PUBLIC_RELIC_ADDRESS=${deployment.relic}
NEXT_PUBLIC_LOOM_ADDRESS=${deployment.loom}
NEXT_PUBLIC_FORGE_ADDRESS=${deployment.forge}
NEXT_PUBLIC_MARKET_ADDRESS=${deployment.market}
NEXT_PUBLIC_REGISTRY_ADDRESS=${deployment.registry}
NEXT_PUBLIC_USDT_ADDRESS=${deployment.usdt}
NEXT_PUBLIC_USDT_DECIMALS=${deployment.usdtDecimals ?? 18}
NEXT_PUBLIC_DEPLOY_BLOCK=0
NEXT_PUBLIC_DEMO_FAUCET=1
NEXT_PUBLIC_SELF_REGISTER=1
NEXT_PUBLIC_RPC_URL=${RPC}
`,
  );

  log("demo ready");
  console.log("");
  console.log(`  demo wallet : ${users[0]}  (agent0.aether.ai, 1 Loom, ${validInvites} valid invites)`);
  console.log(`  invitee     : ${users[2]}  (2 Loom owner, boost x2)`);
  console.log(`  forge       : ${forge}`);
  console.log(`  market      : ${market}`);
  console.log(`  $AETHER     : ${deployment.aether}`);
  if (fundTarget) console.log(`  funded      : ${fundTarget}  (${FUND_AMOUNT} ETH)`);
  console.log("");
  console.log("  Import anvil account #0 into your wallet (private key in the Anvil docs).");
  console.log("  If your wallet needs a network: RPC " + RPC + ", chain id 31337.");

  if (!SERVE) {
    log("services are running in the background; start the site with: pnpm --dir web dev");
    return;
  }

  log("starting Next.js on http://localhost:3000");
  const child = spawn("pnpm", ["dev"], { cwd: WEB_DIR, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
