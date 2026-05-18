# CrowdFund

Decentralized crowdfunding with soulbound proof-of-contribution, on Ethereum Sepolia.

## Tech Stack

- Solidity v0.8.20
- Hardhat
- Ethers.js v5.7.2
- HTML5 + Bootstrap 5
- Network: Ethereum Sepolia Testnet

## Prerequisites

- Node.js and npm
- MetaMask browser extension

## Setup

```bash
npm install

# install the Gas Reporter
npm install --save-dev hardhat-gas-reporter
# install the Mocha JSON Reporter
npm install --save-dev mocha-json-output-reporter
```

Create a `.env` file in the root directory:

```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY
```

## Commands

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Tests with gas report
REPORT_GAS=true npx hardhat test

#produce the gas report txt file
REPORT_GAS=true npx hardhat test && cat test-report/gas-report.txt

# Coverage report
npx hardhat coverage

# Local blockchain node
npx hardhat node

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Run the Frontend

Paste the deployed addresses into `frontend/src/config/contract.js`
(`CROWDFUND_ADDRESS` and `RECEIPT_ADDRESS`), then:

```bash
npx serve frontend
```

Open `http://localhost:3000` with MetaMask set to the Sepolia Testnet.

## Deployed Contracts (Sepolia)

- CrowdFund (Escrow): `0x3bD3986248b00328805349428b8919B202A1665B`
- PledgeReceipt (SBT): `0x6DeeEde823E059b3f5FBc4945903795D46520303`