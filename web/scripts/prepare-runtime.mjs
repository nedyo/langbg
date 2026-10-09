// Prepares the self-hosted browser runtime. Nothing is fetched from a CDN at runtime.
//
//   web/public/pyodide/<version>/*  Pyodide runtime (from the pinned npm package) + fontTools wheel;
//                                   versioned so it can be cached for a year (see public/_headers)
//   web/public/langbg-*.whl         wheel of core/, rebuilt on every run
//   web/public/runtime.json         what the worker installs (wheel URLs + sha256)
//
// Idempotent: only missing or changed files are copied/downloaded.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Bump together with the "pyodide" devDependency in package.json (exact version).
const PYODIDE_VERSION = "314.0.7";
const PYODIDE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(webDir, "..", "core");
const publicDir = join(webDir, "public");
const pyodideRoot = join(publicDir, "pyodide");
const pyodideOut = join(pyodideRoot, PYODIDE_VERSION);

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const log = (msg) => console.log(`[runtime] ${msg}`);

function fail(msg) {
  console.error(`[runtime] ERROR: ${msg}`);
  process.exit(1);
}

function copyPyodide() {
  const pkgDir = join(webDir, "node_modules", "pyodide");
  if (!existsSync(pkgDir)) fail("node_modules/pyodide is missing. Run `pnpm install` first.");
  const installed = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
  if (installed !== PYODIDE_VERSION) {
    fail(`pyodide ${installed} is installed but this script pins ${PYODIDE_VERSION}. Keep package.json and PYODIDE_VERSION in sync.`);
  }
  mkdirSync(pyodideOut, { recursive: true });
  // Anything else under public/pyodide/ is another version (or the old unversioned layout).
  for (const old of readdirSync(pyodideRoot)) {
    if (old !== PYODIDE_VERSION) rmSync(join(pyodideRoot, old), { recursive: true, force: true });
  }
  let copied = 0;
  for (const name of PYODIDE_FILES) {
    const from = join(pkgDir, name);
    const to = join(pyodideOut, name);
    if (!existsSync(from)) fail(`pyodide ${PYODIDE_VERSION} does not contain ${name}.`);
    if (!existsSync(to) || statSync(to).size !== statSync(from).size) {
      copyFileSync(from, to);
      copied++;
    }
  }
  log(`pyodide ${PYODIDE_VERSION}: ${copied} of ${PYODIDE_FILES.length} files copied`);
}

// The browser must run the exact fontTools that the tests run, so take the pure-Python
// wheel (URL + sha256) from core/uv.lock rather than the older one bundled with Pyodide.
function fonttoolsFromLock() {
  const lock = readFileSync(join(coreDir, "uv.lock"), "utf8");
  const m = lock.match(/url = "(https:\/\/[^"]*\/(fonttools-[^/"]+-py3-none-any\.whl))", hash = "sha256:([0-9a-f]{64})"/);
  if (!m) fail("No fonttools py3-none-any wheel found in core/uv.lock.");
  return { url: m[1], name: m[2], sha256: m[3] };
}

async function fetchFonttools() {
  const wheel = fonttoolsFromLock();
  const target = join(pyodideOut, wheel.name);
  for (const old of readdirSync(pyodideOut)) {
    if (old.startsWith("fonttools-") && old !== wheel.name) rmSync(join(pyodideOut, old));
  }
  if (existsSync(target) && sha256(readFileSync(target)) === wheel.sha256) {
    log(`${wheel.name}: up to date`);
  } else {
    log(`downloading ${wheel.name}`);
    const res = await fetch(wheel.url);
    if (!res.ok) fail(`Download failed (${res.status}): ${wheel.url}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (sha256(data) !== wheel.sha256) fail(`sha256 mismatch for ${wheel.name}; refusing to use it.`);
    writeFileSync(target, data);
  }
  return { name: "fonttools", file: `pyodide/${PYODIDE_VERSION}/${wheel.name}`, sha256: wheel.sha256 };
}

function buildCoreWheel() {
  for (const old of readdirSync(publicDir)) {
    if (/^langbg-.*\.whl$/.test(old)) rmSync(join(publicDir, old));
  }
  try {
    execFileSync("uv", ["build", "--wheel", "--quiet", "--no-create-gitignore", "--out-dir", publicDir, coreDir], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch (e) {
    fail(`\`uv build\` failed (is uv installed and on PATH?): ${e.message}`);
  }
  const built = readdirSync(publicDir).filter((f) => /^langbg-.*-py3-none-any\.whl$/.test(f));
  if (built.length !== 1) fail(`Expected exactly one langbg wheel in public/, found: ${built.join(", ") || "none"}`);
  log(`built ${built[0]}`);
  return { name: "langbg", file: built[0], sha256: sha256(readFileSync(join(publicDir, built[0]))) };
}

copyPyodide();
const wheels = [await fetchFonttools(), buildCoreWheel()];
const manifest = {
  pyodide: PYODIDE_VERSION,
  // Relative to the site base; the hash in the query string busts caches when a wheel changes.
  wheels: wheels.map((w) => ({ name: w.name, url: `${w.file}?v=${w.sha256.slice(0, 8)}`, sha256: w.sha256 })),
};
writeFileSync(join(publicDir, "runtime.json"), JSON.stringify(manifest, null, 2) + "\n");
log("runtime.json written");
