// Handoff entry: copies the static app and screenshots into the output
// folder and writes the dossier the competition expects.
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

await mkdir(out, { recursive: true });
await cp(join(root, "app"), join(out, "app"), { recursive: true });
await cp(join(root, "screenshots"), join(out, "screenshots"), { recursive: true });
await writeFile(join(out, "dossier.json"), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
}));
console.log(`dossier written to ${out}`);
