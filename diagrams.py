#!/usr/bin/env python3
"""
generate_diagrams.py
--------------------
Generates every figure used in the CCS6354 research report
"Trustless Crowdfunding with Soulbound Proof-of-Contribution".

All figures are drawn programmatically with matplotlib (no external
image assets) so they are fully reproducible.

Usage:
    python generate_diagrams.py            # writes PNGs to ./fig/
    python generate_diagrams.py --outdir X # custom output directory

Figures produced:
    fig1_arch.png  - Four-zone system architecture
    fig2_fsm.png   - All-or-nothing campaign lifecycle (state machine)
    fig3_seq.png   - Pledge-to-receipt provenance sequence
    fig4_cei.png   - Why the DAO-style reentrancy attack fails (CEI)
    fig5_pack.png   - Campaign struct packed into 3 storage slots
    fig6_gas.png    - Average gas per state-changing function
"""

import argparse
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib.lines import Line2D

# ---------------------------------------------------------------- styling
plt.rcParams.update({
    "font.family": "Liberation Serif",   # metric-compatible with Times New Roman
    "font.size": 11,
    "svg.fonttype": "none",
})

INK   = "#1d2630"
NAVY  = "#1c3d5a"
BLUE  = "#2f6f9f"
LBLUE = "#dbe9f3"
GREEN = "#2e7d4f"
LGRN  = "#dcefe2"
RED   = "#b3392f"
LRED  = "#f6dfdc"
GOLD  = "#b8860b"
LGLD  = "#f6eccf"
GREY  = "#5a6672"
LGREY = "#eef1f4"


# ---------------------------------------------------------------- helpers
def box(ax, x, y, w, h, text, fc, ec, fs=11, bold=False, tc=INK, r=0.035):
    """Rounded rectangle with centred label."""
    p = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.012,rounding_size={r}",
        linewidth=1.3, edgecolor=ec, facecolor=fc, zorder=2,
    )
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fs, color=tc,
            fontweight="bold" if bold else "normal", zorder=3)


def arrow(ax, p1, p2, color=GREY, style="-|>", lw=1.5, ls="-", rad=0.0):
    a = FancyArrowPatch(
        p1, p2, arrowstyle=style, mutation_scale=15,
        linewidth=lw, color=color, linestyle=ls,
        connectionstyle=f"arc3,rad={rad}", zorder=1,
    )
    ax.add_patch(a)


def label(ax, x, y, t, fs=9, color=GREY, style="italic", ha="center"):
    ax.text(x, y, t, ha=ha, va="center", fontsize=fs,
            color=color, fontstyle=style, zorder=4)


