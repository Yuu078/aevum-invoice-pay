// Deploy PastiPay to Aevum Testnet (chain 44005) against the real tUSD8.
// Usage: node scripts/deploy.mjs
// Requires: agent wallet funded with tQDAY (gas) — claim at https://faucet.qday.info
// The private key is read from ~/workspace/wallets-testnet/evm-testnet.json
// and is never printed.
import { createPublicClient, createWalletClient, http, defineChain, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
export const TUSD8 = '0x456569838f1d43009A91ebA4263147Afd7233483';
export const aevum = defineChain({
  id: 44005,
  name: 'Aevum Testnet',
  nativeCurrency: { name: 'tQDAY', symbol: 'tQDAY', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-test.qday.info'] } },
  blockExplorers: { default: { name: 'Aevum Explorer', url: 'https://explorer-test.qday.info' } },
});

export function loadAgent() {
  const w = JSON.parse(fs.readFileSync(process.env.HOME + '/workspace/wallets-testnet/evm-testnet.json', 'utf8'));
  const pk = w.private_key.startsWith('0x') ? w.private_key : '0x' + w.private_key;
  return privateKeyToAccount(pk);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const account = loadAgent();
  const pub = createPublicClient({ chain: aevum, transport: http() });
  const wallet = createWalletClient({ account, chain: aevum, transport: http() });
  const bal = await pub.getBalance({ address: account.address });
  console.log('deployer:', account.address, '| tQDAY:', formatEther(bal));
  if (bal === 0n) {
    console.error('ERROR: no tQDAY for gas. Claim first at https://faucet.qday.info (one-time, needs captcha in a browser).');
    process.exit(1);
  }
  const art = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'PastiPay.json'), 'utf8'));
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [TUSD8] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  const deployment = {
    project: 'PastiPay',
    network: 'Aevum Testnet',
    chainId: 44005,
    rpc: 'https://rpc-test.qday.info',
    explorer: 'https://explorer-test.qday.info',
    token: TUSD8,
    tokenSymbol: 'tUSD8',
    contract: receipt.contractAddress,
    deployTx: hash,
    deployer: account.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(root, 'deployments.json'), JSON.stringify(deployment, null, 2));
  console.log('PastiPay deployed:', receipt.contractAddress);
  console.log('deploy tx:', hash);
  console.log('explorer:', `https://explorer-test.qday.info/address/${receipt.contractAddress}`);
}
