import fs from 'node:fs';
import path from 'node:path';
import { TABLES } from './schema.js';
import { DbError, validateShape } from './database.js';
import type { TableName } from './types.js';

export type Dataset = Record<TableName, Record<string, unknown>[]>;

export function readDataset(dir: string): Dataset {
  const data = {} as Dataset;
  for (const def of TABLES) {
    const file = path.join(dir, `${def.name}.json`);
    if (!fs.existsSync(file)) {
      data[def.name] = [];
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
    if (!Array.isArray(parsed)) throw new Error(`${file}: root must be an array`);
    data[def.name] = parsed;
  }
  return data;
}

/** Periksa seluruh dataset terhadap aturan schema.sql: tipe, NOT NULL, enum, CHECK, UNIQUE, dan FK. */
export function checkDataset(data: Dataset): string[] {
  const problems: string[] = [];
  const ids = Object.fromEntries(TABLES.map((t) => [t.name, new Set(data[t.name].map((r) => r.id as string))])) as Record<TableName, Set<string>>;

  for (const def of TABLES) {
    const rows = data[def.name];
    const seen = new Map<string, number>();
    rows.forEach((row, i) => {
      const label = `${def.name}[${i}] id=${String(row.id)}`;
      try {
        validateShape(def, row);
      } catch (e) {
        problems.push(`${label}: ${(e as DbError).message}`);
      }
      for (const [col, spec] of Object.entries(def.columns)) {
        if (spec.ref && row[col] != null && !ids[spec.ref.table].has(row[col] as string)) {
          problems.push(`${label}: ${col} -> ${spec.ref.table} ${String(row[col])} does not exist`);
        }
      }
      for (const cols of [['id'], ...def.unique]) {
        if (cols.some((c) => row[c] == null)) continue;
        const key = cols.join(',') + '=' + cols.map((c) => JSON.stringify(row[c])).join('|');
        if (seen.has(key)) problems.push(`${label}: duplicate ${cols.join('+')} (also row ${seen.get(key)})`);
        else seen.set(key, i);
      }
    });
  }
  return problems;
}
