// Redesigned client. Four zones, mirroring the contract's separation of concerns:
//   1. wallet + network   2. campaign explorer   3. soulbound wallet
//   4. on-chain transparency log
// Read-only data uses a public RPC so the explorer and log populate before any
// wallet connects (clean demo + screenshots). Writes go through MetaMask.

import {
  NETWORKS, ACTIVE, CROWDFUND_ADDRESS, RECEIPT_ADDRESS,
  CROWDFUND_ABI, RECEIPT_ABI, ERROR_MAP,
} from "./src/config/contract.js";

const NET = NETWORKS[ACTIVE];
const RECEIPT_PLACEHOLDER = "0xYOUR_PLEDGERECEIPT_ADDRESS_HERE";
const receiptWired = RECEIPT_ADDRESS && RECEIPT_ADDRESS !== RECEIPT_PLACEHOLDER;

const $ = (id) => document.getElementById(id);
let provider, signer, account, cfWrite;

// Read-only instances (initial fallback)
let roProvider = new ethers.providers.JsonRpcProvider(NET.publicRpc);
let cfRead = new ethers.Contract(CROWDFUND_ADDRESS, CROWDFUND_ABI, roProvider);
let rcRead = receiptWired ? new ethers.Contract(RECEIPT_ADDRESS, RECEIPT_ABI, roProvider) : null;

// ---- helpers --------------------------------------------------------------

const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const eth = (wei) => {
  try { return parseFloat(ethers.utils.formatEther(wei)).toString(); }
  catch { return "0"; }
};

function status(msg, kind = "info") {
  const el = $("status");
  el.className = `alert alert-${kind} py-2 small mono`;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function clearStatus() { $("status").classList.add("d-none"); }

function humanError(err) {
  if (err && (err.code === 4001 || /user rejected/i.test(JSON.stringify(err))))
    return "You rejected the transaction in MetaMask.";
  const blob = JSON.stringify(err || "");
  for (const [name, msg] of Object.entries(ERROR_MAP)) {
    if (blob.includes(name)) return msg;
  }
  return err?.reason || err?.message || "The transaction failed.";
}

// ---- wallet + network -----------------------------------------------------

async function connect() {
  if (!window.ethereum) return status("MetaMask is not installed.", "danger");
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    account = await signer.getAddress();
    cfWrite = new ethers.Contract(CROWDFUND_ADDRESS, CROWDFUND_ABI, signer);

    // 🔥 THE FIX: Upgrade read contracts to use MetaMask's premium connection!
    cfRead = new ethers.Contract(CROWDFUND_ADDRESS, CROWDFUND_ABI, provider);
    if (receiptWired) rcRead = new ethers.Contract(RECEIPT_ADDRESS, RECEIPT_ABI, provider);

    $("walletInfo").textContent = short(account);
    $("connectBtn").textContent = "Connected";
    $("connectBtn").classList.replace("btn-primary", "btn-outline-success");

    await checkNetwork();
    await Promise.all([loadCampaigns(), loadMyReceipts(), loadLog()]);
  } catch (e) {
    status(humanError(e), "danger");
  }
}

async function checkNetwork() {
  if (!provider) return false;
  const n = await provider.getNetwork();
  const ok = n.chainId === NET.chainIdDec;
  $("netBanner").classList.toggle("d-none", ok);
  $("wantNet").textContent = NET.name;
  return ok;
}

// ---- write actions --------------------------------------------------------

async function sendTx(fn, pending) {
  if (!cfWrite) return status("Connect your wallet first.", "warning");
  if (!(await checkNetwork())) return status(`Switch to ${NET.name} first.`, "warning");
  try {
    clearStatus();
    status(`${pending} — confirm in MetaMask…`, "secondary");
    const tx = await fn();
    status(`Transaction pending: ${tx.hash}`, "warning");
    const r = await tx.wait();
    status(`Confirmed in block ${r.blockNumber} ✓`, "success");
    await Promise.all([loadCampaigns(), loadMyReceipts(), loadLog()]);
  } catch (e) {
    status(humanError(e), "danger");
  }
}

async function createCampaign() {
  const g = $("goal").value, d = parseInt($("dur").value, 10);
  if (!g || !d) return status("Enter a goal and a duration.", "warning");
  const goalWei = ethers.utils.parseEther(g.toString());
  await sendTx(() => cfWrite.createCampaign(goalWei, d * 86400), "Creating campaign");
}

// ---- campaign explorer ----------------------------------------------------

