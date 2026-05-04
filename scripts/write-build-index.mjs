import fs from "node:fs/promises";
import path from "node:path";

const outDir = process.argv[2];

if (!outDir) {
  throw new Error("Output directory is required.");
}

const sourcePath = path.resolve(outDir, "app.html");
const targetPath = path.resolve(outDir, "index.html");

const html = await fs.readFile(sourcePath, "utf8");
await fs.writeFile(targetPath, html);
