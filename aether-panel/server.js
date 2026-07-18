const path = require("path");
const express = require("express");
const QRCode = require("qrcode");
const {
  loadConfig,
  saveConfig,
  AetherManager,
  buildArgs,
  parseBind,
} = require("./lib/aether-manager");

const manager = new AetherManager();
const app = express();

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

function sendError(res, err, fallbackStatus = 500) {
  const status =
    err.code === "ALREADY_RUNNING" || err.code === "PORT_BUSY"
      ? 409
      : err.code === "MISSING_BINARY" || err.code === "SOCKS_DOWN"
        ? 400
        : fallbackStatus;
  res.status(status).json({
    ok: false,
    error: err.message,
    code: err.code || "ERROR",
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "aether-panel" });
});

app.get("/api/status", async (_req, res) => {
  try {
    res.json({ ok: true, status: await manager.getStatus(), config: loadConfig() });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/config", (_req, res) => {
  const config = loadConfig();
  res.json({
    ok: true,
    config,
    argsPreview: buildArgs(config),
  });
});

app.put("/api/config", (req, res) => {
  try {
    const body = req.body || {};
    const allowed = [
      "bind",
      "protocol",
      "ipVersion",
      "scan",
      "noize",
      "http2",
      "fragment",
      "quickReconnect",
      "peer",
      "shareIp",
      "aetherExe",
      "aetherCwd",
      "panelHost",
      "panelPort",
    ];
    const current = loadConfig();
    const next = { ...current };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        next[key] = body[key];
      }
    }

    if (!["masque", "wg", "gool"].includes(next.protocol)) {
      return res.status(400).json({ ok: false, error: "Invalid protocol" });
    }
    if (!["4", "6", "dual"].includes(String(next.ipVersion))) {
      return res.status(400).json({ ok: false, error: "Invalid ipVersion" });
    }
    if (!["turbo", "balanced", "thorough", "stealth"].includes(next.scan)) {
      return res.status(400).json({ ok: false, error: "Invalid scan mode" });
    }

    const saved = saveConfig(next);
    res.json({ ok: true, config: saved, argsPreview: buildArgs(saved) });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/connect", async (req, res) => {
  try {
    if (req.body && Object.keys(req.body).length) {
      const current = loadConfig();
      saveConfig({ ...current, ...req.body });
    }
    const status = await manager.connect();
    res.json({ ok: true, status });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/disconnect", async (_req, res) => {
  try {
    const result = await manager.disconnect();
    res.json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/test", async (_req, res) => {
  try {
    const result = await manager.testProxy();
    const egress = manager.applyEgress(result);
    res.json({ ok: true, ...result, egress });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/egress/refresh", async (_req, res) => {
  try {
    const egress = await manager.refreshEgress();
    res.json({ ok: true, egress, status: await manager.getStatus() });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/latency/refresh", async (_req, res) => {
  try {
    const latency = await manager.refreshLatency();
    res.json({ ok: true, latency, status: await manager.getStatus() });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/share/lan", async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const preferredIp =
      typeof req.body?.ip === "string" && req.body.ip.trim()
        ? req.body.ip.trim()
        : null;
    const current = loadConfig();
    const { port } = parseBind(current.bind);
    const nextBind = enabled ? `0.0.0.0:${port}` : `127.0.0.1:${port}`;
    const saved = saveConfig({
      ...current,
      bind: nextBind,
      shareIp: enabled ? preferredIp || current.shareIp || "" : "",
    });
    const wasRunning =
      manager.isManagedRunning() || (await manager.getStatus()).connected;

    if (wasRunning) {
      await manager.disconnect();
      await manager.connect();
    }

    const status = await manager.getStatus();
    let qrDataUrl = null;
    if (status.share?.shareUrl) {
      qrDataUrl = await QRCode.toDataURL(status.share.shareUrl, {
        margin: 1,
        width: 280,
        color: { dark: "#0c1210", light: "#e7f2ea" },
      });
    }

    res.json({
      ok: true,
      config: saved,
      status,
      qrDataUrl,
      note: enabled
        ? "SOCKS روی شبکه LAN باز شد. اگر موبایل وصل نشد، پورت را در Firewall ویندوز باز کن."
        : "اشتراک LAN خاموش شد (فقط localhost).",
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/share/qr", async (_req, res) => {
  try {
    const status = await manager.getStatus();
    if (!status.share?.shareUrl) {
      return res.status(400).json({
        ok: false,
        error: "LAN IP پیدا نشد یا اشتراک فعال نیست",
        code: "NO_SHARE_URL",
        status,
      });
    }
    const qrDataUrl = await QRCode.toDataURL(status.share.shareUrl, {
      margin: 1,
      width: 280,
      color: { dark: "#0c1210", light: "#e7f2ea" },
    });
    res.json({
      ok: true,
      shareUrl: status.share.shareUrl,
      qrDataUrl,
      share: status.share,
      latency: status.latency,
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  for (const entry of manager.logs.slice(-80)) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  const unsubscribe = manager.onLog((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

const bootConfig = loadConfig();
const host = bootConfig.panelHost || "127.0.0.1";
const port = Number(bootConfig.panelPort) || 3847;

const server = app.listen(port, host, () => {
  console.log(`[aether-panel] http://${host}:${port}`);
  console.log(`[aether-panel] managing binary via config in data/config.json`);
});

async function shutdown() {
  try {
    if (manager.isManagedRunning()) {
      await manager.disconnect();
    }
  } finally {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
