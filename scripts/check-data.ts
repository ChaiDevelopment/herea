import { config } from '../src/config.js';
import { checkDataset, readDataset } from '../src/db/integrity.js';
import { TABLES } from '../src/db/schema.js';

const dir = process.env.DATA_DIR ?? config.dataDir;
const data = readDataset(dir);
const problems = checkDataset(data);

console.log(`Data: ${dir}`);
for (const t of TABLES) console.log(`  ${t.name.padEnd(18)} ${String(data[t.name].length).padStart(6)} rows`);

if (problems.length) {
  console.error(`\n${problems.length} masalah ditemukan:`);
  for (const p of problems.slice(0, 100)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK — semua baris sesuai schema.sql (tipe, enum, CHECK, UNIQUE, FK).');
