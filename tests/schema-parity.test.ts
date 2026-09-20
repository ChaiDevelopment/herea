import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { TABLES } from '../src/db/schema.js';
import { ENUMS } from '../src/db/types.js';

const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

const sqlEnums = Object.fromEntries(
  [...sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([\s\S]*?)\);/g)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]),
);

interface SqlCol { type: string; array: boolean; len?: number; nullable: boolean; ref?: { table: string; onDelete: string }; unique: boolean }
function parseTables() {
  const out: Record<string, { cols: Record<string, SqlCol>; unique: string[] }> = {};
  for (const m of sql.matchAll(/CREATE TABLE (\w+) \(\n([\s\S]*?)\n\);/g)) {
    const cols: Record<string, SqlCol> = {};
    const unique: string[] = [];
    for (const line of m[2].split('\n')) {
      const t = /^ {2}UNIQUE \(([^)]+)\)/.exec(line);
      if (t) { unique.push(t[1].split(',').map((s) => s.trim()).join(',')); continue; }
      const c = /^ {2}([a-z_]+) ([A-Za-z_]+)(?:\((\d+)(?:,\d+)?\))?(\[\])?(.*?),?$/.exec(line);
      if (!c) continue;
      const rest = c[5];
      const ref = /REFERENCES (\w+)\(id\)(?: ON DELETE (CASCADE|RESTRICT|SET NULL))?/.exec(rest);
      cols[c[1]] = {
        type: c[2].toLowerCase(), array: !!c[4], len: c[3] ? Number(c[3]) : undefined,
        nullable: !/NOT NULL|PRIMARY KEY/.test(rest),
        ref: ref ? { table: ref[1], onDelete: ref[2] ?? 'NO ACTION' } : undefined,
        unique: /\bUNIQUE\b/.test(rest),
      };
      if (cols[c[1]].unique) unique.push(c[1]);
    }
    out[m[1]] = { cols, unique };
  }
  return out;
}
const parsed = parseTables();
const KIND: Record<string, string> = { uuid: 'uuid', varchar: 'text', text: 'text', date: 'date', timestamptz: 'timestamptz', smallint: 'int', integer: 'int', numeric: 'numeric', boolean: 'bool', jsonb: 'jsonb' };

describe('schema.sql parity', () => {
  it('has every enum with identical values', () => {
    expect(Object.keys(sqlEnums).sort()).toEqual(Object.keys(ENUMS).sort());
    for (const [name, values] of Object.entries(sqlEnums)) expect([...ENUMS[name as keyof typeof ENUMS]]).toEqual(values);
  });

  it('has the same tables, in an insert-safe order', () => {
    expect(TABLES.map((t) => t.name)).toEqual(Object.keys(parsed));
  });

  for (const def of TABLES) {
    it(`table ${def.name} matches columns, types, nullability, FKs and UNIQUE`, () => {
      const sqlTable = parsed[def.name];
      expect(Object.keys(def.columns)).toEqual(Object.keys(sqlTable.cols)); // nama + urutan kolom
      for (const [name, col] of Object.entries(def.columns)) {
        const s = sqlTable.cols[name];
        const label = `${def.name}.${name}`;
        const isEnum = s.type in sqlEnums;
        expect([label, col.kind]).toEqual([label, isEnum ? (s.array ? 'enum[]' : 'enum') : KIND[s.type]]);
        if (isEnum) expect([label, col.enum]).toEqual([label, s.type]);
        expect([label, !!col.nullable]).toEqual([label, s.nullable]);
        if (s.type === 'varchar') expect([label, col.max]).toEqual([label, s.len]);
        expect([label, col.ref?.table]).toEqual([label, s.ref?.table]);
        if (s.ref) expect([label, col.ref!.onDelete]).toEqual([label, s.ref.onDelete]);
      }
      expect(def.unique.map((u) => u.join(',')).sort()).toEqual([...sqlTable.unique].sort());
    });
  }
});
