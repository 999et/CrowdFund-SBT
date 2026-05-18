const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Starting deployment with account:", deployer.address);

  // 1. Deploy CrowdFund
  const FEE_BPS = 250;
  const CrowdFund = await hre.ethers.getContractFactory("CrowdFund");
  const crowdFund = await CrowdFund.deploy(FEE_BPS);
  await crowdFund.waitForDeployment();
  const crowdFundAddress = await crowdFund.getAddress();
  console.log("CrowdFund deployed to:", crowdFundAddress);

  // 2. Deploy PledgeReceipt (SBT)
  const PledgeReceipt = await hre.ethers.getContractFactory("PledgeReceipt");
  const receipt = await PledgeReceipt.deploy(deployer.address);
  await receipt.waitForDeployment();
  const receiptAddress = await receipt.getAddress();
  console.log("PledgeReceipt deployed to:", receiptAddress);

  // 3. Print out the exact verification commands for you!
  console.log("COPY & PASTE THESE TO VERIFY ON ETHERSCAN:");
  console.log(`npx hardhat verify --network sepolia ${crowdFundAddress} 250`);
  console.log(`npx hardhat verify --network sepolia ${receiptAddress} ${deployer.address}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});