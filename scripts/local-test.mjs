// Local end-to-end proof of the PastiPay flow on an in-process EVM (ganache).
// Deploys MockUSD8 + PastiPay, then runs:
//   1. issuer creates an invoice binding amount + payee name to their wallet
//   2. payer tries to pay with the WRONG payee-name hash  -> must revert (PayeeNameMismatch)
//   3. payer pays with the CORRECT payee-name hash        -> succeeds, funds move
//   4. receipt verification                               -> verifyReceipt == true
// This validates the exact bytecode that will be deployed to Aevum Testnet.
import ganache from 'ganache';
import {
  createPublicClient, createWalletClient, custom, defineChain,
  parseUnits, formatUnits, keccak256, toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';

const art = (n) => JSON.parse(fs.readFileSync(new URL(`../artifacts/${n}.json`, import.meta.url), 'utf8'));

// deterministic local test keys (NOT the agent wallet; local chain only)
const issuer = privateKeyToAccount('0x' + '11'.repeat(32));
const payer = privateKeyToAccount('0x' + '22'.repeat(32));

const provider = ganache.provider({ chain: { chainId: 44005 }, logging: { quiet: true } });
const chain = defineChain({
  id: 44005, name: 'Local Aevum Sim',
  nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:7545'] } },
});
const transport = custom({
  request: async ({ method, params }) => provider.request({ method, params }),
});
const pub = createPublicClient({ chain, transport });
const issuerWallet = createWalletClient({ account: issuer, chain, transport });
const payerWallet = createWalletClient({ account: payer, chain, transport });

// fund local accounts from ganache's default unlocked account via transfer is
// unnecessary: ganache gives the provider accounts ETH; our derived accounts
// need ETH for gas -> use provider's first account to send some.
const [funder] = await provider.request({ method: 'eth_accounts' });
for (const a of [issuer.address, payer.address]) {
  await provider.request({ method: 'eth_sendTransaction', params: [{ from: funder, to: a, value: '0x' + parseUnits('10', 18).toString(16) }] });
}

// 1. deploy mock token + PastiPay
const mock = art('MockUSD8');
const mockHash = await issuerWallet.deployContract({ abi: mock.abi, bytecode: mock.bytecode });
const mockAddr = (await pub.waitForTransactionReceipt({ hash: mockHash })).contractAddress;
console.log('MockUSD8 deployed:', mockAddr);

const pp = art('PastiPay');
const ppHash = await issuerWallet.deployContract({ abi: pp.abi, bytecode: pp.bytecode, args: [mockAddr] });
const ppAddr = (await pub.waitForTransactionReceipt({ hash: ppHash })).contractAddress;
console.log('PastiPay deployed:  ', ppAddr);

// mint 1,000 mock tUSD8 to payer
await pub.waitForTransactionReceipt({
  hash: await issuerWallet.writeContract({ address: mockAddr, abi: mock.abi, functionName: 'mint', args: [payer.address, parseUnits('1000', 6)] }),
});

// 2. create invoice: 250.00 tUSD8, payee name "Sari Wulandari"
const PAYEE_NAME = 'Sari Wulandari';
const amount = parseUnits('250', 6);
const createHash = await issuerWallet.writeContract({
  address: ppAddr, abi: pp.abi, functionName: 'createInvoice',
  args: [payer.address, amount, 'Logo design + landing page (Nov 2026)', PAYEE_NAME],
});
await pub.waitForTransactionReceipt({ hash: createHash });
const inv = await pub.readContract({ address: ppAddr, abi: pp.abi, functionName: 'getInvoice', args: [0n] });
console.log('invoice #0 created: status', inv.status, '| amount', formatUnits(inv.amount, 6), '| payeeName', inv.payeeName);

// payer approves
await pub.waitForTransactionReceipt({
  hash: await payerWallet.writeContract({ address: mockAddr, abi: mock.abi, functionName: 'approve', args: [ppAddr, amount] }),
});

// 3. WRONG name -> must revert
const wrongHash = keccak256(toBytes('Sari Wulandarii'));
let reverted = false;
try {
  await payerWallet.writeContract({ address: ppAddr, abi: pp.abi, functionName: 'payInvoice', args: [0n, wrongHash] });
} catch (e) {
  reverted = true;
  console.log('wrong-name payment reverted as required:', (e.shortMessage || e.message).split('\n')[0]);
}
if (!reverted) { console.error('FAIL: wrong-name payment did NOT revert'); process.exit(1); }

// 4. CORRECT name -> pays
const rightHash = keccak256(toBytes(PAYEE_NAME));
const payHash = await payerWallet.writeContract({ address: ppAddr, abi: pp.abi, functionName: 'payInvoice', args: [0n, rightHash] });
await pub.waitForTransactionReceipt({ hash: payHash });
const invAfter = await pub.readContract({ address: ppAddr, abi: pp.abi, functionName: 'getInvoice', args: [0n] });
const issuerBal = await pub.readContract({ address: mockAddr, abi: mock.abi, functionName: 'balanceOf', args: [issuer.address] });
const okReceipt = await pub.readContract({ address: ppAddr, abi: pp.abi, functionName: 'verifyReceipt', args: [0n, invAfter.receiptHash] });
console.log('after payment: status', invAfter.status, '(1=Paid) | issuer balance', formatUnits(issuerBal, 6), 'tUSD8');
console.log('receiptHash:', invAfter.receiptHash);
console.log('verifyReceipt:', okReceipt);
if (invAfter.status !== 1 || !okReceipt || issuerBal !== amount) { console.error('FAIL: post-payment state wrong'); process.exit(1); }
console.log('\nLOCAL E2E: ALL CHECKS PASSED');
process.exit(0);
