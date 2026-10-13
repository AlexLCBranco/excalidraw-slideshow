// Runs every end-to-end check against a fresh production build, in headless Edge.
//
//   npm run e2e:all
//
// Builds, serves dist/ with `vite preview` on :5181, runs each e2e script
// against it, then stops the server. Fails if the build or any script fails.
// Every script runs even after one fails, so one run shows everything broken.
import { spawn, spawnSync } from "node:child_process";

const BASE = "http://localhost:5181";
const SCRIPTS = ["e2e-xlsx", "e2e-drop", "e2e-additions", "e2e-slide", "e2e-zoom"];

// npm and npx run through a shell (on Windows they are .cmd files), as whole command lines.
const build = spawnSync("npm run build", { stdio: "inherit", shell: true });
if (build.status !== 0) {
  console.log("\nBuild failed");
  process.exit(1);
}

const server = spawn("npx vite preview --strictPort", { stdio: ["ignore", "pipe", "inherit"], shell: true });
await new Promise((resolve, reject) => {
  server.stdout.on("data", (chunk) => {
    if (chunk.toString().includes("5181")) resolve();
  });
  server.on("exit", (code) => reject(new Error(`vite preview exited (${code}); is :5181 already in use?`)));
});

const failed = [];
try {
  for (const name of SCRIPTS) {
    console.log(`\n=== ${name}`);
    const run = spawnSync("node", [`scripts/${name}.mjs`, BASE], { stdio: "inherit" });
    if (run.status !== 0) failed.push(name);
  }
} finally {
  stop(server);
}

console.log(failed.length ? `\nFailed: ${failed.join(", ")}` : `\nAll ${SCRIPTS.length} e2e scripts passed`);
process.exit(failed.length ? 1 : 0);

/** Stops the server and anything it started (on Windows, killing the shell alone would leave vite running). */
function stop(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}
