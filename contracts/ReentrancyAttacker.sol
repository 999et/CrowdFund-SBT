// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICrowdFund {
    function pledge(uint256 id) external payable;
    function refund(uint256 id) external;
}

contract ReentrancyAttacker {
    ICrowdFund public immutable target;
    uint256 public campaignId;
    uint256 public reentryAttempts;

    constructor(address _target) {
        target = ICrowdFund(_target);
    }

    function pledge(uint256 id) external payable {
        campaignId = id;
        target.pledge{value: msg.value}(id);
    }

    function attack() external {
        target.refund(campaignId);
    }

    // Hostile fallback: re-enters refund mid-transfer. The nested call's
    // revert is NOT caught, so it bubbles up and reverts the whole attack.
    receive() external payable {
        reentryAttempts++;
        if (reentryAttempts < 2) {
            target.refund(campaignId);
        }
    }
}