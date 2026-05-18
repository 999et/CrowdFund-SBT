const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_DAY = 24 * 60 * 60;
const FEE_BPS = 250; // 2.5%
const BPS_DENOMINATOR = 10_000;

describe("CrowdFund", function () {
  let crowdFund;
  let owner, creator, backerA, backerB, stranger;

  beforeEach(async function () {
    [owner, creator, backerA, backerB, stranger] = await ethers.getSigners();
    const CrowdFund = await ethers.getContractFactory("CrowdFund");
    crowdFund = await CrowdFund.deploy(FEE_BPS);
    await crowdFund.waitForDeployment();
  });

  async function makeCampaign(goalEth, durationSec, who = creator) {
    const goal = ethers.parseEther(goalEth.toString());
    const tx = await crowdFund.connect(who).createCampaign(goal, durationSec);
    await tx.wait();
    return 0n; 
  }

  describe("Deployment & constructor", function () {
    it("sets the deployer as owner", async function () {
      expect(await crowdFund.owner()).to.equal(owner.address);
    });
    it("stores the initial fee", async function () {
      expect(await crowdFund.platformFeeBps()).to.equal(FEE_BPS);
    });
  });

  describe("createCampaign", function () {
    it("creates a campaign and emits CampaignCreated", async function () {
      const goal = ethers.parseEther("5");
      await expect(crowdFund.connect(creator).createCampaign(goal, ONE_DAY))
        .to.emit(crowdFund, "CampaignCreated");
      expect(await crowdFund.campaignCount()).to.equal(1);
    });
    it("reverts on a zero goal", async function () {
      await expect(
        crowdFund.connect(creator).createCampaign(0, ONE_DAY)
      ).to.be.revertedWithCustomError(crowdFund, "ZeroGoal");
    });
  });

  describe("pledge", function () {
    beforeEach(async function () {
      await makeCampaign(10, 7 * ONE_DAY);
    });
    it("accepts a pledge and emits Pledged", async function () {
      const amount = ethers.parseEther("2");
      await expect(crowdFund.connect(backerA).pledge(0, { value: amount }))
        .to.emit(crowdFund, "Pledged")
        .withArgs(0, backerA.address, amount);
    });
    it("reverts after the deadline", async function () {
      await time.increase(8 * ONE_DAY);
      await expect(
        crowdFund.connect(backerA).pledge(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(crowdFund, "CampaignNotLive");
    });
  });

  describe("claim (successful campaign)", function () {
    beforeEach(async function () {
      await makeCampaign(5, 3 * ONE_DAY);
      await crowdFund.connect(backerA).pledge(0, { value: ethers.parseEther("3") });
      await crowdFund.connect(backerB).pledge(0, { value: ethers.parseEther("4") });
    });
    it("pays the creator net of fee and accrues the fee", async function () {
      await time.increase(4 * ONE_DAY);
      const raised = ethers.parseEther("7");
      const fee = (raised * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR);
      
      await expect(crowdFund.connect(creator).claim(0))
        .to.emit(crowdFund, "Claimed")
        .withArgs(0, raised - fee, fee);
      expect(await crowdFund.collectedFees()).to.equal(fee);
    });
  });

  describe("refund (failed campaign)", function () {
    beforeEach(async function () {
      await makeCampaign(50, 2 * ONE_DAY);
      await crowdFund.connect(backerA).pledge(0, { value: ethers.parseEther("3") });
    });
    it("refunds each backer exactly their pledge", async function () {
      await time.increase(3 * ONE_DAY);
      await expect(crowdFund.connect(backerA).refund(0))
        .to.emit(crowdFund, "Refunded")
        .withArgs(0, backerA.address, ethers.parseEther("3"));
      expect(await crowdFund.pledgedAmount(0, backerA.address)).to.equal(0);
    });
  });

  describe("Security: reentrancy attack on refund", function () {
    it("defeats a reentrant attacker (CEI + ReentrancyGuard)", async function () {
      await makeCampaign(1000, 2 * ONE_DAY);

      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await Attacker.deploy(await crowdFund.getAddress());
      await attacker.waitForDeployment();

      await attacker.pledge(0, { value: ethers.parseEther("2") });
      await crowdFund.connect(backerB).pledge(0, { value: ethers.parseEther("5") });

      await time.increase(3 * ONE_DAY);

      // The hostile receive() re-enters refund(). CEI has already zeroed the
      // balance, so the nested call reverts; the revert is NOT caught, so it
      // bubbles up, _sendEth sees a failed call, and the WHOLE attack reverts
      // with EthTransferFailed. The attacker gains nothing.
      await expect(attacker.attack()).to.be.revertedWithCustomError(
        crowdFund,
        "EthTransferFailed"
      );

      const attackerBal = await ethers.provider.getBalance(await attacker.getAddress());
      const contractBalAfter = await ethers.provider.getBalance(await crowdFund.getAddress());

      // The attack reverted entirely: attacker got nothing...
      expect(attackerBal).to.equal(0);

      // ...and ALL 7 ETH (attacker's trapped 2 + honest backer's 5) is safe.
      expect(contractBalAfter).to.equal(ethers.parseEther("7"));
    });
  });
});
