# Aether Control

پنل مدیریت محلی + اسکریپت‌های کمکی برای اجرای [**Aether**](https://github.com/CluvexStudio/Aether) روی ویندوز.

Local control panel and helper scripts for running [**Aether**](https://github.com/CluvexStudio/Aether) on Windows.

---

## Upstream / پروژه اصلی

این مخزن **جایگزین Aether نیست**. کلاینت تونل از پروژهٔ اصلی می‌آید:

| | |
|---|---|
| **Project** | [CluvexStudio/Aether](https://github.com/CluvexStudio/Aether) |
| **Docs (EN)** | [Docs/GUIDE.en.md](https://github.com/CluvexStudio/Aether/blob/main/Docs/GUIDE.en.md) |
| **Docs (FA)** | [Docs/GUIDE.fa.md](https://github.com/CluvexStudio/Aether/blob/main/Docs/GUIDE.fa.md) |
| **Releases** | [github.com/CluvexStudio/Aether/releases](https://github.com/CluvexStudio/Aether/releases) |
| **Latest tested** | [v1.2.0](https://github.com/CluvexStudio/Aether/releases/tag/v1.2.0) (`aether-windows-x86_64.zip`) |
| **Upstream license** | [AGPL-3.0](https://github.com/CluvexStudio/Aether/blob/main/LICENSE) |
| **Telegram** | https://t.me/CluvexStudio |

> **Credit:** Aether is developed by **CluvexStudio**. MASQUE support in Aether is built on Cloudflare’s Quiche.  
> This repository only adds a local Node.js admin UI and Windows helpers around the official binary.

---

## What this repo adds

- Start / stop Aether from a web UI (`http://127.0.0.1:3847`)
- Edit common flags (protocol, scan, noize, HTTP/2, fragment, bind, …)
- Live logs, egress IP/country, real latency probe
- LAN share + QR (`socks5://LAN_IP:1819`) for phones/other devices on the same Wi‑Fi
- Windows autostart script for the panel

Aether itself still exposes a local **SOCKS5** proxy (default `127.0.0.1:1819`). It is **not** VLESS.

---

## Layout

```text
aether-control/
  aether/                 # download script + launch helpers (binary NOT shipped)
  aether-panel/           # Node.js control service + UI
  README.md
  LICENSE                 # MIT — applies to this panel/helpers only
```

---

## Requirements

- Windows x86_64
- [Node.js](https://nodejs.org/) 18+
- Official Aether Windows binary from upstream releases

---

## Setup

### 1) Download Aether (upstream)

```powershell
cd aether
.\download-aether.ps1
```

Or manually:

1. Open [Aether Releases](https://github.com/CluvexStudio/Aether/releases)
2. Download `aether-windows-x86_64.zip` (e.g. v1.2.0)
3. Extract `aether.exe` into the `aether/` folder next to this README’s `aether/` directory

### 2) Start the panel

```powershell
cd aether-panel
npm install
npm start
```

Or double-click `aether-panel\start-panel.bat`.

Open: **http://127.0.0.1:3847**

### 3) Connect

In the panel: **وصل کردن** → optional **فعال‌سازی LAN** for home devices → scan the QR with a SOCKS5-capable client.

Verify tunnel:

```powershell
curl.exe -x socks5h://127.0.0.1:1819 https://www.cloudflare.com/cdn-cgi/trace
```

---

## Autostart (panel)

```powershell
cd aether-panel
.\scripts\install-autostart.ps1
```

Remove:

```powershell
.\scripts\uninstall-autostart.ps1
```

---

## License

- **This repository’s panel and helper scripts:** MIT (see `LICENSE`)
- **Aether binary and upstream source:** [AGPL-3.0](https://github.com/CluvexStudio/Aether/blob/main/LICENSE) — owned by CluvexStudio; obtain from the official repo/releases

If you distribute a modified Aether binary or combine it in a way that triggers AGPL obligations, follow upstream AGPL terms.

---

## Disclaimer

Not affiliated with CluvexStudio. For censorship-circumvention tooling, use responsibly and in accordance with your local laws.