# ---------------------------------------------------------------- Fig 1
def fig_arch(outdir):
    fig, ax = plt.subplots(figsize=(9.2, 5.6))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 64)
    ax.axis("off")

    bands = [
        (49, 14, "PRESENTATION LAYER  \u00b7  browser, no server"),
        (27, 19, "TRUST BOUNDARY  \u00b7  signing + transport"),
        (1, 23, "CONSENSUS LAYER  \u00b7  Ethereum Sepolia"),
    ]
    for yy, hh, t in bands:
        ax.add_patch(Rectangle((1, yy), 98, hh, facecolor="#f7f9fb",
                               edgecolor="#d6dde4", linewidth=1, zorder=0))
        ax.text(2.6, yy + hh - 1.4, t, fontsize=8.3, color=GREY,
                fontweight="bold", fontstyle="italic",
                ha="left", va="center", zorder=1)

    box(ax, 5, 51.5, 27, 8, "Static UI\nHTML5 + Bootstrap 5", LBLUE, BLUE, 10)
    box(ax, 37, 51.5, 27, 8, "app.js controller\nethers.js v5.7", LBLUE, BLUE, 10)
    box(ax, 69, 51.5, 26, 8, "contract.js\nABI + addresses", LBLUE, BLUE, 10)

    box(ax, 9, 30.5, 33, 9, "MetaMask\nuser signs WRITE txns", LGLD, GOLD, 10, bold=True)
    box(ax, 58, 30.5, 33, 9, "Public Sepolia RPC\nread-only, no wallet", LGREY, GREY, 10)

    box(ax, 9, 4.5, 38, 14,
        "CrowdFund.sol  (Escrow)\nReentrancyGuard \u00b7 Ownable \u00b7 Pausable\n"
        "campaigns \u00b7 pledgedAmount \u00b7 fees", LGRN, GREEN, 9.5, bold=True)
    box(ax, 54, 4.5, 38, 14,
        "PledgeReceipt.sol  (Soulbound)\nERC-721 \u00b7 _update lock \u00b7 minter\n"
        "receipts[] provenance", LRED, RED, 9.5, bold=True)

    arrow(ax, (25, 51.5), (25, 39.5), BLUE, lw=1.6)
    arrow(ax, (25, 30.5), (25, 18.5), GOLD, lw=1.8)
    label(ax, 13.5, 24.4, "createCampaign / pledge\nclaim / refund / mint",
          7.6, GOLD, "italic")
    arrow(ax, (75, 51.5), (75, 39.5), BLUE, lw=1.6)
    arrow(ax, (75, 30.5), (75, 18.5), GREY, lw=1.6)
    label(ax, 87, 24.4, "queryFilter\nevents (log)", 7.6, GREY, "italic")
    arrow(ax, (47, 11.7), (54, 11.7), GREEN, "-|>", 1.6)
    arrow(ax, (54, 8.5), (47, 8.5), RED, "-|>", 1.6)
    label(ax, 50.5, 13.6, "Pledged", 7.4, GREEN, "italic")
    label(ax, 50.5, 6.2, "mintReceipt", 7.4, RED, "italic")

    ax.text(50, 63.0,
            "Figure 1.  Four-zone system architecture of the CrowdFund dApp.",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig1_arch.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- Fig 2
def fig_fsm(outdir):
    fig, ax = plt.subplots(figsize=(9.2, 4.4))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 46)
    ax.axis("off")

    box(ax, 2, 18, 17, 10, "CREATED\n/ LIVE", LBLUE, BLUE, 10.5, bold=True)
    box(ax, 33, 30, 20, 10, "SUCCEEDED", LGRN, GREEN, 10.5, bold=True)
    box(ax, 33, 5, 20, 10, "FAILED", LRED, RED, 10.5, bold=True)
    box(ax, 70, 30, 26, 10, "CLAIMED\ncreator paid (net)", LGRN, GREEN, 9.5, bold=True)
    box(ax, 70, 5, 26, 10, "REFUNDED\nbackers made whole", LRED, RED, 9.5, bold=True)

    arrow(ax, (19, 25), (33, 34), BLUE, rad=-0.15)
    arrow(ax, (19, 21), (33, 11), BLUE, rad=0.15)
    arrow(ax, (53, 35), (70, 35), GREEN)
    arrow(ax, (53, 10), (70, 10), RED)

    self_loop = FancyArrowPatch(
        (6, 28), (15, 28), arrowstyle="-|>", mutation_scale=13,
        linewidth=1.4, color=GREY,
        connectionstyle="arc3,rad=-1.4", zorder=1,
    )
    ax.add_patch(self_loop)

    label(ax, 9.0, 36.0, "pledge /\nunpledge", 8, GREY)
    label(ax, 22.5, 31.5, "deadline &\npledged \u2265 goal", 8, GREEN)
    label(ax, 22.5, 14.0, "deadline &\npledged < goal", 8, RED)
    label(ax, 61.5, 37.6, "claim()\nonlyCreator, once", 8, GREEN)
    label(ax, 61.5, 12.6, "refund()\npull, per backer", 8, RED)

    ax.text(50, 45.0,
            "Figure 2.  All-or-nothing campaign lifecycle (deterministic, time-boxed).",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig2_fsm.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- Fig 3
def fig_seq(outdir):
    fig, ax = plt.subplots(figsize=(9.2, 5.2))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 58)
    ax.axis("off")

    actors = [("Backer", 8), ("Frontend\n(app.js)", 29), ("CrowdFund", 51),
              ("Minter\n(deployer)", 72), ("PledgeReceipt", 91)]
    for name, x in actors:
        box(ax, x - 7.5, 50, 15, 6.5, name, LGREY, GREY, 8.6, bold=True)
        ax.add_line(Line2D([x, x], [4, 50], color="#c5cdd5",
                           lw=1.1, ls=(0, (4, 3)), zorder=0))

    def msg(y, x1, x2, t, c=NAVY, dashed=False):
        arrow(ax, (x1, y), (x2, y), c, lw=1.5, ls="--" if dashed else "-")
        ax.text((x1 + x2) / 2, y + 1.4, t, ha="center",
                fontsize=7.8, color=c, zorder=4)

    msg(45, 8, 29, "enter amount, click Pledge")
    msg(39, 29, 51, "pledge(id) { value }", BLUE)
    ax.text(51, 34.5, "CEI: ledger += value\nemit Pledged", ha="center",
            fontsize=7.6, color=GREEN, fontstyle="italic", zorder=4)
    msg(29, 51, 29, "tx receipt (confirmed)", GREEN, dashed=True)
    msg(23, 29, 72, "off-chain: detect Pledged event", GREY)
    msg(17, 72, 91, "mintReceipt(...)", RED)
    ax.text(91, 12.5, "_update lock:\nsoulbound\nemit ReceiptMinted",
            ha="center", fontsize=7.4, color=RED, fontstyle="italic", zorder=4)
    msg(7, 91, 8, "wallet shows non-transferable receipt", GOLD, dashed=True)

    ax.text(50, 57.4,
            "Figure C1.  Pledge-to-receipt provenance sequence "
            "(escrow and reputation decoupled).",
            ha="center", fontsize=10.5, fontweight="bold", color=INK)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig3_seq.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- Fig 4
