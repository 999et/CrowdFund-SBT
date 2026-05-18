// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CrowdFund
 * @author CCS6354 Group Project
 * @notice A trustless, all-or-nothing crowdfunding platform.
 * Backers pledge ETH to time-boxed campaigns.
 * If a campaign meets its goal by the deadline the creator may claim the funds (minus a capped platform fee);
 * otherwise every backer can pull their own refund.
 * No intermediary ever custodies funds with discretion: the rules are the contract.
 * @dev Security posture:
 * - Checks-Effects-Interactions on every ETH-moving function.
 * - ReentrancyGuard on all functions that perform external value transfer.
 * - Pull-over-Push: refunds and fee withdrawals are pulled by the recipient,
 * never pushed in a loop, so one griefing address cannot brick the campaign.
 * - Role-based access control via OpenZeppelin Ownable for platform governance.
 * - Solidity ^0.8.20 gives checked arithmetic, so explicit SafeMath is unneeded;
 * this is relied upon deliberately and documented (see report Methodology).
 */
contract CrowdFund is ReentrancyGuard, Ownable, Pausable {
    // ---------------------------------------------------------------------
    //                              Types
    // ---------------------------------------------------------------------

    /**
     * @dev Packed into 3 storage slots to minimise SSTORE cost:
     * slot 0: creator (20 bytes) + claimed (1 byte)
     * slot 1: goal (16 bytes) + pledged (16 bytes)
     * slot 2: startAt (8 bytes) + endAt (8 bytes)
     * uint128 holds 3.4e38 wei, far above the ~1.2e26 wei ETH supply, so it
     * cannot overflow in practice while halving storage cost versus uint256.
     */
    struct Campaign {
        address creator;
        bool claimed;
        uint128 goal;
        uint128 pledged;
        uint64 startAt;
        uint64 endAt;
    }

    // ---------------------------------------------------------------------
    //                          State variables
    // ---------------------------------------------------------------------

    /// @notice Total number of campaigns ever created; also the next campaign id.
    uint256 public campaignCount;

    /// @notice Platform fee in basis points (1 bp = 0.01%). Applied only on success.
    uint16 public platformFeeBps;

    /// @notice Fees accrued to the platform, withdrawable by the owner (pull pattern).
    uint256 public collectedFees;

    /// @notice Hard ceiling on the platform fee: 5%. The owner can never exceed this.
    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Denominator for basis-point math.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Minimum campaign duration (anti-spam, gives backers time to react).
    uint64 public constant MIN_DURATION = 1 days;

    /// @notice Maximum campaign duration (bounds creator lock-up of backer funds).
    uint64 public constant MAX_DURATION = 90 days;

    /// @notice campaignId => Campaign metadata.
    mapping(uint256 => Campaign) public campaigns;

    /// @notice campaignId => backer => amount currently pledged (refundable balance).
    mapping(uint256 => mapping(address => uint256)) public pledgedAmount;

    // ---------------------------------------------------------------------
    //                              Events
    // ---------------------------------------------------------------------

    /// @notice Emitted on a write that creates new application state.
    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        uint128 goal,
        uint64 startAt,
        uint64 endAt
    );

    /// @notice Emitted when a backer adds funds to a campaign.
    event Pledged(uint256 indexed id, address indexed backer, uint256 amount);

    /// @notice Emitted when a backer reduces their pledge while a campaign is live.
    event Unpledged(uint256 indexed id, address indexed backer, uint256 amount);

    /// @notice Emitted on the state change that releases funds to a successful creator.
    event Claimed(uint256 indexed id, uint256 netToCreator, uint256 fee);

    /// @notice Emitted when a backer pulls a refund from a failed campaign.
    event Refunded(uint256 indexed id, address indexed backer, uint256 amount);

    /// @notice Emitted on the governance state change that updates the platform fee.
    event PlatformFeeUpdated(uint16 oldBps, uint16 newBps);

    /// @notice Emitted when the platform owner pulls accrued fees.
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    //                          Custom errors
    // ---------------------------------------------------------------------
    // Custom errors are ~50 gas cheaper than require-string reverts and carry
    // typed data for the front-end to render human-readable messages.
    error ZeroGoal();
    error DurationOutOfRange(uint64 given, uint64 min, uint64 max);
    error CampaignDoesNotExist(uint256 id);
    error CampaignNotLive(uint256 id);
    error CampaignStillLive(uint256 id);
    error ZeroValue();
    error InsufficientPledge(uint256 have, uint256 want);
    error NotCreator(address caller, address creator);
    error GoalNotReached(uint256 pledged, uint256 goal);
    error GoalAlreadyReached(uint256 pledged, uint256 goal);
    error AlreadyClaimed(uint256 id);
    error NothingToRefund(uint256 id, address caller);
    error FeeTooHigh(uint16 given, uint16 max);
    error NoFeesToWithdraw();
    error EthTransferFailed();

    // ---------------------------------------------------------------------
    //                            Constructor
    // ---------------------------------------------------------------------

    /**
     * @notice Deploys the platform.
     * @param initialFeeBps Initial platform fee in basis points (<= MAX_FEE_BPS).
     * @dev The deployer becomes the platform owner via OpenZeppelin Ownable.
     */
    constructor(uint16 initialFeeBps) Ownable(msg.sender) {
        if (initialFeeBps > MAX_FEE_BPS) {
            revert FeeTooHigh(initialFeeBps, MAX_FEE_BPS);
        }
        platformFeeBps = initialFeeBps;
        emit PlatformFeeUpdated(0, initialFeeBps);
    }

    // ---------------------------------------------------------------------
    //                          Campaign lifecycle
    // ---------------------------------------------------------------------

    /**
     * @notice Create a new crowdfunding campaign.
     * @param goal Funding target in wei (must be non-zero).
     * @param duration Campaign length in seconds (MIN_DURATION..MAX_DURATION).
     * @return id The id of the newly created campaign.
     * @dev Pure creation: touches no Ether, so no reentrancy surface. Bounds are
     * enforced with custom errors that echo the offending value for the UI.
     */
    function createCampaign(uint128 goal, uint64 duration)
        external
        whenNotPaused
        returns (uint256 id)
    {
        if (goal == 0) revert ZeroGoal();
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert DurationOutOfRange(duration, MIN_DURATION, MAX_DURATION);
        }

        id = campaignCount;
        uint64 startAt = uint64(block.timestamp);
        uint64 endAt = startAt + duration;

        campaigns[id] = Campaign({
            creator: msg.sender,
            claimed: false,
            goal: goal,
            pledged: 0,
            startAt: startAt,
            endAt: endAt
        });

        unchecked {
            // campaignCount is bounded by gas/block limits long before 2^256.
            campaignCount = id + 1;
        }

        emit CampaignCreated(id, msg.sender, goal, startAt, endAt);
    }

    /**
     * @notice Pledge ETH to a live campaign.
     * @param id The campaign to back.
     * @dev CHECKS the campaign is live and value is non-zero; EFFECTS update the
     * ledger before any INTERACTION (there is none here, but the ordering is
     * kept consistent across the contract).
     */
    function pledge(uint256 id)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        Campaign storage c = _getLiveCampaign(id);
        if (msg.value == 0) revert ZeroValue();

        // EFFECTS
        pledgedAmount[id][msg.sender] += msg.value;
        c.pledged += uint128(msg.value);

        emit Pledged(id, msg.sender, msg.value);
    }

    /**
     * @notice Withdraw part or all of your pledge while the campaign is still live.
     * @param id The campaign to unpledge from.
     * @param amount The amount of wei to reclaim.
     * @dev Implements Checks-Effects-Interactions: the backer's balance is reduced
     * BEFORE the ETH is sent, so a malicious fallback cannot re-enter and
     * drain more than was pledged. nonReentrant is defence-in-depth.
     */
    function unpledge(uint256 id, uint256 amount)
        external
        nonReentrant
    {
        Campaign storage c = _getLiveCampaign(id);
        if (amount == 0) revert ZeroValue();

        uint256 bal = pledgedAmount[id][msg.sender];
        if (bal < amount) revert InsufficientPledge(bal, amount);

        // EFFECTS
        pledgedAmount[id][msg.sender] = bal - amount;
        c.pledged -= uint128(amount);

        emit Unpledged(id, msg.sender, amount);

        // INTERACTIONS
        _sendEth(msg.sender, amount);
    }

    /**
     * @notice Creator claims the raised funds after a successful campaign.
     * @param id The campaign to claim.
     * @dev Only callable by the campaign creator, only after the deadline, only if
     * the goal was met, and only once. The platform fee is computed and
     * retained, the remainder pushed to the creator under CEI + nonReentrant.
     */
    function claim(uint256 id)
        external
        nonReentrant
    {
        Campaign storage c = _getExistingCampaign(id);

        // CHECKS
        if (msg.sender != c.creator) revert NotCreator(msg.sender, c.creator);
        if (block.timestamp < c.endAt) revert CampaignStillLive(id);
        if (c.pledged < c.goal) revert GoalNotReached(c.pledged, c.goal);
        if (c.claimed) revert AlreadyClaimed(id);

        // EFFECTS
        c.claimed = true;
        uint256 raised = c.pledged;
        uint256 fee = (raised * platformFeeBps) / BPS_DENOMINATOR;
        uint256 net = raised - fee;
        collectedFees += fee;

        emit Claimed(id, net, fee);

        // INTERACTIONS
        _sendEth(c.creator, net);
    }

    /**
     * @notice Backer pulls a refund from a campaign that failed to reach its goal.
     * @param id The failed campaign.
     * @dev Pull-over-Push: each backer withdraws exactly their own contribution.
     * The platform never iterates over backers, so refund settlement cannot
     * be griefed and has bounded, predictable gas cost.
     */
    function refund(uint256 id)
        external
        nonReentrant
    {
        Campaign storage c = _getExistingCampaign(id);

        // CHECKS
        if (block.timestamp < c.endAt) revert CampaignStillLive(id);
        if (c.pledged >= c.goal) revert GoalAlreadyReached(c.pledged, c.goal);

        uint256 amount = pledgedAmount[id][msg.sender];
        if (amount == 0) revert NothingToRefund(id, msg.sender);

        // EFFECTS
        pledgedAmount[id][msg.sender] = 0;

        emit Refunded(id, msg.sender, amount);

        // INTERACTIONS
        _sendEth(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    //                       Platform governance (RBAC)
    // ---------------------------------------------------------------------

    /**
     * @notice Update the platform fee.
     * @param newBps The new fee in basis points (<= MAX_FEE_BPS).
     * @dev Restricted to the platform owner via OpenZeppelin Ownable's onlyOwner.
     */
    function setPlatformFee(uint16 newBps) external onlyOwner {
        if (newBps > MAX_FEE_BPS) revert FeeTooHigh(newBps, MAX_FEE_BPS);
        uint16 old = platformFeeBps;
        platformFeeBps = newBps;
        emit PlatformFeeUpdated(old, newBps);
    }

    /**
     * @notice Owner pulls all accrued platform fees.
     * @dev Pull pattern + CEI + nonReentrant. Fees are zeroed before transfer.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = collectedFees;
        if (amount == 0) revert NoFeesToWithdraw();

        // EFFECTS
        collectedFees = 0;
        emit FeesWithdrawn(msg.sender, amount);

        // INTERACTIONS
        _sendEth(msg.sender, amount);
    }

    /// @notice Owner can pause new pledges and campaign creation in an emergency.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Owner lifts the pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    //                          View functions
    // ---------------------------------------------------------------------

    /**
     * @notice Read full campaign metadata.
     * @param id The campaign id.
     * @return The Campaign struct.
     */
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        if (id >= campaignCount) revert CampaignDoesNotExist(id);
        return campaigns[id];
    }

    /**
     * @notice Whether a campaign is currently accepting pledges.
     * @param id The campaign id.
     * @return live True if now is within [startAt, endAt).
     */
    function isLive(uint256 id) external view returns (bool live) {
        if (id >= campaignCount) revert CampaignDoesNotExist(id);
        Campaign storage c = campaigns[id];
        return block.timestamp >= c.startAt && block.timestamp < c.endAt;
    }

    /**
     * @notice Whether a finished campaign succeeded.
     * @param id The campaign id.
     * @return success True if the deadline passed and pledged >= goal.
     */
    function succeeded(uint256 id) external view returns (bool success) {
        if (id >= campaignCount) revert CampaignDoesNotExist(id);
        Campaign storage c = campaigns[id];
        return block.timestamp >= c.endAt && c.pledged >= c.goal;
    }

    // ---------------------------------------------------------------------
    //                       Internal helpers
    // ---------------------------------------------------------------------

    /// @dev Reverts if the campaign id was never created.
    function _getExistingCampaign(uint256 id)
        private
        view
        returns (Campaign storage c)
    {
        if (id >= campaignCount) revert CampaignDoesNotExist(id);
        c = campaigns[id];
    }

    /// @dev Reverts unless the campaign exists and is within its live window.
    function _getLiveCampaign(uint256 id)
        private
        view
        returns (Campaign storage c)
    {
        c = _getExistingCampaign(id);
        if (block.timestamp < c.startAt || block.timestamp >= c.endAt) {
            revert CampaignNotLive(id);
        }
    }

    /**
     * @dev Low-level ETH send with explicit success check. Using call (not
     * transfer) future-proofs against gas-cost opcode changes; safety comes
     * from the CEI ordering and nonReentrant guard at every call site.
     */
    function _sendEth(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}