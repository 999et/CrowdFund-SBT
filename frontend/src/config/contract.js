export const NETWORKS = {
  sepolia: {
    chainIdHex: "0xaa36a7",
    chainIdDec: 11155111,
    name: "Sepolia",
    explorerTx: "https://sepolia.etherscan.io/tx/",
    explorerToken: "https://sepolia.etherscan.io/token/",
    explorerAddr: "https://sepolia.etherscan.io/address/",
    publicRpc: "https://ethereum-sepolia-rpc.publicnode.com", 
  },
  localhost: {
    chainIdHex: "0x7a69",
    chainIdDec: 31337,
    name: "Hardhat Localhost",
    explorerTx: "#",
    explorerToken: "#",
    explorerAddr: "#",
    publicRpc: "http://127.0.0.1:8545",
  },
};

export const ACTIVE = "sepolia";

export const CROWDFUND_ADDRESS = "0x3bD3986248b00328805349428b8919B202A1665B";
export const RECEIPT_ADDRESS = "0x6DeeEde823E059b3f5FBc4945903795D46520303";
export const DEPLOYMENT_BLOCK = 10872177;

export const CROWDFUND_ABI = [
  "function campaignCount() view returns (uint256)",
  "function platformFeeBps() view returns (uint16)",
  "function getCampaign(uint256 id) view returns (tuple(address creator, bool claimed, uint128 goal, uint128 pledged, uint64 startAt, uint64 endAt))",
  "function pledgedAmount(uint256 id, address backer) view returns (uint256)",
  "function isLive(uint256 id) view returns (bool)",
  "function succeeded(uint256 id) view returns (bool)",
  "function createCampaign(uint128 goal, uint64 duration) returns (uint256)",
  "function pledge(uint256 id) payable",
  "function unpledge(uint256 id, uint256 amount)",
  "function claim(uint256 id)",
  "function refund(uint256 id)",
  "event CampaignCreated(uint256 indexed id, address indexed creator, uint128 goal, uint64 startAt, uint64 endAt)",
  "event Pledged(uint256 indexed id, address indexed backer, uint256 amount)",
  "event Claimed(uint256 indexed id, uint256 netToCreator, uint256 fee)",
  "event Refunded(uint256 indexed id, address indexed backer, uint256 amount)",
];

export const RECEIPT_ABI = [
  "event ReceiptMinted(uint256 indexed tokenId, uint256 indexed campaignId, address indexed backer, uint256 amount)",
  "function totalMinted() view returns (uint256)",
  "function receipts(uint256) view returns (uint256 campaignId, address backer, uint256 amount, uint64 timestamp)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

export const ERROR_MAP = {
  ZeroGoal: "The funding goal must be greater than zero.",
  DurationOutOfRange: "Duration must be between 1 and 90 days.",
  CampaignDoesNotExist: "That campaign does not exist.",
  CampaignNotLive: "This campaign is not currently accepting pledges.",
  CampaignStillLive: "The campaign has not ended yet.",
  ZeroValue: "The amount must be greater than zero.",
  InsufficientPledge: "You are trying to withdraw more than you pledged.",
  NotCreator: "Only the campaign creator can do this.",
  GoalNotReached: "The goal was not reached, so funds cannot be claimed.",
  GoalAlreadyReached: "The goal was reached, so refunds are unavailable.",
  AlreadyClaimed: "These funds have already been claimed.",
  NothingToRefund: "You have nothing to refund for this campaign.",
  FeeTooHigh: "The platform fee exceeds the allowed maximum.",
  NoFeesToWithdraw: "There are no fees to withdraw.",
  EthTransferFailed: "The ETH transfer failed.",
};