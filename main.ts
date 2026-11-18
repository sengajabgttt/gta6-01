// SOLMAR — the entrypoint that hands this game in to make.fun.
//
// When the grader runs `node main.ts`, this script gathers the two things
// the bounty wants — the playable game under game/ and the screenshots
// under screenshots/ — into the output directory, then asks the kit's
// dossier library to describe them in dossier.json. It reads nothing from
// the network and needs nothing beyond Node's own standard library.
//
// The output directory comes from MAKEFUN_OUTPUT_DIR, or /output when the
// variable is unset, which is where the grader expects the finished entry.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The dossier limits this bounty hands to buildDossier, taken from the
// kit's gate: how much source text the dossier may carry, how many
// screenshots and how big each one may be, and how large game/ may grow.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The folder this file lives in — the entry's own root, wherever the
// repository was checked out.
const entryRoot = dirname(fileURLToPath(import.meta.url));

// Where the finished entry goes: the grader's /output, or the directory
// MAKEFUN_OUTPUT_DIR names when we run the program by hand.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outputDir, { recursive: true });

// The game itself: every static file under game/, index.html included.
cpSync(join(entryRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// The screenshots, when the entry has any: the dossier's cover is the
// first file by name, so the names are left exactly as they are.
const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(entryRoot, 'screenshots'))) {
  cpSync(join(entryRoot, 'screenshots'), shotsDir, { recursive: true });
}

// The dossier, built from what now sits in the output directory and
// written beside it. The scorer rebuilds these same bytes from the same
// files, so this is the last thing written.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));
