// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PledgeReceipt
 * @author CCS6354 Group Project
 * @notice A non-transferable ("soulbound") ERC-721 that issues one permanent,
 *         verifiable receipt per pledge. It turns an otherwise private ledger
 *         entry into a public, wallet-visible proof-of-contribution that any
 *         third party can audit without trusting our front-end.
 * @dev Design rationale (see report Methodology):
 *      - This is a SEPARATE contract. CrowdFund.sol is never modified, so the
 *        audited escrow logic and its reentrancy guarantees are unchanged. The
 *        receipt is additive infrastructure, not a rewrite of the core.
 *      - Soulbound is enforced by overriding _update: any transfer between two
 *        non-zero addresses reverts. Minting (from == 0) is allowed. Burning is
 *        not exposed. A receipt is therefore a permanent fact about an address.
 *      - Minting authority is restricted to a single "minter" (the deployer or,
 *        in production, a thin adapter). The receipt cannot be forged by an
 *        arbitrary caller, so "reputation farming" is structurally prevented.
 */
contract PledgeReceipt is ERC721, Ownable {
    /// @notice The only address allowed to mint receipts.
    address public minter;

    /// @notice Monotonic token id counter. Each pledge gets a fresh id, so two
    ///         backers of the same campaign never collide on an id.
    uint256 private _nextTokenId;

    /// @dev On-chain provenance for each receipt, independently queryable.
    struct ReceiptData {
        uint256 campaignId;
        address backer;
        uint256 amount;
        uint64 timestamp;
    }

    /// @notice tokenId => immutable receipt provenance.
    mapping(uint256 => ReceiptData) public receipts;

    /// @notice Emitted when a soulbound receipt is minted for a pledge.
    event ReceiptMinted(
        uint256 indexed tokenId,
        uint256 indexed campaignId,
        address indexed backer,
        uint256 amount
    );

    /// @notice Emitted when the authorised minter is changed.
    event MinterUpdated(address oldMinter, address newMinter);

    error NotMinter(address caller);
    error SoulboundNonTransferable();
    error ZeroAddressMinter();

    /**
     * @param initialMinter The address permitted to mint (e.g. the deployer
     *        script, which then exercises it from the front-end demo).
     */
    constructor(address initialMinter)
        ERC721("CrowdFund Pledge Receipt", "CFPR")
        Ownable(msg.sender)
    {
        if (initialMinter == address(0)) revert ZeroAddressMinter();
        minter = initialMinter;
        emit MinterUpdated(address(0), initialMinter);
    }

    /// @notice Owner can rotate the authorised minter.
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) revert ZeroAddressMinter();
        address old = minter;
        minter = newMinter;
        emit MinterUpdated(old, newMinter);
    }

    /**
     * @notice Mint one soulbound receipt to a backer for a specific pledge.
     * @param backer The address that pledged (and will own the receipt).
     * @param campaignId The campaign that was backed.
     * @param amount The pledged amount in wei (recorded for provenance).
     * @return tokenId The id of the freshly minted receipt.
     * @dev Restricted to the authorised minter so receipts cannot be forged.
     *      A separate, incrementing tokenId avoids the id-collision bug that a
     *      naive "mint campaignId" approach would cause for multiple backers.
     */
    function mintReceipt(address backer, uint256 campaignId, uint256 amount)
        external
        returns (uint256 tokenId)
    {
        if (msg.sender != minter) revert NotMinter(msg.sender);

        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
        }

        receipts[tokenId] = ReceiptData({
            campaignId: campaignId,
            backer: backer,
            amount: amount,
            timestamp: uint64(block.timestamp)
        });

        _safeMint(backer, tokenId);

        emit ReceiptMinted(tokenId, campaignId, backer, amount);
    }

    /// @notice Total receipts minted so far (also the next token id).
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @dev The soulbound guarantee. OpenZeppelin v5 routes mint, transfer and
     *      burn through _update. We permit only mint (from == address(0)) and
     *      reject any owner-to-owner move. This is what makes the receipt a
     *      trustworthy reputation primitive: it cannot be bought or sold.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundNonTransferable();
        }
        return super._update(to, tokenId, auth);
    }
}
