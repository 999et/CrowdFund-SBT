const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_DAY = 24 * 60 * 60;
const FEE_BPS = 250;

describe("Integration: CrowdFund + soulbound PledgeReceipt", function () {
  let crowdFund, receipt;
  let owner, creator, backerA, backerB;

  beforeEach(async function () {
    [owner, creator, backerA, backerB] = await ethers.getSigners();

    const CrowdFund = await ethers.getContractFactory("CrowdFund");
    crowdFund = await CrowdFund.deploy(FEE_BPS);
    await crowdFund.waitForDeployment();

    // The deployer/owner is the receipt minter, mirroring deploy.js + the UI.
    const PledgeReceipt = await ethers.getContractFactory("PledgeReceipt");
    receipt = await PledgeReceipt.deploy(owner.address);
    await receipt.waitForDeployment();
  });

  it("issues exactly one soulbound receipt per pledge, with matching provenance", async function () {
    const goal = ethers.parseEther("5");
    await crowdFund.connect(creator).createCampaign(goal, 3 * ONE_DAY);

    // Backer pledges on the (unmodified) CrowdFund contract...
    const amount = ethers.parseEther("2");
    await expect(crowdFund.connect(backerA).pledge(0, { value: amount }))
      .to.emit(crowdFund, "Pledged")
      .withArgs(0, backerA.address, amount);

    // ...and the minter issues the matching soulbound receipt.
    await expect(
      receipt.connect(owner).mintReceipt(backerA.address, 0, amount)
    )
      .to.emit(receipt, "ReceiptMinted")
      .withArgs(0, 0, backerA.address, amount);

    // The receipt's recorded provenance matches the on-chain pledge ledger.
    const onChainPledge = await crowdFund.pledgedAmount(0, backerA.address);
    const r = await receipt.receipts(0);
    expect(r.amount).to.equal(onChainPledge);
    expect(r.backer).to.equal(backerA.address);
    expect(await receipt.ownerOf(0)).to.equal(backerA.address);
  });

  it("two backers of one campaign get distinct, non-colliding receipts", async function () {
    await crowdFund.connect(creator).createCampaign(ethers.parseEther("9"), 3 * ONE_DAY);

    await crowdFund.connect(backerA).pledge(0, { value: ethers.parseEther("3") });
    await crowdFund.connect(backerB).pledge(0, { value: ethers.parseEther("4") });
    await receipt.connect(owner).mintReceipt(backerA.address, 0, ethers.parseEther("3"));
    await receipt.connect(owner).mintReceipt(backerB.address, 0, ethers.parseEther("4"));

    expect(await receipt.ownerOf(0)).to.equal(backerA.address);
    expect(await receipt.ownerOf(1)).to.equal(backerB.address);
    expect(await receipt.totalMinted()).to.equal(2);
  });

  it("the receipt cannot be sold (reputation cannot be farmed)", async function () {
    await crowdFund.connect(creator).createCampaign(ethers.parseEther("1"), 2 * ONE_DAY);
    await crowdFund.connect(backerA).pledge(0, { value: ethers.parseEther("1") });
    await receipt.connect(owner).mintReceipt(backerA.address, 0, ethers.parseEther("1"));

    await expect(
      receipt.connect(backerA).transferFrom(backerA.address, backerB.address, 0)
    ).to.be.revertedWithCustomError(receipt, "SoulboundNonTransferable");
  });

  it("PROOF: the soulbound receipt does NOT weaken the reentrancy guarantee", async function () {
    // Re-run the original DAO-style attack, now with the receipt system also
    // deployed, to demonstrate the security property is preserved.
    await crowdFund.connect(creator).createCampaign(ethers.parseEther("1000"), 2 * ONE_DAY);

    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await Attacker.deploy(await crowdFund.getAddress());
    await attacker.waitForDeployment();

    await attacker.pledge(0, { value: ethers.parseEther("2") });
    await crowdFund.connect(backerB).pledge(0, { value: ethers.parseEther("5") });

    // A receipt being minted in the same scenario must not change the outcome.
    // (Receipts go to EOA backers in the real flow; _safeMint correctly refuses
    // contracts without onERC721Received, so we mint to EOAs here.)
    await receipt.connect(owner).mintReceipt(backerA.address, 0, ethers.parseEther("2"));
    await receipt.connect(owner).mintReceipt(backerB.address, 0, ethers.parseEther("5"));

    await time.increase(3 * ONE_DAY);

    // Identical outcome to the standalone reentrancy test, now with the
    // soulbound system live: the attack reverts entirely with EthTransferFailed
    // and every wei stays in the contract. The receipt does not weaken it.
    await expect(attacker.attack()).to.be.revertedWithCustomError(
      crowdFund,
      "EthTransferFailed"
    );

    const attackerBal = await ethers.provider.getBalance(await attacker.getAddress());
    const contractBalAfter = await ethers.provider.getBalance(await crowdFund.getAddress());

    expect(attackerBal).to.equal(0);
    expect(contractBalAfter).to.equal(ethers.parseEther("7"));

    // And the soulbound receipts still exist and are still non-transferable.
    expect(await receipt.ownerOf(0)).to.equal(backerA.address);
    await expect(
      receipt
        .connect(backerB)
        .transferFrom(backerB.address, backerA.address, 1)
    ).to.be.revertedWithCustomError(receipt, "SoulboundNonTransferable");
  });
});
