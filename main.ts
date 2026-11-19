// SOLMAR entrypoint — hands the game in to make.fun.
//
// This program runs on Node 22 with the standard library only. It takes
// the game/ and screenshots/ folders that sit beside this file, copies
// them into the output directory, and writes dossier.json there using
// the vendored make.fun library. Outside the grader, the environment
// variable MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The two runs the grader performs must produce identical bytes, so this
// program does no timestamping, no randomness and no network access —
// it only copies files and lets buildDossier summarise them.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const dossier = buildDossier(outDir, dossierOptions);
writeFileSync(join(outDir, 'dossier.json'), dossier);
