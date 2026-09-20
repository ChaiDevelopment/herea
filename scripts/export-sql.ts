/**
 * Membuat file SQL dari data/*.json untuk dimuat ke PostgreSQL yang sudah
 * dibuat dengan db/schema.sql.
 *
 *   npm run data:export-sql                 -> data/export/herea-data.sql
 *   npm run data:export-sql -- out.sql
 *   npm run data:export-sql -- --force      -> tetap ekspor meski ada masalah integritas
 *
 * Muat ke database:
 *   psql "$DATABASE_URL" -f db/schema.sql
 *   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/export/herea-data.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { checkDataset, readDataset } from '../src/db/integrity.js';
import { TABLES, type Col } from '../src/db/schema.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dir = process.env.DATA_DIR ?? config.dataDir;
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(dir, 'export', 'herea-data.sql'));

const data = readDataset(dir);
const problems = checkDataset(data);
if (problems.length && !force) {
  console.error(`Ekspor dibatalkan: ${problems.length} masalah integritas (jalankan "npm run data:check" untuk rinciannya).`);
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  process.exit(1);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function literal(col: Col, v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  switch (col.kind) {
    case 'int':
    case 'numeric':
      return String(v);
    case 'bool':
      return v ? 'TRUE' : 'FALSE';
    case 'jsonb':
      return `${q(JSON.stringify(v))}::jsonb`;
    case 'enum':
      return `${q(String(v))}::${col.enum}`;
    case 'enum[]': {
      const items = v as string[];
      return items.length ? `ARRAY[${items.map(q).join(', ')}]::${col.enum}[]` : `'{}'::${col.enum}[]`;
    }
    default:
      return q(String(v));
  }
}

const BATCH = 200;
const lines: string[] = [];
lines.push(
  '-- HERÉA data export (JSON -> PostgreSQL)',
  `-- Dibuat: ${new Date().toISOString()}`,
  '-- Jalankan SETELAH db/schema.sql pada database yang masih kosong.',
  '',
  'SET standard_conforming_strings = on;',
  'BEGIN;',
  '',
  '-- Pengaman: skrip ini hanya untuk database baru (hanya berisi seed dari schema.sql).',
  'DO $$',
  'BEGIN',
  '  IF EXISTS (SELECT 1 FROM users) THEN',
  "    RAISE EXCEPTION 'users is not empty - this script is meant for a fresh database';",
  '  END IF;',
  'END $$;',
  '',
  '-- symptoms & moods dari seed schema.sql memakai UUID acak. Data JSON memakai UUID tetap',
  '-- (agar konsisten dengan baris lain yang mereferensikannya), jadi seed diganti dengan versi ini.',
  'DELETE FROM symptoms;',
  'DELETE FROM moods;',
  '',
);

const counts: Array<[string, number]> = [];
for (const def of TABLES) {
  const rows = data[def.name];
  counts.push([def.name, rows.length]);
  if (!rows.length) continue;
  const cols = Object.keys(def.columns);
  lines.push(`-- ${def.name}: ${rows.length} rows`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    lines.push(`INSERT INTO ${def.name} (${cols.join(', ')}) VALUES`);
    lines.push(chunk.map((r) => `  (${cols.map((c) => literal(def.columns[c], r[c])).join(', ')})`).join(',\n') + ';');
  }
  lines.push('');
}

lines.push('COMMIT;', '', '-- Bandingkan dengan jumlah baris di file JSON:');
lines.push(counts.map(([t, n]) => `SELECT '${t}' AS table_name, COUNT(*) AS rows_in_db, ${n} AS rows_in_json FROM ${t}`).join('\nUNION ALL\n') + ';');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`SQL ditulis ke ${out}`);
for (const [t, n] of counts) if (n) console.log(`  ${t.padEnd(18)} ${n} rows`);
if (problems.length) console.warn(`\nPERINGATAN: ${problems.length} masalah integritas diabaikan (--force).`);
