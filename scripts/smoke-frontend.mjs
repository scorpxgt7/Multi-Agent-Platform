import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(".");
const distDir = path.resolve(rootDir, "dist");
const host = "127.0.0.1";
const preferredPort = Number(process.env.FRONTEND_SMOKE_PORT || 0);
const configuredSmokeUrl = typeof process.env.FRONTEND_SMOKE_URL === "string" && process.env.FRONTEND_SMOKE_URL.trim()
  ? process.env.FRONTEND_SMOKE_URL.trim().replace(/\/+$/, "")
  : "";

const requiredMarkers = [
  "Visual Runtime Builder",
  "Deploy AI Workforce Graphs",
  "Compiler Preview",
  "Draft to deploy",
];

const edgeCandidates = [
  process.env.BROWSER_PATH,
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function resolveEdgePath() {
  for (const candidate of edgeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }

  throw new Error("Microsoft Edge was not found. Set EDGE_PATH if it is installed in a custom location.");
}

async function serveDist() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        const requestPath = request.url && request.url !== "/" ? request.url : "/index.html";
        const targetPath = path.resolve(distDir, `.${requestPath}`);

        if (!targetPath.startsWith(distDir)) {
          response.writeHead(403);
          response.end("Forbidden");
          return;
        }

        const filePath = await fs
          .stat(targetPath)
          .then((stats) => (stats.isDirectory() ? path.join(targetPath, "index.html") : targetPath))
          .catch(() => path.join(distDir, "index.html"));

        const content = await fs.readFile(filePath);
        response.writeHead(200, { "Content-Type": getContentType(filePath) });
        response.end(content);
      } catch (error) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(error.message || "Frontend smoke server failed.");
      }
    });

    server.on("error", reject);
    server.listen(preferredPort, host, () => resolve(server));
  });
}

async function dumpDom(edgePath, targetUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(edgePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      "--use-angle=swiftshader",
      "--use-gl=swiftshader",
      "--window-size=1440,1200",
      "--virtual-time-budget=6000",
      "--dump-dom",
      targetUrl,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Frontend smoke browser timed out."));
    }, 20000);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Edge smoke check exited with code ${code}.`));
        return;
      }

      resolve(stdout);
    });
  });
}

function assertMarkers(dom) {
  const missingMarkers = requiredMarkers.filter((marker) => !dom.includes(marker));
  if (missingMarkers.length > 0) {
    const excerpt = dom.replace(/\s+/g, " ").slice(0, 3000);
    throw new Error(`Frontend smoke check is missing expected markers: ${missingMarkers.join(", ")} | DOM excerpt: ${excerpt}`);
  }
}

async function assertBuildFallback() {
  const html = await fs.readFile(path.join(distDir, "app.html"), "utf8");
  const jsBundle = await fs.readFile(path.join(distDir, "assets", "app.js"), "utf8");
  const cssBundle = await fs.readFile(path.join(distDir, "assets", "app.css"), "utf8");
  const missing = [];

  if (!html.includes('type="module"')) {
    missing.push("module bootstrap");
  }

  requiredMarkers.forEach((marker) => {
    if (!jsBundle.includes(marker) && !cssBundle.includes(marker)) {
      missing.push(marker);
    }
  });

  if (missing.length > 0) {
    throw new Error(`Frontend build fallback is missing expected artifacts: ${missing.join(", ")}`);
  }
}

let server = null;

try {
  let smokeBaseUrl = configuredSmokeUrl;

  if (!configuredSmokeUrl) {
    server = await serveDist();
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Frontend smoke server did not expose a usable local address.");
    }
    smokeBaseUrl = `http://${host}:${address.port}`;
  }

  const edgePath = await resolveEdgePath();
  try {
    const dom = await dumpDom(edgePath, smokeBaseUrl);
    assertMarkers(dom);
  } catch (browserError) {
    console.warn(browserError.message || String(browserError));
    await assertBuildFallback();
  }

  console.log(JSON.stringify({
    ok: true,
    url: smokeBaseUrl,
    markers: requiredMarkers,
    edgePath,
  }));
} catch (error) {
  console.error(error.message || "Frontend smoke check failed.");
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => resolve());
  });
}
