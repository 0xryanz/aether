import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function mint(address to, uint256 amount)",
]);

export const aetherAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function miningMinted() view returns (uint256)",
  "function miningRemaining() view returns (uint256)",
  "function MINING_SUPPLY() view returns (uint256)",
  "function TOTAL_SUPPLY() view returns (uint256)",
]);

export const registryAbi = parseAbi([
  "function agentIdOf(address account) view returns (bytes32)",
  "function isVerified(address account) view returns (bool)",
  "function selfRegistrationEnabled() view returns (bool)",
  "function selfRegister(bytes32 agentId)",
  "function register(address wallet, bytes32 agentId)",
]);

export const relicAbi = parseAbi([
  "function name() view returns (string)",
  "function mintWithUSDT(uint256 quantity)",
  "function mintWithBNB(uint256 quantity) payable",
  "function quoteUsd(bytes32 agentId, uint256 quantity) view returns (uint256)",
  "function quoteNative(bytes32 agentId, uint256 quantity) view returns (uint256)",
  "function toUsdtUnits(uint256 usdWad) view returns (uint256)",
  "function nextPriceUsd(bytes32 agentId) view returns (uint256)",
  "function mintedByAgent(bytes32 agentId) view returns (uint8)",
  "function perAgentCap() view returns (uint8)",
  "function saleActive() view returns (bool)",
  "function publicMinted() view returns (uint256)",
  "function publicRemaining() view returns (uint256)",
  "function teamMinted() view returns (uint256)",
  "function nextTokenId() view returns (uint256)",
  "function bnbPriceUsd() view returns (uint256)",
  "function usdtDecimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function approve(address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "event RelicMinted(uint256 indexed tokenId, address indexed to, bytes32 indexed agentId, uint256 priceUsdWad, uint8 agentMintIndex, bool paidWithNative)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const loomAbi = parseAbi([
  "function name() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function forgeTime(uint256 tokenId) view returns (uint64)",
  "function currentWeight(uint256 tokenId) view returns (uint256)",
  "function weightAt(uint256 tokenId, uint256 timestamp) view returns (uint256)",
  "function fullWeightAt(uint256 tokenId) view returns (uint64)",
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function WEIGHT_ONE() view returns (uint256)",
  "function WEIGHT_BOOST_TIER_ONE() view returns (uint256)",
  "function WEIGHT_BOOST_TIER_TWO() view returns (uint256)",
  "function BOOST_TIER_ONE_DURATION() view returns (uint64)",
  "function BOOST_TIER_TWO_DURATION() view returns (uint64)",
  "event LoomForged(uint256 indexed tokenId, address indexed owner, uint64 forgeTime)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const forgeAbi = parseAbi([
  "function pending(uint256 loomId) view returns (uint256)",
  "function pendingForWallet(address account) view returns (uint256)",
  "function walletWeight(address account) view returns (uint256)",
  "function claim(uint256[] loomIds) returns (uint256)",
  "function claimReferral() returns (uint256)",
  "function bindReferrer(address referrer)",
  "function referrerOf(address account) view returns (address)",
  "function inviteValid(address account) view returns (bool)",
  "function validInvites(address referrer) view returns (uint256)",
  "function referralClaimable(address referrer) view returns (uint256)",
  "function referralEarned(address referrer) view returns (uint256)",
  "function totalReferralMinted(address referrer) view returns (uint256)",
  "function minedBy(address account) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function accPerWeight() view returns (uint256)",
  "function emittedFromSchedule() view returns (uint256)",
  "function scheduledEmission() view returns (uint256)",
  "function miningStart() view returns (uint64)",
  "function miningEnd() view returns (uint64)",
  "function referralShareBps() view returns (uint16)",
  "function forgingActive() view returns (bool)",
  "function claimingActive() view returns (bool)",
  "function forge(uint256[] relicIds) returns (uint256)",
  "function sync()",
  "function stats() view returns (uint256 weight, uint256 acc, uint256 emitted, uint256 scheduled, uint64 start, uint64 end)",
  "function stageCount() view returns (uint256)",
  "function rateAt(uint256 timestamp) view returns (uint256)",
  "function lastClaim(uint256 loomId) view returns (uint64)",
  "function FREE_INVITE_REWARDS() view returns (uint256)",
  "event LoomForged(address indexed owner, uint256[] relicIds, uint256 indexed loomId, uint64 timestamp)",
  "event Claimed(address indexed user, uint256 amount, uint256 referralAmount)",
  "event ReferralClaimed(address indexed referrer, uint256 amount)",
  "event InviteActivated(address indexed referrer, address indexed invitee, uint256 validCount)",
  "event ReferrerBound(address indexed invitee, address indexed referrer)",
]);

export const marketAbi = parseAbi([
  "function orderCount() view returns (uint256)",
  "function orderAt(uint256 orderId) view returns (address buyer, address collection, uint256 tokenId, uint256 price, uint64 createdAt, bool active)",
  "function ordersOf(address buyer) view returns (uint256[])",
  "function createOrder(address collection, uint256 tokenId, uint256 price) returns (uint256)",
  "function cancelOrder(uint256 orderId)",
  "function fillOrder(uint256 orderId, uint256 tokenId)",
  "function feeBps() view returns (uint16)",
  "function usdt() view returns (address)",
  "event OrderCreated(uint256 indexed orderId, address indexed buyer, address indexed collection, uint256 tokenId, uint256 price)",
  "event OrderCancelled(uint256 indexed orderId, address indexed buyer)",
  "event OrderFilled(uint256 indexed orderId, address indexed seller, address indexed buyer, address collection, uint256 tokenId, uint256 price, uint256 fee)",
]);

export const claimedEvent = parseAbi([
  "event Claimed(address indexed user, uint256 amount, uint256 referralAmount)",
])[0];

export const loomTransferEvent = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
])[0];
