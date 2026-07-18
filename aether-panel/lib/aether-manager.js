const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFile } = require("child_process");
const net = require("net");

const ROOT = path.resolve(__dirname, "..");
const DEFAULTS_PATH = path.join(ROOT, "config.default.json");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const LOG_LIMIT = 400;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function loadConfig() {
  ensureDataDir();
  const defaults = readJson(DEFAULTS_PATH, {});
  const saved = readJson(CONFIG_PATH, {});
  return { ...defaults, ...saved };
}

function saveConfig(next) {
  ensureDataDir();
  const defaults = readJson(DEFAULTS_PATH, {});
  const merged = { ...defaults, ...next };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function resolvePaths(config) {
  const defaultCwd = path.resolve(ROOT, "..", "aether");
  const cwd = config.aetherCwd
    ? path.resolve(config.aetherCwd)
    : defaultCwd;
  const exe = config.aetherExe
    ? path.resolve(config.aetherExe)
    : path.join(cwd, process.platform === "win32" ? "aether.exe" : "aether");
  return { cwd, exe };
}

function buildArgs(config) {
  const args = ["--bind", config.bind || "127.0.0.1:1819"];

  switch (config.protocol) {
    case "wg":
      args.push("--wg");
      break;
    case "gool":
      args.push("--gool");
      break;
    case "masque":
      args.push("--masque");
      break;
    default: {
      const _exhaustive = config.protocol;
      void _exhaustive;
      args.push("--masque");
      break;
    }
  }

  switch (config.ipVersion) {
    case "6":
      args.push("-6");
      break;
    case "dual":
      args.push("--dual");
      break;
    case "4":
    default:
      args.push("-4");
      break;
  }

  const scan = config.scan || "balanced";
  args.push("--scan", scan);

  const noize = config.noize || "firewall";
  args.push("--noize", noize);

  if (config.quickReconnect) {
    args.push("--quick-reconnect");
  } else {
    args.push("--no-quick-reconnect");
  }

  if (config.protocol === "masque") {
    if (config.http2) args.push("--h2");
    if (config.fragment) {
      if (!config.http2) args.push("--h2");
      args.push("--fragment");
    }
  }

  if (config.peer && String(config.peer).trim()) {
    args.push("--peer", String(config.peer).trim());
  }

  return args;
}

function checkPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

function parseBind(bind) {
  const raw = String(bind || "127.0.0.1:1819");
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { host: "127.0.0.1", port: 1819 };
  return {
    host: raw.slice(0, idx) || "127.0.0.1",
    port: Number(raw.slice(idx + 1)) || 1819,
  };
}

function probeHost(host) {
  if (!host || host === "0.0.0.0" || host === "::" || host === "[::]") {
    return "127.0.0.1";
  }
  return host.replace(/^\[|\]$/g, "");
}

function getLanIPv4s() {
  const skip =
    /vethernet|hyper-v|wsl|docker|virtualbox|vmware|loopback|vbox|nordlynx|tailscale|bluetooth|host-only|npcap/i;
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (skip.test(name)) continue;
    for (const info of ifaces[name] || []) {
      const family = info.family === "IPv4" || info.family === 4;
      if (family && !info.internal) {
        out.push({ address: info.address, iface: name });
      }
    }
  }
  out.sort((a, b) => scoreLan(a.address, a.iface) - scoreLan(b.address, b.iface));
  return out;
}

function scoreLan(ip, iface = "") {
  let score = 50;
  if (/wi-?fi|wlan|wireless/i.test(iface)) score -= 20;
  if (/ethernet/i.test(iface) && !/virtual|vmware|vbox/i.test(iface)) score -= 8;
  if (ip.startsWith("192.168.")) score -= 5;
  else if (ip.startsWith("10.")) score -= 3;
  // common VM host-only ranges
  if (/^192\.168\.(56|57|58|59)\./.test(ip)) score += 30;
  if (/^192\.168\.(126|2)\./.test(ip)) score += 20;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) score += 15;
  return score;
}

// ponytail: CF loc codes only; expand if UI needs full names
const COUNTRY_NAMES = {
  DE: "آلمان",
  NL: "هلند",
  US: "آمریکا",
  GB: "بریتانیا",
  FR: "فرانسه",
  TR: "ترکیه",
  AE: "امارات",
  SG: "سنگاپور",
  JP: "ژاپن",
  IR: "ایران",
};

class AetherManager {
  constructor() {
    this.child = null;
    this.startedAt = null;
    this.logs = [];
    this.lastError = null;
    this.intentionalStop = false;
    this.egress = null;
    this._egressInflight = null;
    this.latency = null;
    this._latencyInflight = null;
    this.listeners = new Set();
  }