def fig_cei(outdir):
    fig, ax = plt.subplots(figsize=(9.4, 4.8))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 50)
    ax.axis("off")

    box(ax, 2, 19, 20, 12, "Attacker\ncontract", LRED, RED, 10, bold=True)
    box(ax, 38, 35, 26, 9, "CHECKS\nguard + balances", LBLUE, BLUE, 9.5)
    box(ax, 38, 21.5, 26, 9, "EFFECTS\nbalance = 0  (state zeroed)",
        LGRN, GREEN, 9.5, bold=True)
    box(ax, 38, 8, 26, 9, "INTERACTIONS\n_sendEth(call)", LGLD, GOLD, 9.5)

    # 1. attacker calls refund() -> enters at CHECKS (top of the function)
    arrow(ax, (22, 27), (38, 39.5), RED, lw=1.7, rad=-0.18)
    label(ax, 29.5, 36.5, "1. refund(id)", 8, RED)
    # normal top-to-bottom flow within the function
    arrow(ax, (51, 35), (51, 30.5), GREY)
    arrow(ax, (51, 21.5), (51, 17), GREY)

    # 2. the external call hits the hostile receive(), which re-enters
    #    refund() and arrives back at CHECKS (NOT effects), where the
    #    already-zeroed balance makes the nested call revert.
    reentry = FancyArrowPatch(
        (38, 12.5), (38, 38.5), arrowstyle="-|>", mutation_scale=15,
        linewidth=1.7, color=RED, linestyle=(0, (5, 3)),
        connectionstyle="arc3,rad=-0.62", zorder=1,
    )
    ax.add_patch(reentry)
    label(ax, 22, 7.5, "2. receive() re-enters refund() at the top", 8, RED)

    box(ax, 70, 21.5, 27, 9,
        "Re-entry sees\nbalance == 0\nrevert: whole tx\nunwinds",
        LRED, RED, 8.4, bold=True)
    arrow(ax, (64, 39.5), (70, 30), RED, lw=1.6, rad=0.2)
    label(ax, 69, 36.5, "3. revert", 8, RED)
    ax.text(83.5, 13.5, "nonReentrant is\ndefence-in-depth",
            ha="center", fontsize=8, color=GREY, fontstyle="italic")

    ax.text(50, 49.0,
            "Figure 3.  Why the DAO-style reentrancy attack fails: "
            "state is zeroed before the external call.",
            ha="center", fontsize=10, fontweight="bold", color=INK)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig4_cei.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- Fig 5
