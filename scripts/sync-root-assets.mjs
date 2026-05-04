import fs from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve("docs/assets");
const targetDir = path.resolve("assets");

await fs.mkdir(targetDir, { recursive: true });

for (const fileName of ["app.js", "app.css"]) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);
  await fs.copyFile(sourcePath, targetPath);
}
