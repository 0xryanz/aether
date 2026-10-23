// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry
/// @notice Local mirror of Binance Agent ID ownership used by Aether Forge.
/// @dev Operators (a bot / backend signer) write attestations after verifying the
///      Agent ID off-chain. Each wallet maps to exactly one agent id and each agent
///      id to exactly one wallet, which makes the per-agent mint cap meaningful
///      even across multiple wallets.
contract AgentRegistry is IAgentRegistry, Ownable2Step {
    mapping(address => bytes32) private _agentIds;
    mapping(bytes32 => address) public walletOf;
    mapping(address => bool) public operators;
    /// @notice Local/demo convenience: lets a wallet self-register an agent id.
    ///         Disabled by default and never enabled on mainnet.
    bool public selfRegistrationEnabled;

    event OperatorSet(address indexed operator, bool allowed);
    event AgentIdRegistered(address indexed wallet, bytes32 indexed agentId);
    event AgentIdRevoked(address indexed wallet, bytes32 indexed agentId);
    event SelfRegistrationSet(bool enabled);

    error NotOperator();
    error AlreadyRegistered();
    error InvalidAgentId();
    error NotRegistered();
    error SelfRegistrationDisabled();

    modifier onlyOperator() {
        if (msg.sender != owner() && !operators[msg.sender]) revert NotOperator();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setOperator(address operator, bool allowed) external onlyOwner {
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed);
    }

    function setSelfRegistration(bool enabled) external onlyOwner {
        selfRegistrationEnabled = enabled;
        emit SelfRegistrationSet(enabled);
    }

    /// @notice Bind the caller to an agent id in demo mode.
    function selfRegister(bytes32 agentId) external {
        if (!selfRegistrationEnabled) revert SelfRegistrationDisabled();
        _register(msg.sender, agentId);
    }

    /// @inheritdoc IAgentRegistry
    function agentIdOf(address account) external view returns (bytes32) {
        return _agentIds[account];
    }

    /// @inheritdoc IAgentRegistry
    function isVerified(address account) external view returns (bool) {
        return _agentIds[account] != bytes32(0);
    }

    function register(address wallet, bytes32 agentId) public onlyOperator {
        _register(wallet, agentId);
    }

    function registerBatch(address[] calldata wallets, bytes32[] calldata agentIds) external onlyOperator {
        require(wallets.length == agentIds.length, "length mismatch");
        for (uint256 i = 0; i < wallets.length; ++i) {
            _register(wallets[i], agentIds[i]);
        }
    }

    function revoke(address wallet) external onlyOperator {
        bytes32 agentId = _agentIds[wallet];
        if (agentId == bytes32(0)) revert NotRegistered();
        delete _agentIds[wallet];
        delete walletOf[agentId];
        emit AgentIdRevoked(wallet, agentId);
    }

    function _register(address wallet, bytes32 agentId) private {
        if (wallet == address(0) || agentId == bytes32(0)) revert InvalidAgentId();
        if (_agentIds[wallet] != bytes32(0) || walletOf[agentId] != address(0)) revert AlreadyRegistered();
        _agentIds[wallet] = agentId;
        walletOf[agentId] = wallet;
        emit AgentIdRegistered(wallet, agentId);
    }
}
