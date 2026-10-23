// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IActivityHook
/// @notice Called by the Relic collection when a paid mint happens so the Forge
///         can validate pending invites (an invite is valid after the invitee
///         minted or forged at least once).
interface IActivityHook {
    function onActivity(address account) external;
}
