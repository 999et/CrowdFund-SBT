# Smart Contract Test & Security Report

## 1. Unit & Integration Test Suite
| Category | Function/Scenario | Input | Expected Output | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Unit** | `Deployment` | Constructor (250 BPS) | Owner set, Fee stored | PASS |
| **Unit** | `createCampaign` | 5 ETH, 1 Day | Emit `CampaignCreated` | PASS |
| **Unit** | `createCampaign` | 0 ETH | Revert `ZeroGoal` | PASS |
| **Unit** | `pledge` | 2 ETH | Emit `Pledged`, Balance updated | PASS |
| **Unit** | `pledge` | After Deadline | Revert `CampaignNotLive` | PASS |
| **Unit** | `claim` | Successful Goal | Net to creator, Fee collected | PASS |
| **Unit** | `refund` | Failed Goal | 100% principal back to backer | PASS |
| **Security** | `reentrancy` | Malicious contract | Revert `EthTransferFailed` | PASS |
| **Integr.** | `mintReceipt` | Matching Pledge | Issue Soulbound Receipt #0 | PASS |
| **Integr.** | `transfer` | Attempt to Sell SBT | Revert `SoulboundNonTransferable` | PASS |

## 2. Security Patterns Verified
* **Checks-Effects-Interactions (CEI):** Verified in `CrowdFund.test.js` - attacker cannot drain funds because state is zeroed before transfer.
* **ReentrancyGuard:** Verified via `Integration.test.js` - the SBT system does not introduce new entry points for reentrancy.
* **Soulbound Enforced:** Verified - tokens are mathematically non-transferable at the contract level.

## 3. Gas Consumption Report
| Contract | Method | Avg Gas Used |
| :--- | :--- | :--- |
| `CrowdFund` | `createCampaign` | 115,701 |
| `CrowdFund` | `claim` | 69,324 |
| `CrowdFund` | `pledge` | 60,212 |
| `CrowdFund` | `refund` | 39,754 |
| `PledgeReceipt` | `mintReceipt` | 162,586 |