async function loadCampaigns() {
  const box = $("campaigns");
  try {
    const count = (await cfRead.campaignCount()).toNumber();
    if (count === 0) {
      box.innerHTML = '<div class="col-12 text-secondary small">No campaigns yet — create the first one above.</div>';
      return;
    }
    const cards = [];
    for (let i = count - 1; i >= 0; i--) {
      const c = await cfRead.getCampaign(i);
      const live = await cfRead.isLive(i);
      const ok = await cfRead.succeeded(i);
      let mine = "0";
      if (account) { try { mine = eth(await cfRead.pledgedAmount(i, account)); } catch (_) {} }
      const goal = eth(c.goal), pledged = eth(c.pledged);
      const pct = Math.min(100, (Number(pledged) / Number(goal)) * 100 || 0).toFixed(0);
      const ended = !live;
      const pill = live ? '<span class="pill pill-live">LIVE</span>' : ok ? '<span class="pill pill-ok">SUCCEEDED</span>' : '<span class="pill pill-fail">FAILED</span>';
      const ends = new Date(Number(c.endAt) * 1000).toLocaleString();

      cards.push(`<div class="col-md-6"><div class="panel p-3 h-100">
          <div class="d-flex justify-content-between align-items-start">
            <div><strong>Campaign #${i}</strong><div class="sec-title">by ${short(c.creator)}</div></div>${pill}
          </div>
          <div class="progress my-2"><div class="progress-bar bg-success" style="width:${pct}%"></div></div>
          <div class="small mb-1">${pledged} / ${goal} ETH <span class="text-secondary">(${pct}%)</span></div>
          <div class="sec-title mb-2">${ended ? "Ended" : "Ends"}: ${ends}</div>
          ${account && Number(mine) > 0 ? `<div class="small text-info mb-2">Your pledge: ${mine} ETH</div>` : ""}
          <div class="d-flex gap-2">
            <input type="number" step="0.001" min="0" id="amt${i}" class="form-control form-control-sm" placeholder="ETH" ${live ? "" : "disabled"} />
            <button class="btn btn-sm btn-primary" data-act="pledge" data-id="${i}" ${live ? "" : "disabled"}>Pledge</button>
            <button class="btn btn-sm btn-outline-info" data-act="claim" data-id="${i}" ${ended && ok ? "" : "disabled"}>Claim</button>
            <button class="btn btn-sm btn-outline-warning" data-act="refund" data-id="${i}" ${ended && !ok ? "" : "disabled"}>Refund</button>
          </div>
        </div></div>`);
    }
    box.innerHTML = cards.join("");
  } catch (e) {
    box.innerHTML = `<div class="col-12 text-danger small">Could not read campaigns: ${humanError(e)}</div>`;
  }
}

async function onCampaignClick(ev) {
  const b = ev.target.closest("button[data-act]");
  if (!b) return;
  const id = Number(b.dataset.id), act = b.dataset.act;
  if (act === "pledge") {
    const v = $(`amt${id}`).value;
    if (!v) return status("Enter an amount to pledge.", "warning");
    await sendTx(() => cfWrite.pledge(id, { value: ethers.utils.parseEther(v) }), `Pledging to #${id}`);
  } else if (act === "claim") {
    await sendTx(() => cfWrite.claim(id), `Claiming #${id}`);
  } else if (act === "refund") {
    await sendTx(() => cfWrite.refund(id), `Refunding #${id}`);
  }
}

// ---- soulbound wallet & log -----------------------------------------------

async function loadMyReceipts() {
  const box = $("myReceipts");
  if (!account) { box.innerHTML = "Connect your wallet to see the receipts you have earned."; return; }
  if (!receiptWired) return;
  try {
    const activeProvider = provider || roProvider;
    const latestBlock = await activeProvider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - 5000); 

    const evs = await rcRead.queryFilter(rcRead.filters.ReceiptMinted(null, null, account), startBlock, "latest");
    if (evs.length === 0) { box.innerHTML = "You have no soulbound receipts yet. Pledge to a campaign to earn one."; return; }
    
    box.innerHTML = `<div class="mb-2 text-secondary">You permanently hold <strong>${evs.length}</strong> non-transferable proof(s) of contribution:</div><div class="row g-2">` +
      evs.map((e) => `<div class="col-sm-6 col-lg-4"><div class="stat p-2"><div class="d-flex justify-content-between"><span class="receipt-chip">🪪 #${e.args.tokenId}</span><a href="${NET.explorerToken}${RECEIPT_ADDRESS}?a=${e.args.tokenId}" target="_blank" rel="noopener" class="small">verify ↗</a></div><div class="small mt-2">Campaign #${e.args.campaignId}</div><div class="small text-secondary">${eth(e.args.amount)} ETH backed</div></div></div>`).join("") + "</div>";
  } catch (e) {
    box.innerHTML = `<span class="text-danger">Could not read receipts: ${humanError(e)}</span>`;
  }
}

