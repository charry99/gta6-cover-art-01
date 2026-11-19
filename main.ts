// Hand-in entry point: copies the app and screenshots into the output
// directory and writes the make.fun dossier describing the bundle.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(repoDir, 'app'), join(out, 'app'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
// buildDossier returns the dossier as bytes; write them through as-is.
writeFileSync(join(out, 'dossier.json'), dossier instanceof Uint8Array || typeof dossier === 'string' ? dossier : JSON.stringify(dossier, null, 2));
console.log('dossier written to', join(out, 'dossier.json'));
