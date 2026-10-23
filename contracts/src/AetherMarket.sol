// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AetherMarket
/// @notice Buy-side-only order book (the Ptah model). Buyers post USDT bids and
///         escrow the funds; sellers pick a bid and deliver the NFT. A 1% fee is
///         charged on every fill and paid to the treasury.
///
///         A bid targets a collection (`Relic` or `Loom`) and optionally a
///         specific tokenId. `tokenId == 0` means "any token in the collection".
contract AetherMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 500;

    struct Order {
        address buyer;
        address collection;
        uint256 tokenId;
        uint256 price;
        uint64 createdAt;
        bool active;
    }

    IERC20 public immutable usdt;
    address public feeRecipient;
    uint16 public feeBps = 100; // 1%

    mapping(address => bool) public allowedCollection;
    Order[] private _orders;
    mapping(address => uint256[]) private _ordersOf;

    event CollectionAllowed(address indexed collection, bool allowed);
    event FeeSet(uint16 bps);
    event FeeRecipientSet(address indexed recipient);
    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed collection,
        uint256 tokenId,
        uint256 price
    );
    event OrderCancelled(uint256 indexed orderId, address indexed buyer);
    event OrderFilled(
        uint256 indexed orderId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        uint256 price,
        uint256 fee
    );

    error CollectionNotAllowed();
    error InvalidPrice();
    error NotBuyer();
    error OrderNotActive();
    error TokenMismatch();
    error InvalidFee();

    constructor(address usdt_, address feeRecipient_, address initialOwner) Ownable(initialOwner) {
        require(usdt_ != address(0) && feeRecipient_ != address(0), "zero address");
        usdt = IERC20(usdt_);
        feeRecipient = feeRecipient_;
    }

    // ---------------------------------------------------------------------
    // Buy orders
    // ---------------------------------------------------------------------

    /// @notice Post a bid. `price` is denominated in USDT base units and is
    ///         escrowed until the order is filled or cancelled.
    function createOrder(address collection, uint256 tokenId, uint256 price) external nonReentrant returns (uint256 orderId) {
        if (!allowedCollection[collection]) revert CollectionNotAllowed();
        if (price == 0) revert InvalidPrice();

        usdt.safeTransferFrom(msg.sender, address(this), price);

        orderId = _orders.length;
        _orders.push(
            Order({
                buyer: msg.sender,
                collection: collection,
                tokenId: tokenId,
                price: price,
                createdAt: uint64(block.timestamp),
                active: true
            })
        );
        _ordersOf[msg.sender].push(orderId);

        emit OrderCreated(orderId, msg.sender, collection, tokenId, price);
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.buyer != msg.sender) revert NotBuyer();
        if (!order.active) revert OrderNotActive();

        order.active = false;
        usdt.safeTransfer(order.buyer, order.price);
        emit OrderCancelled(orderId, msg.sender);
    }

    /// @notice Accept a bid by transferring `tokenId` to the buyer.
    ///         Caller must own the token and approve this market.
    function fillOrder(uint256 orderId, uint256 tokenId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (!order.active) revert OrderNotActive();
        if (order.tokenId != 0 && order.tokenId != tokenId) revert TokenMismatch();
        if (IERC721(order.collection).ownerOf(tokenId) != msg.sender) revert TokenMismatch();

        order.active = false;

        uint256 fee = (order.price * feeBps) / BPS;
        uint256 proceeds = order.price - fee;

        usdt.safeTransfer(msg.sender, proceeds);
        if (fee != 0) usdt.safeTransfer(feeRecipient, fee);
        IERC721(order.collection).transferFrom(msg.sender, order.buyer, tokenId);

        emit OrderFilled(orderId, msg.sender, order.buyer, order.collection, tokenId, order.price, fee);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function orderCount() external view returns (uint256) {
        return _orders.length;
    }

    function orderAt(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function ordersOf(address buyer) external view returns (uint256[] memory) {
        return _ordersOf[buyer];
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setCollection(address collection, bool allowed) external onlyOwner {
        require(collection != address(0), "collection=0");
        allowedCollection[collection] = allowed;
        emit CollectionAllowed(collection, allowed);
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidFee();
        feeBps = bps;
        emit FeeSet(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "recipient=0");
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }
}