  pushLog(line) {
    const entry = {
      t: new Date().toISOString(),
      line: String(line).replace(/\r/g, "").trimEnd(),
    };
    if (!entry.line) return;
    this.logs.push(entry);
    if (this.logs.length > LOG_LIMIT) {
      this.logs.splice(0, this.logs.length - LOG_LIMIT);
    }
    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch {
        /* ignore */
      }
    }
  }

  onLog(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isManagedRunning() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  async findForeignAetherPids() {
    if (process.platform !== "win32") {
      return [];
    }
    return new Promise((resolve) => {
      execFile(
        "tasklist",
        ["/FI", "IMAGENAME eq aether.exe", "/FO", "CSV", "/NH"],
        { windowsHide: true },
        (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const pids = [];
          for (const line of stdout.split(/\r?\n/)) {
            const m = line.match(/"aether\.exe","(\d+)"/i);
            if (m) pids.push(Number(m[1]));
          }
          const mine = this.child?.pid;
          resolve(pids.filter((p) => p && p !== mine));
        }
      );
    });
  }

  async getStatus() {
    const config = loadConfig();
    const { host, port } = parseBind(config.bind);
    const localHost = probeHost(host);
    const socksUp = await checkPort(localHost, port);
    const foreign = await this.findForeignAetherPids();
    const managed = this.isManagedRunning();
    let phase = "disconnected";
    if (managed && socksUp) phase = "connected";
    else if (managed && !socksUp) phase = "connecting";
    else if (!managed && socksUp) phase = "external";
    else if (foreign.length) phase = "orphan";

    const lanShare = host === "0.0.0.0" || host === "::";
    const lanIps = getLanIPv4s();
    const preferred = String(config.shareIp || "").trim();
    const primaryLan =
      (preferred && lanIps.some((x) => x.address === preferred) && preferred) ||
      lanIps[0]?.address ||
      null;
    const shareUrl =
      lanShare && primaryLan ? `socks5://${primaryLan}:${port}` : null;

    if (socksUp) {
      const stale =
        !this.egress || Date.now() - (this.egress.checkedAt || 0) > 45_000;
      if (stale) this.refreshEgress().catch(() => {});
      const latStale =
        !this.latency || Date.now() - (this.latency.checkedAt || 0) > 4_000;
      if (latStale) this.refreshLatency().catch(() => {});
    } else if (!managed) {
      this.egress = null;
      this.latency = null;
    }

    return {
      phase,
      connected: socksUp,
      managed,
      pid: this.child?.pid || foreign[0] || null,
      foreignPids: foreign,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      socks: {
        host,
        port,
        localUrl: `socks5h://${localHost}:${port}`,
        url: lanShare && primaryLan
          ? `socks5h://${primaryLan}:${port}`
          : `socks5h://${localHost}:${port}`,
      },
      share: {
        lanShare,
        lanIps,
        primaryLan,
        shareUrl,
        port,
      },
      egress: this.egress,
      latency: this.latency,
      lastError: this.lastError,
      argsPreview: buildArgs(config),
      paths: resolvePaths(config),
      recentLogs: this.logs.slice(-40),
    };
  }

  async refreshLatency() {
    if (this._latencyInflight) return this._latencyInflight;
    this._latencyInflight = this.measureLatency()
      .then((latency) => {
        this.latency = latency;
        return latency;
      })
      .catch((err) => {
        this.latency = {
          ms: null,
          error: err.message,
          checkedAt: Date.now(),
        };
        return this.latency;
      })
      .finally(() => {
        this._latencyInflight = null;
      });
    return this._latencyInflight;
  }

  measureLatency() {
    const config = loadConfig();
    const { host, port } = parseBind(config.bind);
    const localHost = probeHost(host);
    const proxyUrl = `socks5h://${localHost}:${port}`;

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn(
        "curl.exe",
        [
          "-x",
          proxyUrl,
          "--max-time",
          "12",
          "-o",
          "NUL",
          "-sS",
          "-w",
          "%{time_starttransfer}",
          "https://www.cloudflare.com/cdn-cgi/trace",
        ],
        { windowsHide: true }
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString("utf8");
      });
      child.stderr.on("data", (d) => {
        err += d.toString("utf8");
      });
      child.on("error", (e) => reject(e));
      child.on("exit", (code) => {
        if (code !== 0) {
          const error = new Error(err.trim() || `latency probe failed (${code})`);
          error.code = "LATENCY_FAILED";
          reject(error);
          return;
        }
        const seconds = Number.parseFloat(String(out).trim());
        const ms = Number.isFinite(seconds)
          ? Math.round(seconds * 1000)
          : Date.now() - started;
        resolve({ ms, checkedAt: Date.now() });
      });
    });
  }

  async refreshEgress() {
    if (this._egressInflight) return this._egressInflight;
    this._egressInflight = this.testProxy()
      .then((result) => this.applyEgress(result))
      .finally(() => {
        this._egressInflight = null;
      });
    return this._egressInflight;
  }

  applyEgress(result) {
    const loc = result.parsed?.loc || "?";
    this.egress = {
      ip: result.parsed?.ip || null,
      countryCode: loc,
      country: COUNTRY_NAMES[loc] || loc,
      colo: result.parsed?.colo || null,
      warp: result.parsed?.warp === "on",
      checkedAt: Date.now(),
    };
    return this.egress;
  }

  async connect(overrides = {}) {
    if (this.isManagedRunning()) {
      const err = new Error("Aether is already running under this panel");
      err.code = "ALREADY_RUNNING";
      throw err;
    }

    const config = saveConfig({ ...loadConfig(), ...overrides });
    const { cwd, exe } = resolvePaths(config);

    if (!fs.existsSync(exe)) {
      const err = new Error(`aether binary not found: ${exe}`);
      err.code = "MISSING_BINARY";
      throw err;
    }

    const socks = parseBind(config.bind);
    if (await checkPort(probeHost(socks.host), socks.port)) {
      const err = new Error(
        `Port ${socks.port} is already in use. Disconnect the other Aether instance first.`
      );
      err.code = "PORT_BUSY";
      throw err;
    }

    const args = buildArgs(config);
    this.lastError = null;
    this.intentionalStop = false;
    this.egress = null;
    this.latency = null;
    this.pushLog(`$ ${path.basename(exe)} ${args.join(" ")}`);

    const child = spawn(exe, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.child = child;
    this.startedAt = Date.now();

    const onChunk = (buf) => {
      const text = buf.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) this.pushLog(line);
      }
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    child.on("error", (err) => {
      this.lastError = err.message;
      this.pushLog(`[panel] spawn error: ${err.message}`);
      this.child = null;
      this.startedAt = null;
      this.egress = null;
    });

    child.on("exit", (code, signal) => {
      this.pushLog(`[panel] aether exited code=${code} signal=${signal || "-"}`);
      if (!this.intentionalStop && code && code !== 0) {
        this.lastError = `aether exited with code ${code}`;
      }
      this.child = null;
      this.startedAt = null;
      this.egress = null;
      this.latency = null;
      this.intentionalStop = false;
    });

    return this.getStatus();
  }

  async disconnect() {
    const killed = [];
    this.intentionalStop = true;
    this.lastError = null;
    this.egress = null;
    this.latency = null;

    if (this.isManagedRunning()) {
      const pid = this.child.pid;
      await this.killTree(pid);
      killed.push(pid);
      this.child = null;
      this.startedAt = null;
      this.pushLog(`[panel] stopped managed process ${pid}`);
    }

    const foreign = await this.findForeignAetherPids();
    for (const pid of foreign) {
      await this.killTree(pid);
      killed.push(pid);
      this.pushLog(`[panel] stopped foreign aether.exe pid=${pid}`);
    }

    this.intentionalStop = false;
    return { killed, status: await this.getStatus() };
  }

  killTree(pid) {
    return new Promise((resolve) => {
      if (!pid) return resolve();
      if (process.platform === "win32") {
        execFile(
          "taskkill",
          ["/PID", String(pid), "/T", "/F"],
          { windowsHide: true },
          () => resolve()
        );
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* ignore */
        }
        resolve();
      }
    });
  }

  async testProxy() {
    const config = loadConfig();
    const { host, port } = parseBind(config.bind);
    const localHost = probeHost(host);
    const up = await checkPort(localHost, port);
    if (!up) {
      const err = new Error("SOCKS5 is not listening");
      err.code = "SOCKS_DOWN";
      throw err;
    }

    return new Promise((resolve, reject) => {
      const proxyUrl = `socks5h://${localHost}:${port}`;
      const child = spawn(
        "curl.exe",
        ["-x", proxyUrl, "--max-time", "25", "-sS", "https://www.cloudflare.com/cdn-cgi/trace"],
        { windowsHide: true }
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d.toString("utf8");
      });
      child.stderr.on("data", (d) => {
        err += d.toString("utf8");
      });
      child.on("error", (e) => reject(e));
      child.on("exit", (code) => {
        if (code !== 0) {
          const error = new Error(err.trim() || `curl exited ${code}`);
          error.code = "TEST_FAILED";
          reject(error);
          return;
        }
        const parsed = {};
        for (const line of out.trim().split(/\r?\n/)) {
          const i = line.indexOf("=");
          if (i > 0) parsed[line.slice(0, i)] = line.slice(i + 1);
        }
        resolve({ raw: out.trim(), parsed });
      });
    });
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  buildArgs,
  resolvePaths,
  parseBind,
  probeHost,
  getLanIPv4s,
  AetherManager,
  DATA_DIR,
  CONFIG_PATH,
};
