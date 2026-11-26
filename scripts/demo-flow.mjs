// End-to-end demo flow on Aevum Testnet (run AFTER deploy.mjs):
//   1. A fresh payer wallet is created and funded from the agent wallet
//      (a little tQDAY for gas + the invoice amount in tUSD8).
//   2. The agent wallet (issuer/payee) creates invoice #N binding
//      amount + payee name "Sari Wulandari" to its address.
//   3. The payer first attempts payment with a WRONG confirmed name
//      (simulated) — the contract must reject it (PayeeNameMismatch).
//   4. The payer approves and pays with the CORRECT confirmed name.
//   5. The receipt is verified on-chain. All tx hashes are printed and
//      saved to demo-result.json.
// Usage: node scripts/demo-flow.mjs
import {
  createPublicClient, createWalletClient, http, parseUnits, formatUnits,
  keccak256, toBytes,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { aevum, TUSD8, loadAgent } from './deploy.mjs';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const dep = JSON.parse(fs.readFileSync(path.join(root, 'deployments.json'), 'utf8'));
const ppArt = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'PastiPay.json'), 'utf8'));
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 't', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const PAYEE_NAME = 'Sari Wulandari';
const AMOUNT = parseUnits('1', 6); // 1.00 tUSD8 demo invoice

const pub = createPublicClient({ chain: aevum, transport: http() });
const issuer = loadAgent();
const issuerWallet = createWalletClient({ account: issuer, chain: aevum, transport: http() });

// payer wallet: reuse if a previous demo created one, else generate + save (gitignored)
const payerFile = path.join(root, '.demo-payer.json');
let payer;
if (fs.existsSync(payerFile)) {
  payer = privateKeyToAccount(JSON.parse(fs.readFileSync(payerFile, 'utf8')).privateKey);
} else {
  const pk = generatePrivateKey();
  payer = privateKeyToAccount(pk);
  fs.writeFileSync(payerFile, JSON.stringify({ address: payer.address, privateKey: pk }, null, 2));
}
const payerWallet = createWalletClient({ account: payer, chain: aevum, transport: http() });
console.log('issuer (payee):', issuer.address);
console.log('payer:          ', payer.address);

const result = { contract: dep.contract, issuer: issuer.address, payer: payer.address, txs: {} };
const wait = (hash) => pub.waitForTransactionReceipt({ hash });

// --- fund payer: 0.05 tQDAY gas + AMOUNT tUSD8 ---
const payerGas = await pub.getBalance({ address: payer.address });
if (payerGas < parseUnits('0.02', 18)) {
  const h = await issuerWallet.sendTransaction({ to: payer.address, value: parseUnits('0.05', 18) });
  await wait(h);
  result.txs.fundGas = h;
  console.log('funded payer gas, tx:', h);
}
const payerToken = await pub.readContract({ address: TUSD8, abi: erc20, functionName: 'balanceOf', args: [payer.address] });
if (payerToken < AMOUNT) {
  const h = await issuerWallet.writeContract({ address: TUSD8, abi: erc20, functionName: 'transfer', args: [payer.address, AMOUNT] });
  await wait(h);
  result.txs.fundTokens = h;
  console.log('funded payer tUSD8, tx:', h);
}

// --- create invoice ---
const createHash = await issuerWallet.writeContract({
  address: dep.contract, abi: ppArt.abi, functionName: 'createInvoice',
  args: [payer.address, AMOUNT, 'Logo design + landing page (Nov 2026)', PAYEE_NAME],
});
const createReceipt = await wait(createHash);
result.txs.createInvoice = createHash;
const count = await pub.readContract({ address: dep.contract, abi: ppArt.abi, functionName: 'invoiceCount' });
const invoiceId = count - 1n;
result.invoiceId = invoiceId.toString();
console.log(`invoice #${invoiceId} created, tx:`, createHash);

// --- negative test: wrong confirmed name must be rejected ---
const wrongHash = keccak256(toBytes('Sari Wulandarii'));
try {
  await pub.simulateContract({
    address: dep.contract, abi: ppArt.abi, functionName: 'payInvoice',
    args: [invoiceId, wrongHash], account: payer.address,
  });
  console.error('FAIL: wrong-name payment was NOT rejected');
  process.exit(1);
} catch (e) {
  result.wrongNameRejected = true;
  console.log('wrong-name payment correctly rejected by contract (simulation):', (e.shortMessage || '').split('\n')[0]);
}

// --- approve + pay with correct name ---
const approveHash = await payerWallet.writeContract({ address: TUSD8, abi: erc20, functionName: 'approve', args: [dep.contract, AMOUNT] });
await wait(approveHash);
result.txs.approve = approveHash;

const rightHash = keccak256(toBytes(PAYEE_NAME));
const payHash = await payerWallet.writeContract({
  address: dep.contract, abi: ppArt.abi, functionName: 'payInvoice', args: [invoiceId, rightHash],
});
await wait(payHash);
result.txs.payInvoice = payHash;
console.log('invoice paid, tx:', payHash);

// --- verify ---
const inv = await pub.readContract({ address: dep.contract, abi: ppArt.abi, functionName: 'getInvoice', args: [invoiceId] });
const ok = await pub.readContract({ address: dep.contract, abi: ppArt.abi, functionName: 'verifyReceipt', args: [invoiceId, inv.receiptHash] });
result.status = Number(inv.status);
result.receiptHash = inv.receiptHash;
result.receiptVerified = ok;
console.log('final status:', result.status, '(1=Paid) | receipt verified:', ok, '| amount:', formatUnits(inv.amount, 6), 'tUSD8');
fs.writeFileSync(path.join(root, 'demo-result.json'), JSON.stringify(result, null, 2));
if (!ok) process.exit(1);
console.log('DEMO FLOW COMPLETE — see demo-result.json');
