import fs from "node:fs/promises";
import path from "node:path";

const sourceArg = process.argv[2];
const targetArg = process.argv[3];

const sourceDir = path.resolve(sourceArg || "dist/assets");
const targetDir = path.resolve(targetArg || "assets");

await fs.mkdir(targetDir, { recursive: true });

for (const fileName of ["app.js", "app.css"]) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);
  await fs.copyFile(sourcePath, targetPath);
}
