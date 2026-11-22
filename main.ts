// Five Heists in the City of Aurelune — make.fun entrypoint (Node 22, stdlib only).
// The game is plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library, no network request).
// This program hands it in: it copies game/ and screenshots/ from beside this
// file to /output and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library.
//
// Serve it locally with any static server, e.g. `python3 -m http.server`
// from the game/ folder, then open http://localhost:8000.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: the game cannot be served');
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Pre-flight: the four staged screenshots must be present and within the cap.
const shots = readdirSync(join(here, 'screenshots')).filter((f) => /\.jpe?g$/i.test(f)).sort();
if (shots.length !== 4) throw new Error(`expected 4 screenshots, found ${shots.length}: ${shots.join(', ')}`);
for (const shot of shots) {
  const size = statSync(join(here, 'screenshots', shot)).size;
  if (size > 262144) throw new Error(`screenshot ${shot} is ${size} bytes, over the 256 KiB cap`);
}

// Count the game files so the dossier summary can state them.
let gameFiles = 0;
for (const entry of readdirSync(join(here, 'game'), { recursive: true })) {
  const p = join(here, 'game', entry);
  if (statSync(p).isFile()) gameFiles++;
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Five Heists in the City of Aurelune: ${gameFiles} game files, ${shots.length} screenshots -> ${out}`);
console.log('Heists: The Lantern Quay, The Paper Lantern Theatre, The Aurelune Bank,');
console.log('The Museum of Small Hours, The Gilded Spire — 5 heists, 18 guards, 33 treasures, 4 gadgets.');
