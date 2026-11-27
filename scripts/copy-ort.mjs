// Copies the cut-out tool's runtime (onnxruntime-web) from node_modules into public/ort, so the
// ERP serves it from its own origin instead of a CDN. Runs before `next dev` and `next build`.
// public/ort is generated, not committed (see .gitignore).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "ort");
const files = ["ort.wasm.min.js", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

if (!existsSync(from)) {
  console.warn("copy-ort: onnxruntime-web is not installed; the cut-out tool will not work.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`copy-ort: ${files.length} files to public/ort`);
