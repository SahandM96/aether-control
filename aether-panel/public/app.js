const phaseLabels = {
  connected: "متصل",
  connecting: "در حال اتصال…",
  disconnected: "قطع",
  external: "خارج از پنل",
  orphan: "پروسه یتیم",
};

const form = document.getElementById("configForm");
const statusChip = document.getElementById("statusChip");
const statusLabel = document.getElementById("statusLabel");
const socksUrl = document.getElementById("socksUrl");
const egressIp = document.getElementById("egressIp");
const egressCountry = document.getElementById("egressCountry");
const egressMeta = document.getElementById("egressMeta");
const latencyValue = document.getElementById("latencyValue");
const pidValue = document.getElementById("pidValue");
const uptimeValue = document.getElementById("uptimeValue");
const hint = document.getElementById("hint");
const argsPreview = document.getElementById("argsPreview");
const logView = document.getElementById("logView");
const testOut = document.getElementById("testOut");
const toast = document.getElementById("toast");
const panelMeta = document.getElementById("panelMeta");
const shareUrlEl = document.getElementById("shareUrl");
const lanIpsEl = document.getElementById("lanIps");
const qrImage = document.getElementById("qrImage");
const qrPlaceholder = document.getElementById("qrPlaceholder");
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnTest = document.getElementById("btnTest");
const btnRefreshEgress = document.getElementById("btnRefreshEgress");
const btnSave = document.getElementById("btnSave");
const btnClearLogs = document.getElementById("btnClearLogs");
const btnToggleLan = document.getElementById("btnToggleLan");
const btnCopyShare = document.getElementById("btnCopyShare");
const btnRefreshQr = document.getElementById("btnRefreshQr");
const btnRefreshLatency = document.getElementById("btnRefreshLatency");

const shareIpSelect = document.getElementById("shareIpSelect");
let shareIpWired = false;

