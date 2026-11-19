// Hand-in entry point: copies the static app and the screenshots into the
// output directory and asks the make.fun helper to build the dossier that
// describes the entry, within the competition's size caps.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(repoDir, 'app'), join(out, 'app'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = await buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

// buildDossier may hand back raw bytes instead of a string; write either
// through untouched so the dossier lands exactly as produced.
writeFileSync(join(out, 'dossier.json'), dossier as any);
