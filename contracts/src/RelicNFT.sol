// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IActivityHook} from "./interfaces/IActivityHook.sol";

/// @title RelicNFT
/// @notice Basic forge material. One wallet may mint up to 4 Relics per Binance
///         Agent ID: the first for 1 USDT, the following three for 4.5 USDT each.
///         10 Relics burn into one Loom.
contract RelicNFT is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 100_000;
    uint256 public constant PUBLIC_SUPPLY = 95_000;
    uint256 public constant TEAM_SUPPLY = 5_000;
    uint16 public constant LIQUIDITY_BPS = 8_000;
    uint16 public constant BPS = 10_000;

    IAgentRegistry public registry;
    IERC20 public immutable usdt;
    uint8 public immutable usdtDecimals;

    address public liquidity;
    address public treasury;
    /// @notice Forge contract: may burn Relics and mint team-reward Relics.
    address public forge;

    bool public saleActive;
    uint8 public perAgentCap = 4;

    uint256 public publicMinted;
    uint256 public teamMinted;
    uint256 public nextTokenId = 1;

    /// @notice Price of the n-th Relic per agent, denominated in USD with 18 decimals.
    uint256[4] public pricesUsd;
    /// @notice BNB/USD price with 18 decimals, used for native payments.
    uint256 public bnbPriceUsd;

    mapping(bytes32 => uint8) public mintedByAgent;

    string private _baseTokenURI;

    event SaleActiveSet(bool active);
    event PricesSet(uint256[4] prices);
    event BnbPriceSet(uint256 priceUsdWad);
    event ForgeSet(address indexed forge);
    event LiquiditySet(address indexed liquidity);
    event TreasurySet(address indexed treasury);
    event RelicMinted(
        uint256 indexed tokenId,
        address indexed to,
        bytes32 indexed agentId,
        uint256 priceUsdWad,
        uint8 agentMintIndex,
        bool paidWithNative
    );
    event TeamRelicMinted(uint256 indexed tokenId, address indexed to);

    error SaleNotActive();
    error InvalidQuantity();
    error AgentNotVerified();
    error AgentCapReached();
    error SupplyExhausted();
    error NotForge();
    error NotTokenOwnerOrApproved();
    error InsufficientPayment();
    error TeamSupplyExhausted();
    error InvalidPrice();

    constructor(
        address usdt_,
        uint8 usdtDecimals_,
        address registry_,
        address liquidity_,
        address treasury_,
        address initialOwner
    ) ERC721("Aether Relic", "RELIC") Ownable(initialOwner) {
        require(usdt_ != address(0), "usdt=0");
        require(registry_ != address(0), "registry=0");
        require(liquidity_ != address(0), "liquidity=0");
        require(treasury_ != address(0), "treasury=0");
        usdt = IERC20(usdt_);
        usdtDecimals = usdtDecimals_;
        registry = IAgentRegistry(registry_);
        liquidity = liquidity_;
        treasury = treasury_;

        pricesUsd = [uint256(1 ether), 4.5 ether, 4.5 ether, 4.5 ether];
        bnbPriceUsd = 600 ether;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    function teamRemaining() external view returns (uint256) {
        return TEAM_SUPPLY - teamMinted;
    }

    function publicRemaining() external view returns (uint256) {
        return PUBLIC_SUPPLY - publicMinted;
    }

    /// @notice USD price of the next relic for an agent (18 decimals).
    function nextPriceUsd(bytes32 agentId) public view returns (uint256) {
        uint8 minted = mintedByAgent[agentId];
        if (minted >= perAgentCap) return 0;
        return pricesUsd[minted];
    }

    /// @notice USD cost for `quantity` relics for an agent (18 decimals).
    function quoteUsd(bytes32 agentId, uint256 quantity) public view returns (uint256 total) {
        uint8 minted = mintedByAgent[agentId];
        require(quantity > 0 && minted + quantity <= perAgentCap, "cap");
        for (uint256 i = 0; i < quantity; ++i) {
            total += pricesUsd[minted + i];
        }
    }

    /// @notice BNB (wei) required for `quantity` relics at the configured price.
    function quoteNative(bytes32 agentId, uint256 quantity) public view returns (uint256) {
        return (quoteUsd(agentId, quantity) * 1 ether) / bnbPriceUsd;
    }

    /// @notice USDT base units for a USD amount (18 decimals).
    function toUsdtUnits(uint256 usdWad) public view returns (uint256) {
        return (usdWad * (10 ** usdtDecimals)) / 1 ether;
    }

    // ---------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------

    function mintWithUSDT(uint256 quantity) external nonReentrant {
        if (!saleActive) revert SaleNotActive();
        bytes32 agentId = _requireAgent(msg.sender);
        (, uint256 usdCost) = _mintBatch(msg.sender, agentId, quantity, false);

        uint256 amount = toUsdtUnits(usdCost);
        uint256 toLiquidity = (amount * LIQUIDITY_BPS) / BPS;
        usdt.safeTransferFrom(msg.sender, liquidity, toLiquidity);
        usdt.safeTransferFrom(msg.sender, treasury, amount - toLiquidity);
    }

    function mintWithBNB(uint256 quantity) external payable nonReentrant {
        if (!saleActive) revert SaleNotActive();
        bytes32 agentId = _requireAgent(msg.sender);
        uint256 cost = quoteNative(agentId, quantity);
        if (msg.value < cost) revert InsufficientPayment();

        _mintBatch(msg.sender, agentId, quantity, true);

        uint256 toLiquidity = (cost * LIQUIDITY_BPS) / BPS;
        (bool okLiquidity, ) = liquidity.call{value: toLiquidity}("");
        require(okLiquidity, "liquidity transfer failed");
        (bool okTreasury, ) = treasury.call{value: cost - toLiquidity}("");
        require(okTreasury, "treasury transfer failed");

        if (msg.value > cost) {
            (bool refunded, ) = msg.sender.call{value: msg.value - cost}("");
            require(refunded, "refund failed");
        }
    }

    /// @notice Free Relic from the 5,000 team reserve. Used for invite rewards.
    function mintTeam(address to) external onlyForge returns (uint256 tokenId) {
        if (teamMinted + 1 > TEAM_SUPPLY) revert TeamSupplyExhausted();
        tokenId = nextTokenId++;
        teamMinted += 1;
        _safeMint(to, tokenId);
        emit TeamRelicMinted(tokenId, to);
    }

    /// @notice Burn a Relic as part of a Loom forge. Requires approval to Forge.
    function burnForForge(uint256 tokenId) external onlyForge {
        address owner = ownerOf(tokenId);
        if (!(owner == msg.sender || isApprovedForAll(owner, msg.sender) || getApproved(tokenId) == msg.sender)) {
            revert NotTokenOwnerOrApproved();
        }
        _burn(tokenId);
    }

    function _requireAgent(address account) private view returns (bytes32 agentId) {
        agentId = registry.agentIdOf(account);
        if (agentId == bytes32(0)) revert AgentNotVerified();
    }

    function _mintBatch(
        address to,
        bytes32 agentId,
        uint256 quantity,
        bool paidWithNative
    ) private returns (uint256 firstId, uint256 usdCost) {
        if (quantity == 0 || quantity > perAgentCap) revert InvalidQuantity();
        uint8 already = mintedByAgent[agentId];
        if (already + quantity > perAgentCap) revert AgentCapReached();
        if (publicMinted + quantity > PUBLIC_SUPPLY) revert SupplyExhausted();

        mintedByAgent[agentId] = already + uint8(quantity);
        publicMinted += quantity;

        firstId = nextTokenId;
        for (uint256 i = 0; i < quantity; ++i) {
            uint256 price = pricesUsd[already + i];
            usdCost += price;
            uint256 tokenId = nextTokenId++;
            _safeMint(to, tokenId);
            emit RelicMinted(tokenId, to, agentId, price, already + uint8(i), paidWithNative);
        }

        if (forge != address(0)) {
            try IActivityHook(forge).onActivity(to) {} catch {}
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setSaleActive(bool active) external onlyOwner {
        saleActive = active;
        emit SaleActiveSet(active);
    }

    function setPrices(uint256[4] calldata newPrices) external onlyOwner {
        require(publicMinted == 0, "sale started");
        for (uint256 i = 0; i < 4; ++i) {
            if (newPrices[i] == 0) revert InvalidPrice();
        }
        pricesUsd = newPrices;
        emit PricesSet(newPrices);
    }

    function setBnbPriceUsd(uint256 priceUsdWad) external onlyOwner {
        if (priceUsdWad == 0) revert InvalidPrice();
        bnbPriceUsd = priceUsdWad;
        emit BnbPriceSet(priceUsdWad);
    }

    function setPerAgentCap(uint8 newCap) external onlyOwner {
        require(newCap > 0 && newCap <= 4, "cap");
        perAgentCap = newCap;
    }

    function setForge(address forge_) external onlyOwner {
        require(forge == address(0), "forge set");
        require(forge_ != address(0), "forge=0");
        forge = forge_;
        emit ForgeSet(forge_);
    }

    function setLiquidity(address liquidity_) external onlyOwner {
        require(liquidity_ != address(0), "liquidity=0");
        liquidity = liquidity_;
        emit LiquiditySet(liquidity_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "treasury=0");
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function setRegistry(address registry_) external onlyOwner {
        require(registry_ != address(0), "registry=0");
        registry = IAgentRegistry(registry_);
    }

    function rescueERC20(address token, address to) external onlyOwner {
        require(token != address(usdt), "protected");
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }

    modifier onlyForge() {
        if (msg.sender != forge) revert NotForge();
        _;
    }
}
