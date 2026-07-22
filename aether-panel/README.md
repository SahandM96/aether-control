# aether-panel

Local admin UI for [CluvexStudio/Aether](https://github.com/CluvexStudio/Aether).

Expects `../aether/aether.exe` (download via `../aether/download-aether.ps1` or repo-root `setup.ps1`).

```powershell
npm install
npm start
```

Panel: http://127.0.0.1:3847

Detached start (used by `verify-install.ps1`):

```powershell
node scripts\spawn-detached.js
```
