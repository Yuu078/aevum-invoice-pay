# PastiPay

**PastiPay is the first invoice on Aevum that cannot be paid to the wrong person.** Every invoice binds three things together on-chain — the amount, the payee's wallet, and the payee's *verified name* — and the smart contract refuses to execute payment until the payer has confirmed that name. Not with a warning dialog. Not with a checkbox. The payment transaction itself reverts unless the hash of the name the payer confirmed matches the hash registered on the invoice. Wrong-address payments are the #1 way freelancers and small businesses lose money in stablecoins: one pasted address, one typo, one swapped clipboard — and the funds are gone forever, with no bank to call. PastiPay makes that class of loss impossible by construction.

Built for the **Aevum Builder Challenge #1 (QDay)** — combining the **Invoice Payments** and **Confirmation of Payee** tracks into a single flow, settling in **tUSD8** on **Aevum Testnet (chain 44005)**.

> *Pasti* is Indonesian for "certain / definitely". PastiPay = pay with certainty.

## Who this is for

Freelancers and SMEs in emerging economies increasingly get paid in stablecoins across borders — a designer in Jakarta invoicing a client in Berlin, a developer in Lagos billing a startup in Singapore. They chose stablecoins for speed and cost, but inherited a risk cash never had: an address is not a name. Banks solved this decades ago with Confirmation of Payee (the UK alone prevented hundreds of millions in misdirected payments with it). Blockchains never got the memo — until now.

## How it works

1. **Issue.** The payee creates an invoice: payer address, amount in tUSD8, description, and their verified display name. The contract stores the name and `keccak256(name)` alongside the amount and the payee's wallet.
2. **Confirm.** When the payer opens the invoice, the UI presents one hero moment: the payee's name in 42-pixel type above the wallet address. The payer must *type the name in full* to unlock the Pay button — the same deliberate friction that makes CoP work in banking.
3. **Enforce.** The payer's client submits `payInvoice(id, keccak256(typedName))`. The contract compares it against the registered hash and **reverts on mismatch** (`PayeeNameMismatch`). The UI check is convenience; the contract check is law.
4. **Prove.** On payment, the contract stamps the invoice `Paid` and issues an on-chain receipt hash. Anyone can verify it with `verifyReceipt(id, hash)` — no account, no permission, no trusting either party's screenshot.

## Architecture

```
┌────────────────┐   createInvoice(payer, amount, desc, name)
│  Payee (issuer)│ ───────────────────────────────┐
└────────────────┘                                ▼
┌────────────────┐   payInvoice(id, nameHash)   ┌──────────────────┐
│     Payer      │ ───────────────────────────▶ │ PastiPay.sol     │
└────────────────┘   reverts unless hash matches │  · invoice store │
        ▲                                        │  · CoP gate      │
        │  type-to-confirm                       │  · receipt issuer│
┌───────┴────────┐                               └────────┬─────────┘
│  Web UI (app/) │ ◀── getInvoice / verifyReceipt         │ transferFrom
└────────────────┘                                        ▼
                                                   tUSD8 (ERC-20, 6 dp)
                                                   0x456569838f1d43009A91ebA4263147Afd7233483
```

- **`contracts/PastiPay.sol`** — the whole protocol: invoice lifecycle (Open → Paid / Cancelled), the Confirmation-of-Payee gate, receipt issuance and verification. No external dependencies, checks-effects-interactions throughout, custom errors.
- **`app/index.html`** — a zero-build static web UI (viem via CDN) with the Confirmation-of-Payee hero step. Read-only lookups work without a wallet.
- **`scripts/`** — `compile.mjs` (solc-js), `deploy.mjs` (Aevum deployment), `demo-flow.mjs` (full on-chain demo incl. the wrong-name rejection), `local-test.mjs` (the same flow proven on a local EVM).

## Safety & controls (by design)

- **Name-hash gate in the contract**, not just the UI — a modified client cannot bypass it.
- **Fixed payer**: only the address named on the invoice can pay it; only the issuer can cancel it.
- **State before transfer**: invoice is marked Paid before the token transfer executes (checks-effects-interactions).
- **Public receipts**: payment proof is a stored hash anyone can verify against the invoice's public fields.
- Testnet only, test tokens only. Compiled with `evmVersion: shanghai` for maximum chain compatibility.

## Quick start

```bash
npm install
npm run compile        # contracts -> artifacts/
npm run test:local     # full flow on a local EVM: wrong name reverts, right name pays

# On Aevum Testnet (one-time setup):
# 1. Claim tQDAY + tUSD8 for your wallet at https://faucet.qday.info
# 2. Point scripts at your key (see scripts/deploy.mjs), then:
npm run deploy         # deploys PastiPay against the real tUSD8, writes deployments.json
npm run demo           # creates invoice #N, rejects a wrong-name payment, pays, verifies receipt
```

Serve the UI with any static server, e.g. `npx serve app` — it reads the contract address from `deployments.json`.

## Deployment (Aevum Testnet)

| Item | Value |
| --- | --- |
| Contract | _pending — see `deployments.json` after `npm run deploy`_ |
| Token (tUSD8) | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| Network | Aevum Testnet, chain ID 44005, RPC `https://rpc-test.qday.info` |
| Explorer | https://explorer-test.qday.info |

Local end-to-end verification (same bytecode, local EVM): invoice created → wrong-name payment **reverted** → correct-name payment succeeded → 250.00 tUSD8 settled to the payee → `verifyReceipt` returned `true`. Reproduce with `npm run test:local`.

## Tech stack

Solidity 0.8.24 · viem 2 · solc-js · Node 24 · Aevum Testnet (EVM) · tUSD8 ERC-20

Third-party code: viem (MIT), solc-js (MIT), ganache (MIT, local testing only). All PastiPay code in this repository is original, written during the challenge build window (16 Nov – 11 Dec 2026).

## License

MIT — see [LICENSE](LICENSE).
