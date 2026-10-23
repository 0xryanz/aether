// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAgentRegistry
/// @notice Minimal interface for the Binance Agent ID (.ai) identity registry.
/// @dev On mainnet this is implemented by an adapter around the official Agent ID
///      registry. It intentionally exposes only what the protocol needs: a check
///      that a wallet controls a registered agent identity and a stable agent id.
interface IAgentRegistry {
    /// @notice Agent id bound to `account`, or bytes32(0) when not registered.
    function agentIdOf(address account) external view returns (bytes32);

    /// @notice True when `account` holds a registered agent identity.
    function isVerified(address account) external view returns (bool);
}