function syncShareIpSelect(share, config) {
  const ips = share.lanIps || [];
  const current = config?.shareIp || share.primaryLan || "";
  const options = ips
    .map(
      (x) =>
        `<option value="${x.address}" ${x.address === current ? "selected" : ""}>${x.address} (${x.iface})</option>`
    )
    .join("");
  shareIpSelect.innerHTML =
    options || `<option value="">IP شبکه پیدا نشد</option>`;
  if (!shareIpWired) {
    shareIpWired = true;
    shareIpSelect.addEventListener("change", async () => {
      try {
        const ip = shareIpSelect.value;
        await api("/api/config", {
          method: "PUT",
          body: JSON.stringify({ shareIp: ip }),
        });
        lastQrUrl = null;
        await refresh();
        showToast(`QR روی ${ip}`);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }
}

function showToast(message, isError = false) {
  toast.hidden = false;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function formatUptime(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fillForm(config) {
  form.protocol.value = config.protocol || "masque";
  form.ipVersion.value = config.ipVersion || "4";
  form.scan.value = config.scan || "balanced";
  form.noize.value = config.noize || "firewall";
  form.bind.value = config.bind || "127.0.0.1:1819";
  form.peer.value = config.peer || "";
  form.http2.checked = Boolean(config.http2);
  form.fragment.checked = Boolean(config.fragment);
  form.quickReconnect.checked = config.quickReconnect !== false;
}

function readForm() {
  return {
    protocol: form.protocol.value,
    ipVersion: form.ipVersion.value,
    scan: form.scan.value,
    noize: form.noize.value,
    bind: form.bind.value.trim(),
    peer: form.peer.value.trim(),
    http2: form.http2.checked,
    fragment: form.fragment.checked,
    quickReconnect: form.quickReconnect.checked,
  };
}

function setQr(dataUrl, url) {
  if (dataUrl) {
    qrImage.src = dataUrl;
    qrImage.hidden = false;
    qrPlaceholder.hidden = true;
    lastQrUrl = url;
  } else {
    qrImage.hidden = true;
    qrImage.removeAttribute("src");
    qrPlaceholder.hidden = false;
    qrPlaceholder.textContent = "برای ساخت QR، اشتراک LAN را روشن کن";
    lastQrUrl = null;
  }
}

async function ensureQr(share) {
  if (!share?.lanShare || !share?.shareUrl) {
    setQr(null);
    return;
  }
  if (lastQrUrl === share.shareUrl && qrImage.src) return;
  try {
    const data = await api("/api/share/qr");
    setQr(data.qrDataUrl, data.shareUrl);
  } catch {
    setQr(null);
  }
}

function renderStatus(payload) {
  const { status, config } = payload;
  if (config) fillForm(config);

  const phase = status.phase || "disconnected";
  statusChip.dataset.phase = phase;
  statusLabel.textContent = phaseLabels[phase] || phase;
  socksUrl.textContent = status.socks?.url || "—";
  pidValue.textContent = status.pid || (status.foreignPids?.length ? status.foreignPids.join(",") : "—");
  uptimeValue.textContent = formatUptime(status.uptimeMs);

  const eg = status.egress;
  egressIp.textContent = eg?.ip || "—";
  egressCountry.textContent = eg
    ? `${eg.country}${eg.countryCode && eg.country !== eg.countryCode ? ` (${eg.countryCode})` : ""}`
    : phase === "connected" || phase === "external"
      ? "در حال تشخیص…"
      : "—";
  egressMeta.textContent = eg
    ? `${eg.warp ? "warp on" : "warp off"}${eg.colo ? ` · ${eg.colo}` : ""}`
    : "—";

  const lat = status.latency;
  if (lat?.ms != null) {
    latencyValue.textContent = `${lat.ms} ms`;
    latencyValue.dataset.level =
      lat.ms < 250 ? "good" : lat.ms < 600 ? "ok" : "bad";
  } else if (phase === "connected" || phase === "external") {
    latencyValue.textContent = lat?.error ? "خطا" : "…";
  } else {
    latencyValue.textContent = "—";
  }

  const share = status.share || {};
  shareUrlEl.textContent = share.shareUrl || "—";
  lanIpsEl.textContent = share.lanIps?.length
    ? share.lanIps.map((x) => x.address).join(" · ")
    : "—";
  syncShareIpSelect(share, config);
  btnToggleLan.textContent = share.lanShare ? "خاموش‌کردن LAN" : "فعال‌سازی LAN";
  ensureQr(share);

  if (status.argsPreview) {
    argsPreview.textContent = `aether ${status.argsPreview.join(" ")}`;
  }

  const hints = {
    connected: "تونل فعال است. مرورگر را روی این SOCKS5 بگذارید.",
    connecting: "در حال اسکن / اعتبارسنجی gateway…",
    disconnected: "برای شروع، وصل کردن را بزنید.",
    external: "یک پروسه روی پورت SOCKS بالا است ولی توسط این پنل مدیریت نمی‌شود.",
    orphan: "aether.exe بدون کنترل پنل در حال اجراست — قطع کردن آن را می‌بندد.",
  };
  hint.textContent = status.lastError
    ? `خطا: ${status.lastError}`
    : hints[phase] || "";

  btnConnect.disabled = busy || phase === "connected" || phase === "connecting";
  btnDisconnect.disabled = busy || phase === "disconnected";
  btnTest.disabled = busy || !status.connected;
  btnRefreshEgress.disabled = busy || !status.connected;
  btnRefreshLatency.disabled = busy || !status.connected;
  btnCopyShare.disabled = !share.shareUrl;
  btnRefreshQr.disabled = !share.lanShare;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function refresh() {
  try {
    const data = await api("/api/status");
    renderStatus(data);
  } catch (err) {
    hint.textContent = `خطا در خواندن وضعیت: ${err.message}`;
  }
}

async function withBusy(fn) {
  busy = true;
  btnConnect.disabled = true;
  btnDisconnect.disabled = true;
  btnTest.disabled = true;
  btnSave.disabled = true;
  btnToggleLan.disabled = true;
  try {
    await fn();
  } finally {
    busy = false;
    btnSave.disabled = false;
    btnToggleLan.disabled = false;
    await refresh();
  }
}

function onAction(fn) {
  return () => {
    withBusy(fn).catch((err) => showToast(err.message, true));
  };
}

btnSave.addEventListener(
  "click",
  onAction(async () => {
    const data = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify(readForm()),
    });
    argsPreview.textContent = `aether ${data.argsPreview.join(" ")}`;
    showToast("تنظیمات ذخیره شد");
  })
);

btnConnect.addEventListener(
  "click",
  onAction(async () => {
    await api("/api/config", {
      method: "PUT",
      body: JSON.stringify(readForm()),
    });
    await api("/api/connect", { method: "POST", body: "{}" });
    showToast("اتصال شروع شد");
  })
);

btnDisconnect.addEventListener(
  "click",
  onAction(async () => {
    await api("/api/disconnect", { method: "POST", body: "{}" });
    showToast("قطع شد");
  })
);

btnTest.addEventListener(
  "click",
  onAction(async () => {
    try {
      const data = await api("/api/test", { method: "POST", body: "{}" });
      testOut.hidden = false;
      testOut.textContent = data.raw;
      const warp = data.parsed?.warp === "on" ? "WARP فعال" : "بدون WARP";
      showToast(`تست موفق · ${warp} · ${data.parsed?.loc || "?"}`);
    } catch (err) {
      testOut.hidden = false;
      testOut.textContent = err.message;
      throw err;
    }
  })
);

btnRefreshEgress.addEventListener(
  "click",
  onAction(async () => {
    const data = await api("/api/egress/refresh", { method: "POST", body: "{}" });
    const eg = data.egress;
    showToast(eg ? `${eg.ip} · ${eg.country}` : "خروجی خوانده نشد");
  })
);

btnToggleLan.addEventListener(
  "click",
  onAction(async () => {
    const status = (await api("/api/status")).status;
    const enable = !status.share?.lanShare;
    const data = await api("/api/share/lan", {
      method: "POST",
      body: JSON.stringify({ enabled: enable }),
    });
    if (data.qrDataUrl) setQr(data.qrDataUrl, data.status?.share?.shareUrl);
    else setQr(null);
    showToast(data.note || (enable ? "LAN روشن شد" : "LAN خاموش شد"));
  })
);

btnCopyShare.addEventListener("click", async () => {
  const text = shareUrlEl.textContent;
  if (!text || text === "—") return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("آدرس کپی شد");
  } catch {
    showToast("کپی نشد", true);
  }
});

btnRefreshQr.addEventListener(
  "click",
  onAction(async () => {
    lastQrUrl = null;
    const data = await api("/api/share/qr");
    setQr(data.qrDataUrl, data.shareUrl);
    showToast(data.shareUrl);
  })
);

btnRefreshLatency.addEventListener(
  "click",
  onAction(async () => {
    const data = await api("/api/latency/refresh", { method: "POST", body: "{}" });
    const ms = data.latency?.ms;
    showToast(ms != null ? `تأخیر: ${ms} ms` : data.latency?.error || "ناموفق");
  })
);

btnClearLogs.addEventListener("click", () => {
  logView.textContent = "";
});

function appendLog(entry) {
  const line = `[${entry.t.slice(11, 19)}] ${entry.line}\n`;
  logView.textContent += line;
  logView.scrollTop = logView.scrollHeight;
}

function connectLogs() {
  const es = new EventSource("/api/logs");
  es.onmessage = (ev) => {
    try {
      appendLog(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectLogs, 2500);
  };
}

panelMeta.textContent = location.host;
connectLogs();
refresh();
setInterval(refresh, 2500);
