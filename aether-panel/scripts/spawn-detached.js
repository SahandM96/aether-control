// Detach aether-panel so parent shells/scripts can exit safely.
// Usage: node scripts/spawn-detached.js

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const panelDir = path.join(__dirname, "..");
const dataDir = path.join(panelDir, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const out = fs.openSync(path.join(dataDir, "panel-stdout.log"), "a");
const err = fs.openSync(path.join(dataDir, "panel-stderr.log"), "a");
const child = spawn(process.execPath, ["server.js"], {
  cwd: panelDir,
  detached: true,
  stdio: ["ignore", out, err],
  windowsHide: true,
  env: process.env,
});
child.unref();
fs.writeFileSync(path.join(dataDir, "panel.pid"), String(child.pid), "utf8");
process.stdout.write(String(child.pid));
