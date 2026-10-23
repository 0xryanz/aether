// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title AetherToken ($AETHER)
/// @notice Fixed-supply utility token for Aether Forge on BNB Chain.
/// @dev 55% of the supply is minted at deployment (liquidity / team / ecosystem /
///      treasury). The remaining 45% is the mining reserve and can only be minted
///      by the Forge contract, which enforces the emission schedule on top.
contract AetherToken is ERC20, ERC20Permit, Ownable2Step {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant MINING_SUPPLY = 450_000_000 ether;

    uint256 public constant LIQUIDITY_SUPPLY = 200_000_000 ether;
    uint256 public constant TEAM_SUPPLY = 150_000_000 ether;
    uint256 public constant ECOSYSTEM_SUPPLY = 100_000_000 ether;
    uint256 public constant TREASURY_SUPPLY = 100_000_000 ether;

    /// @notice Address allowed to mint from the mining reserve (the Forge).
    address public miningEngine;
    /// @notice Amount already minted from the mining reserve.
    uint256 public miningMinted;

    event MiningEngineSet(address indexed engine);

    error MiningEngineAlreadySet();
    error NotMiningEngine();
    error MiningCapExceeded();

    constructor(
        address liquidity,
        address teamVesting,
        address ecosystem,
        address treasury,
        address initialOwner
    ) ERC20("Aether", "AETHER") ERC20Permit("Aether") Ownable(initialOwner) {
        require(liquidity != address(0), "liquidity=0");
        require(teamVesting != address(0), "team=0");
        require(ecosystem != address(0), "ecosystem=0");
        require(treasury != address(0), "treasury=0");

        _mint(liquidity, LIQUIDITY_SUPPLY);
        _mint(teamVesting, TEAM_SUPPLY);
        _mint(ecosystem, ECOSYSTEM_SUPPLY);
        _mint(treasury, TREASURY_SUPPLY);
    }

    /// @notice One-shot wiring of the mining engine (deployed after the token).
    function setMiningEngine(address engine) external onlyOwner {
        if (miningEngine != address(0)) revert MiningEngineAlreadySet();
        require(engine != address(0), "engine=0");
        miningEngine = engine;
        emit MiningEngineSet(engine);
    }

    /// @notice Mint from the 45% mining reserve. Only callable by the Forge.
    function mintMining(address to, uint256 amount) external {
        if (msg.sender != miningEngine) revert NotMiningEngine();
        if (miningMinted + amount > MINING_SUPPLY) revert MiningCapExceeded();
        miningMinted += amount;
        _mint(to, amount);
    }

    /// @notice Remaining mining reserve, useful for UI and invariant checks.
    function miningRemaining() external view returns (uint256) {
        return MINING_SUPPLY - miningMinted;
    }
}
