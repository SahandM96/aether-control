# Aether Control

پنل مدیریت محلی + اسکریپت‌های کمکی برای اجرای [**Aether**](https://github.com/CluvexStudio/Aether) روی ویندوز.

Local control panel and helper scripts for running [**Aether**](https://github.com/CluvexStudio/Aether) on Windows.

**Verified:** 2026-07-22 against [Aether v1.2.0](https://github.com/CluvexStudio/Aether/releases/tag/v1.2.0) on Windows x86_64 (Node 22). Smoke test: `verify-install.ps1` → `warp=on`.

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
- `setup.ps1` + `verify-install.ps1` for a reliable first-run path

Aether itself still exposes a local **SOCKS5** proxy (default `127.0.0.1:1819`). It is **not** VLESS.

---

## Requirements

- Windows x86_64
- [Node.js](https://nodejs.org/) **18+** (`node -v`)
- Network access to GitHub (to download the Aether release)
- `curl.exe` (ships with modern Windows 10/11)

---

## Quick start (English)

```powershell
git clone https://github.com/SahandM96/aether-control.git
cd aether-control

# downloads Aether binary + npm install
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1

cd aether-panel
npm start
```

Open **http://127.0.0.1:3847** → **وصل کردن** (Connect).

Optional end-to-end check (panel may be started by the script if needed):

```powershell
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1
```

Success means the script prints `ALL CHECKS PASSED` and a SOCKS curl sees `warp=on`.

Or double-click `aether-panel\start-panel.bat` after setup.

---

## راهنمای سریع (فارسی)

1. Node.js 18 یا بالاتر نصب باشد.
2. کلون کن:

```powershell
git clone https://github.com/SahandM96/aether-control.git
cd aether-control
```

3. نصب یک‌مرحله‌ای (دانلود باینری رسمی Aether + وابستگی‌های پنل):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

4. پنل را بالا بیاور:

```powershell
cd aether-panel
npm start
```

5. برو به http://127.0.0.1:3847 و **وصل کردن** را بزن.  
   برای گوشی روی همان وای‌فای: **فعال‌سازی LAN** و اسکن QR با کلاینت SOCKS5.

6. تست دستی تونل:

```powershell
curl.exe -x socks5h://127.0.0.1:1819 https://www.cloudflare.com/cdn-cgi/trace
```

اگر در خروجی `warp=on` دیدی، تونل سالم است.

---

## Manual steps (instead of setup.ps1)

### 1) Download Aether (upstream)

```powershell
cd aether
powershell -NoProfile -ExecutionPolicy Bypass -File .\download-aether.ps1
```

Or manually from [Releases](https://github.com/CluvexStudio/Aether/releases): download `aether-windows-x86_64.zip`, extract `aether.exe` into `aether/`.

### 2) Start the panel

```powershell
cd ..\aether-panel
npm install
npm start
```

### 3) Connect in the UI

**وصل کردن** → optional **فعال‌سازی LAN** → verify with the `curl` command above.

---

## Layout

```text
aether-control/
  setup.ps1               # one-shot: download Aether + npm install
  verify-install.ps1      # smoke test (health, connect, curl, LAN QR)
  aether/                 # download script + launch helpers (binary NOT shipped)
  aether-panel/           # Node.js control service + UI
  README.md
  LICENSE                 # MIT — applies to this panel/helpers only
```

---

## Autostart (panel)

```powershell
cd aether-panel
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
```

Remove:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\uninstall-autostart.ps1
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `running scripts is disabled` | Always use `powershell -NoProfile -ExecutionPolicy Bypass -File ...` or `start-panel.bat` |
| `aether binary not found` | Run `setup.ps1` or `aether\download-aether.ps1` |
| Port `3847` already in use | Stop the other panel (`netstat -ano \| findstr :3847` → kill PID) |
| Port `1819` busy / PORT_BUSY | Disconnect in UI, or kill `aether.exe` |
| Connect hangs / never becomes connected | In settings enable **HTTP/2** (UDP/QUIC blocked), save, reconnect; or try noize `gfw` |
| `curl` missing | Install/update Windows, or use Git for Windows curl |
| Phone cannot use LAN QR | Same Wi‑Fi; Windows Firewall allow inbound TCP `1819`; pick the **Wi‑Fi** IP in the panel dropdown |
| Download from GitHub fails | Need outbound HTTPS to `github.com` / release CDN |

Upstream protocol details: [Aether English guide](https://github.com/CluvexStudio/Aether/blob/main/Docs/GUIDE.en.md).

---

## License

- **This repository’s panel and helper scripts:** MIT (see `LICENSE`)
- **Aether binary and upstream source:** [AGPL-3.0](https://github.com/CluvexStudio/Aether/blob/main/LICENSE) — owned by CluvexStudio; obtain from the official repo/releases

If you distribute a modified Aether binary or combine it in a way that triggers AGPL obligations, follow upstream AGPL terms.

---

## Disclaimer

Not affiliated with CluvexStudio. For censorship-circumvention tooling, use responsibly and in accordance with your local laws.
