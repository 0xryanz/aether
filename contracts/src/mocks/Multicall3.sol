// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Multicall3 (minimal)
/// @notice Subset of the canonical Multicall3 used by viem/wagmi for batched
///         reads. Deployed on local devnets and configured in the local chain.
///         BNB Chain already has Multicall3 at the canonical address.
contract Multicall3 {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory results) {
        results = new Result[](calls.length);
        for (uint256 i = 0; i < calls.length; ++i) {
            (bool success, bytes memory returnData) = calls[i].target.call(calls[i].callData);
            if (!success && !calls[i].allowFailure) {
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            results[i] = Result({success: success, returnData: returnData});
        }
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    function getCurrentBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getEthBalance(address account) external view returns (uint256) {
        return account.balance;
    }
}
