// One command for laptop dev: pull Atlas -> local once (close the offline
// gap), then run the live mirror watcher alongside `next dev`. The app itself
// talks to Atlas (MONGODB_URI); local mongod is the mirror the watcher feeds.
import { spawn } from "node:child_process";

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: "inherit", shell: true, ...opts });
}

function runToCompletion(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = run(cmd, args);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

console.log("[dev:synced] pulling Atlas -> local...");
try {
  await runToCompletion("node", ["scripts/mirror-pull.mjs"]);
} catch (err) {
  console.error(`[dev:synced] initial pull failed: ${err.message}`);
  console.error("[dev:synced] continuing — check Atlas connectivity / MONGODB_URI");
}

console.log("[dev:synced] starting live mirror watcher + next dev...");
const watcher = run("node", ["scripts/mirror-watch.mjs"]);
const next = run("npx", ["--no-install", "next", "dev", "-p", "3101"]);

function shutdown() {
  watcher.kill();
  next.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
next.on("exit", (code) => {
  watcher.kill();
  process.exit(code ?? 0);
});