function logRow(r) {
  const badge = { Created: "secondary", Pledged: "primary", Claimed: "success", Refunded: "warning", Receipt: "info" }[r.type] || "secondary";
  const receiptCell = r.receiptToken !== undefined ? `<a href="${NET.explorerToken}${RECEIPT_ADDRESS}?a=${r.receiptToken}" target="_blank" rel="noopener">🪪 #${r.receiptToken}</a>` : r.type === "Pledged" ? '<span class="text-secondary">—</span>' : "";
  const verify = r.tx && NET.explorerTx !== "#" ? `<a href="${NET.explorerTx}${r.tx}" target="_blank" rel="noopener">Etherscan ↗</a>` : "";
  return `<tr><td><span class="badge bg-${badge}">${r.type}</span></td><td>${r.campaign ?? "—"}</td><td class="mono">${short(r.who)}</td><td>${r.amount ?? "—"}</td><td>${receiptCell}</td><td>${verify}</td></tr>`;
}

async function loadLog() {
  try {
    $("logStatus").textContent = "Reading events directly from the blockchain…";
    const activeProvider = provider || roProvider;
    const latestBlock = await activeProvider.getBlockNumber();
    const startBlock = Math.max(0, latestBlock - 5000); 

    const [created, pledged, claimed, refunded] = await Promise.all([
      cfRead.queryFilter(cfRead.filters.CampaignCreated(), startBlock, "latest"),
      cfRead.queryFilter(cfRead.filters.Pledged(), startBlock, "latest"),
      cfRead.queryFilter(cfRead.filters.Claimed(), startBlock, "latest"),
      cfRead.queryFilter(cfRead.filters.Refunded(), startBlock, "latest"),
    ]);
    let receipts = [];
    if (receiptWired) { try { receipts = await rcRead.queryFilter(rcRead.filters.ReceiptMinted(), startBlock, "latest"); } catch (_) {} }

    const byKey = {};
    receipts.forEach((r) => { byKey[`${r.args.campaignId}-${r.args.backer.toLowerCase()}`] = r.args.tokenId.toString(); });

    const rows = [];
    created.forEach((e) => rows.push({ type: "Created", campaign: e.args.id.toString(), who: e.args.creator, amount: eth(e.args.goal) + " goal", tx: e.transactionHash, block: e.blockNumber }));
    pledged.forEach((e) => rows.push({ type: "Pledged", campaign: e.args.id.toString(), who: e.args.backer, amount: eth(e.args.amount), receiptToken: byKey[`${e.args.id}-${e.args.backer.toLowerCase()}`], tx: e.transactionHash, block: e.blockNumber }));
    claimed.forEach((e) => rows.push({ type: "Claimed", campaign: e.args.id.toString(), who: "creator", amount: eth(e.args.netToCreator) + " net", tx: e.transactionHash, block: e.blockNumber }));
    refunded.forEach((e) => rows.push({ type: "Refunded", campaign: e.args.id.toString(), who: e.args.backer, amount: eth(e.args.amount), tx: e.transactionHash, block: e.blockNumber }));
    receipts.forEach((e) => rows.push({ type: "Receipt", campaign: e.args.campaignId.toString(), who: e.args.backer, amount: eth(e.args.amount), receiptToken: e.args.tokenId.toString(), tx: e.transactionHash, block: e.blockNumber }));

    rows.sort((a, b) => (b.block || 0) - (a.block || 0));

    $("cPledge").textContent = pledged.length; $("cClaim").textContent = claimed.length;
    $("cRefund").textContent = refunded.length; $("cReceipt").textContent = receiptWired ? receipts.length : "n/a";
    $("logBody").innerHTML = rows.length ? rows.map(logRow).join("") : '<tr><td colspan="6" class="text-center text-secondary">No events on this contract yet.</td></tr>';
    $("logStatus").textContent = `Loaded ${rows.length} on-chain events directly from ${NET.name}.` + (receiptWired ? "" : " (Receipt address not set; escrow events only.)");
  } catch (e) {
    $("logStatus").textContent = "Could not read the chain: " + humanError(e);
  }
}

// ---- wire up --------------------------------------------------------------
if (window.ethereum) {
  window.ethereum.on("chainChanged", () => window.location.reload());
  window.ethereum.on("accountsChanged", () => window.location.reload());
}
$("connectBtn").addEventListener("click", connect);
$("createBtn").addEventListener("click", createCampaign);
$("reloadBtn").addEventListener("click", loadCampaigns);
$("logBtn").addEventListener("click", loadLog);
$("campaigns").addEventListener("click", onCampaignClick);

window.addEventListener("load", () => { loadCampaigns(); loadLog(); });