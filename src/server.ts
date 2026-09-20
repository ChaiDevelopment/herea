import { config, resolveJwtSecret } from './config.js';
import { Database } from './db/database.js';
import { createApp } from './app.js';

const db = new Database(config.dataDir);
db.seedReferenceData();

export const app = createApp(db, { jwtSecret: resolveJwtSecret(config.dataDir), publicDir: config.publicDir });

// Di Vercel, server HTTP dikelola platform (dan file system-nya read-only, jadi penyimpanan JSON tidak cocok di sana).
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`HERÉA running on http://localhost:${config.port}`);
    console.log(`Data tersimpan di: ${config.dataDir}`);
  });
}
