// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title LoomNFT
/// @notice The mining machine of Aether Forge. One Loom is forged by burning 10
///         Relics. Weight starts at 2x for the first 5 days, 1.5x for days 6-10
///         and 1x afterwards; mining weight always follows the current holder.
contract LoomNFT is ERC721Enumerable, Ownable2Step {
    using Strings for uint256;

    uint256 public constant WEIGHT_ONE = 1 ether;
    uint256 public constant WEIGHT_BOOST_TIER_ONE = 2 ether;
    uint256 public constant WEIGHT_BOOST_TIER_TWO = 1.5 ether;

    uint64 public constant BOOST_TIER_ONE_DURATION = 5 days;
    uint64 public constant BOOST_TIER_TWO_DURATION = 10 days;

    address public forge;
    uint256 public nextTokenId = 1;

    mapping(uint256 => uint64) public forgeTime;

    string private _baseTokenURI;

    event ForgeSet(address indexed forge);
    event LoomForged(uint256 indexed tokenId, address indexed owner, uint64 forgeTime);

    error NotForge();
    error ForgeAlreadySet();

    constructor(address initialOwner) ERC721("Aether Loom", "LOOM") Ownable(initialOwner) {}

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    /// @notice Mint a new Loom to `to`. Called by the Forge after burning 10 Relics.
    function mint(address to) external onlyForge returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        forgeTime[tokenId] = uint64(block.timestamp);
        _safeMint(to, tokenId);
        emit LoomForged(tokenId, to, uint64(block.timestamp));
    }

    /// @notice Effective mining weight of a Loom at a given timestamp.
    function weightAt(uint256 tokenId, uint256 timestamp) public view returns (uint256) {
        uint64 forged = forgeTime[tokenId];
        if (forged == 0 || timestamp < forged) return 0;
        uint256 elapsed = timestamp - forged;
        if (elapsed < BOOST_TIER_ONE_DURATION) return WEIGHT_BOOST_TIER_ONE;
        if (elapsed < BOOST_TIER_TWO_DURATION) return WEIGHT_BOOST_TIER_TWO;
        return WEIGHT_ONE;
    }

    /// @notice Weight of a Loom right now.
    function currentWeight(uint256 tokenId) external view returns (uint256) {
        return weightAt(tokenId, block.timestamp);
    }

    /// @notice Unix time at which the Loom drops to 1x weight.
    function fullWeightAt(uint256 tokenId) external view returns (uint64) {
        uint64 forged = forgeTime[tokenId];
        return forged == 0 ? 0 : forged + BOOST_TIER_TWO_DURATION;
    }

    function setForge(address forge_) external onlyOwner {
        if (forge != address(0)) revert ForgeAlreadySet();
        require(forge_ != address(0), "forge=0");
        forge = forge_;
        emit ForgeSet(forge_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    modifier onlyForge() {
        if (msg.sender != forge) revert NotForge();
        _;
    }
}
