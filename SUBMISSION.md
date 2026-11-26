# DoraHacks Submission — Aevum Builder Challenge #1 (QDay)

Copy-paste source for the submission form at https://dorahacks.io/hackathon/qday
(Submission itself must be done from the user's DoraHacks account — do not submit from the agent.)

---

**Project name:** PastiPay

**Tagline:** The stablecoin invoice that can't be paid to the wrong person.

**Tracks:** Invoice Payments + Confirmation of Payee

**Short description (for the card):**
PastiPay binds the amount, the wallet, and the payee's verified name into one on-chain invoice — and the contract refuses payment until the payer confirms that name. The first Confirmation-of-Payee invoice flow on Aevum, settling in tUSD8.

**Full description:**

Wrong-address payments are the #1 way freelancers and small businesses lose money in stablecoins. One pasted address, one typo, one swapped clipboard — and the funds are gone forever, with no bank to call. Banks solved this decades ago with Confirmation of Payee. Blockchains never did. PastiPay brings it on-chain.

PastiPay is a stablecoin invoicing protocol on Aevum Testnet (chain 44005), settling in tUSD8, built for the freelancers and SMEs in emerging economies who increasingly get paid in stablecoins across borders.

How it works:
1. The payee issues an invoice: payer address, amount, description, and their verified display name. The contract stores the name and keccak256(name) bound to the payee's wallet.
2. The payer opens the invoice and faces one deliberate hero moment: the payee's name in large type above the address. They must type the name in full to unlock the Pay button.
3. Payment is enforced by the contract, not the UI: payInvoice requires the hash of the payer-confirmed name and reverts (PayeeNameMismatch) unless it matches the invoice. A modified client cannot bypass it.
4. On payment, the invoice is stamped Paid and an on-chain receipt hash is issued. Anyone can verify it with verifyReceipt — no account, no permission, no trusting screenshots.

What we built (all code written during the build window):
- contracts/PastiPay.sol — invoice lifecycle, CoP gate, receipt issuance/verification. No external dependencies; checks-effects-interactions; custom errors.
- app/ — a zero-build static web UI (viem) whose centerpiece is the Confirmation-of-Payee step.
- scripts/ — compile (solc-js), deploy, a full on-chain demo flow that also demonstrates the wrong-name rejection, and a local EVM test that runs the identical bytecode end-to-end (wrong name reverts → right name pays → receipt verifies).

Why it matters: Confirmation of Payee prevented hundreds of millions in misdirected payments in UK banking alone. Stablecoin payments — faster and cheaper, but irreversible and nameless — need it even more. PastiPay shows it can be enforced by a smart contract in a single transaction flow, on Aevum, today.

**GitHub repository:** https://github.com/Yuu078/aevum-invoice-pay

**Smart contract (Aevum Testnet):** see `deployments.json` in the repo (address + deploy tx + explorer link are written there by the deploy script).

**Demo:** `npm install && npm run test:local` runs the complete flow locally with zero setup; on testnet, `npm run deploy && npm run demo` reproduces the live proof (invoice created → wrong-name payment rejected → correct-name payment settles → receipt verified). The web UI in `app/` can be served with any static file server.

**Team:** Solo builder.

**License:** MIT

---

## Status note (internal, do not paste)

- Contract compiled; full flow PASSED on local EVM with the exact deployment bytecode.
- LIVE ON AEVUM TESTNET (26 Nov 2026): faucet claimed via the official QDay Discord `/faucet` (1 tQDAY + 5 tUSD8 to `0x749C9Ccd67c3599A46c1E5C766a18d791c0c546B`; web faucet was unusable — it requires a mainnet ETH/USDT/USDC balance). Contract deployed: `0x1683e898a8a99092369d95757f8c451aaaaffbf2` (deploy tx `0xde29cdddfb944641b93e14e1b342c60ea05ec4014261b22128ea2b361e689edf`). On-chain demo PASSED end-to-end: invoice #0 created (`0x3075e51bc9c86d0e272a49cae4877fd811811a705eb80ffae3bcaa2b6bc7a168`) → wrong-name payment rejected by the contract → correct-name payment settled (`0xd2da984180ccb4932a360a95257eeff3cedb9c02505d1cb83878cf4540ead5f6`) → receipt verified on-chain. Full record in `demo-result.json` / `deployments.json`. Remaining step: paste the contract address + tx hashes into the DoraHacks submission form (needs the user's DoraHacks account) before 11 Dec 15:00 WIB.
- Top-5 finalists must present live on Demo Day (15 Dec, 06:00 UTC) — a human must attend; pre-recorded video is not accepted.
