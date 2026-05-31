// One-off: download OpenBeta's static Aug-2020 ratings data, aggregate
// per-user votes into per-climb averages, and write the result to
// data/curated-ratings.json. The output is committed to the repo and
// loaded by scripts/sync-climbs.mjs to attach ratings to each climb in
// the search index.
//
// Why one-off (not part of the weekly sync): the source data is static
// (a 2020 snapshot, not updated since), so re-downloading 30+ MB of
// state CSVs every week is wasted work. Re-run by hand only if OpenBeta
// publishes new curated data:
//
//   node scripts/extract-curated-ratings.mjs
//
// Output shape (compact, ~3 MB):
//   { "<mp_id>": [<avg_stars>, <vote_count>], ... }

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOULDER_CSV =
  "https://raw.githubusercontent.com/OpenBeta/climbing-data/main/curated_datasets/Boulder_Safety_and_Stars.csv";

// /ratings holds individual votes as one CSV.zip per US state. Listed
// explicitly so the script is reproducible without re-hitting the GitHub
// API; matches what's at github.com/OpenBeta/climbing-data/ratings.
const STATE_CODES = [
  "al", "ar", "az", "ca", "co", "ct", "de", "ga", "ia", "id", "il", "in",
  "ks", "ky", "ma", "md", "me", "mi", "mn", "mo", "nc", "nd", "nh", "nj",
  "nv", "ny", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut",
  "va", "vt", "wa", "wi", "wv",
];
const STATE_ZIP = (s) =>
  `https://github.com/OpenBeta/climbing-data/raw/main/ratings/${s}-ratings.csv.zip`;

const OUT_PATH = "data/curated-ratings.json";

// Minimal CSV row parser that handles the quoted "type" column in the
// per-state files (e.g. `"{'trad': True, 'tr': True}"` contains commas).
// Returns the row as an array of string cells.
function parseCsvRow(line) {
  const cells = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        buf += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  cells.push(buf);
  return cells;
}

async function downloadTo(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buf);
}

// route_id -> { sum, count }
const agg = new Map();

function addVote(mpId, stars) {
  if (!mpId || !Number.isFinite(stars)) return;
  const cur = agg.get(mpId) ?? { sum: 0, count: 0 };
  cur.sum += stars;
  cur.count += 1;
  agg.set(mpId, cur);
}

async function ingestStateVotes(workDir) {
  for (const code of STATE_CODES) {
    const zipPath = join(workDir, `${code}.zip`);
    const csvPath = join(workDir, `${code}-ratings.csv`);
    try {
      await downloadTo(STATE_ZIP(code), zipPath);
      // `unzip` ships on macOS/Linux runners; -o overwrites without prompt.
      execSync(`unzip -oq "${zipPath}" -d "${workDir}"`);
      const text = readFileSync(csvPath, "utf8");
      const lines = text.split(/\r?\n/);
      // header: users,ratings,route_id,name,grade,type
      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cells = parseCsvRow(line);
        const rating = Number(cells[1]);
        const routeId = cells[2];
        addVote(routeId, rating);
        added++;
      }
      console.log(`  ${code}: +${added} votes`);
    } catch (err) {
      console.warn(`  ${code}: skipped (${err.message})`);
    }
  }
}

async function ingestBoulderCsv(workDir) {
  // Boulder file is already pre-aggregated: ,ID,type,name,Vermin,stars,votes,safety
  const path = join(workDir, "boulder.csv");
  await downloadTo(BOULDER_CSV, path);
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = parseCsvRow(line);
    const mpId = cells[1];
    const stars = Number(cells[5]);
    const votes = Number(cells[6]);
    if (!mpId || !Number.isFinite(stars) || !Number.isFinite(votes)) continue;
    // Seed the aggregator with the pre-averaged data (sum = avg * votes).
    const existing = agg.get(mpId);
    if (existing) {
      // Per-state votes already covered this id; trust the per-state
      // aggregate (richer signal) and skip the seeded average.
      continue;
    }
    agg.set(mpId, { sum: stars * votes, count: votes });
    n++;
  }
  console.log(`boulder.csv: +${n} pre-aggregated entries`);
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), "anchorpoint-ratings-"));
  console.log(`Work dir: ${workDir}`);

  console.log("Ingesting per-state vote CSVs ...");
  await ingestStateVotes(workDir);

  console.log("Ingesting pre-aggregated boulder CSV ...");
  await ingestBoulderCsv(workDir);

  // Materialize: { mp_id: [avgStars, votes] }, rounded to 2 decimals so
  // the JSON is compact and stable across runs.
  const out = {};
  for (const [mpId, { sum, count }] of agg) {
    if (count < 1) continue;
    const avg = Math.round((sum / count) * 100) / 100;
    out[mpId] = [avg, count];
  }

  // Sort keys for a stable diff on re-run.
  const sorted = Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(OUT_PATH, JSON.stringify(sorted));
  const sizeKB = Math.round(Buffer.byteLength(JSON.stringify(sorted)) / 1024);
  console.log(`Wrote ${OUT_PATH}: ${Object.keys(sorted).length} climbs, ${sizeKB} KB`);

  rmSync(workDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
