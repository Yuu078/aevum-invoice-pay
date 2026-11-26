// Compile contracts with solc-js into artifacts/*.json (ABI + bytecode).
import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const files = ['PastiPay.sol', 'MockUSD8.sol'];
const input = {
  language: 'Solidity',
  sources: Object.fromEntries(
    files.map((f) => [f, { content: fs.readFileSync(path.join(root, 'contracts', f), 'utf8') }])
  ),
  settings: {
    evmVersion: 'shanghai',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) {
  for (const e of out.errors) {
    if (e.severity === 'error') {
      console.error(e.formattedMessage);
      process.exit(1);
    } else console.warn(e.formattedMessage);
  }
}
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
for (const f of files) {
  const name = f.replace('.sol', '');
  const c = out.contracts[f][name];
  fs.writeFileSync(
    path.join(root, 'artifacts', name + '.json'),
    JSON.stringify({ contractName: name, abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }, null, 2)
  );
  console.log('compiled', name, 'bytecode bytes:', c.evm.bytecode.object.length / 2);
}
