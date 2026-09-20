import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = 'replace-with-a-long-random-secret';

export const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');

/**
 * JWT_SECRET dari .env dipakai bila sudah diisi. Jika kosong (atau masih placeholder),
 * rahasia acak dibuat sekali lalu disimpan di data/.jwt_secret supaya aplikasi
 * langsung jalan tanpa konfigurasi dan token tetap valid setelah restart.
 */
export function resolveJwtSecret(dir = dataDir): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv !== PLACEHOLDER && fromEnv.length >= 16) return fromEnv;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '.jwt_secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret + '\n', { mode: 0o600 });
  console.log('JWT_SECRET belum diatur di .env — rahasia acak dibuat di data/.jwt_secret');
  return secret;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  publicDir: path.join(root, 'public'),
  dataDir,
};
