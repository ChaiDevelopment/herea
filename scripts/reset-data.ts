import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const dir = process.env.DATA_DIR ?? config.dataDir;
if (!process.argv.includes('--yes')) {
  console.log(`Ini akan memindahkan seluruh data di ${dir} ke folder cadangan lalu memulai dari nol.`);
  console.log('Jalankan ulang dengan: npm run data:reset -- --yes');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.log('Belum ada data.');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backup = path.join(path.dirname(dir), `${path.basename(dir)}.backup-${stamp}`);
fs.renameSync(dir, backup);
console.log(`Data lama dipindahkan ke ${backup}. Data baru dibuat saat server dijalankan.`);