def fig_pack(outdir):
    fig, ax = plt.subplots(figsize=(9.2, 3.5))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 34)
    ax.axis("off")

    slots = [
        ("Slot 0", [("creator  (address, 20B)", 0.625, BLUE),
                    ("claimed (1B)", 0.07, GREEN),
                    ("unused 11B", 0.305, LGREY)]),
        ("Slot 1", [("goal  uint128 (16B)", 0.5, GOLD),
                    ("pledged  uint128 (16B)", 0.5, RED)]),
        ("Slot 2", [("startAt u64 (8B)", 0.25, BLUE),
                    ("endAt u64 (8B)", 0.25, GREEN),
                    ("unused 16B", 0.5, LGREY)]),
    ]
    y = 24
    for name, segs in slots:
        ax.text(1, y + 3, name + "  \u00b7  32 bytes", fontsize=9.5,
                fontweight="bold", color=INK)
        x = 14
        for t, frac, c in segs:
            w = 84 * frac
            ax.add_patch(Rectangle((x, y), w, 6,
                                   facecolor=c, edgecolor="#9fb0bf",
                                   linewidth=1))
            ax.text(x + w / 2, y + 3, t, ha="center", va="center",
                    fontsize=7.8,
                    color="white" if c != LGREY else GREY,
                    fontweight="bold" if c != LGREY else "normal")
            x += w
        y -= 11
    ax.text(50, 33.2,
            "Figure A1.  Campaign struct packed into 3 storage slots "
            "(halves SSTORE cost vs. naive layout).",
            ha="center", fontsize=10, fontweight="bold", color=INK)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig5_pack.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- Fig 6
def fig_gas(outdir):
    fns = ["refund", "pledge", "claim", "createCampaign", "mintReceipt"]
    gas = [39754, 60212, 69324, 115701, 162586]
    colors = [GREEN, BLUE, GREEN, BLUE, RED]

    fig, ax = plt.subplots(figsize=(8.8, 3.7))
    bars = ax.bar(fns, gas, color=colors, edgecolor=INK,
                  linewidth=0.8, width=0.6, zorder=3)
    for b, g in zip(bars, gas):
        ax.text(b.get_x() + b.get_width() / 2, g + 3500, f"{g:,}",
                ha="center", fontsize=9.5, fontweight="bold", color=INK)
    ax.set_ylabel("Average gas (units)", fontsize=10)
    ax.set_ylim(0, 185000)
    ax.grid(axis="y", linestyle=":", color="#c5cdd5", zorder=0)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.tick_params(labelsize=9.5)
    ax.set_title(
        "Figure 4.  Average gas per state-changing function "
        "(solc 0.8.20, optimizer 200 runs).",
        fontsize=10.5, fontweight="bold", color=INK, pad=10)
    plt.tight_layout()
    fig.savefig(os.path.join(outdir, "fig6_gas.png"), dpi=210, bbox_inches="tight")
    plt.close()


# ---------------------------------------------------------------- main
def main():
    parser = argparse.ArgumentParser(description="Generate report diagrams.")
    parser.add_argument("--outdir", default="fig",
                        help="output directory (default: ./fig)")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    fig_arch(args.outdir)
    fig_fsm(args.outdir)
    fig_seq(args.outdir)
    fig_cei(args.outdir)
    fig_pack(args.outdir)
    fig_gas(args.outdir)
    print(f"6 figures written to {args.outdir}/")


if __name__ == "__main__":
    main()
