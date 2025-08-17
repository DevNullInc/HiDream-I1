// install.js — Pinokio installer for HiDream-I1 using DevNullInc fork
// - Clones/updates https://github.com/DevNullInc/HiDream-I1 into ./app
// - Creates a fresh Python venv (./env)
// - Bootstraps pip tooling, fixes distutils shim issues on Windows
// - Installs a Torch/FlashAttention combo via ./torch.js (Windows gets torch 2.7.0 cu128 + FA torch270)
// - Installs Python requirements if present
// - Prints a short success banner

const fs = require("fs");
const path = require("path");

module.exports = async ({ sh, ctx, io }) => {
  const REPO = process.env.HIDREAM_REPO || "https://github.com/DevNullInc/HiDream-I1";
  const APP_DIR = path.join(process.cwd(), "app");
  const ENV_DIR = path.join(process.cwd(), "env");
  const isWin = process.platform === "win32";
  const py = isWin ? path.join(ENV_DIR, "Scripts", "python.exe") : path.join(ENV_DIR, "bin", "python");

  // 1) Clone or update repo into ./app
  if (!fs.existsSync(APP_DIR)) {
    await sh([["git", "clone", "--depth", "1", REPO, "app"]]);
  } else {
    // try to update existing clone; if it's not a git repo, nuke and reclone
    const gitDir = path.join(APP_DIR, ".git");
    if (fs.existsSync(gitDir)) {
      await sh([
        ["git", "-C", "app", "fetch", "--all", "--prune"],
        ["git", "-C", "app", "reset", "--hard", "origin/main"]
      ]);
    } else {
      await sh([[isWin ? "cmd" : "bash", isWin ? "/c" : "-lc", `rmdir /s /q app`]]).catch(()=>{});
      await sh([["git", "clone", "--depth", "1", REPO, "app"]]);
    }
  }

  // 2) Create venv fresh if missing
  if (!fs.existsSync(py)) {
    await sh([["python", "-m", "venv", "env"]]);
  }

  // 3) Purge stale distutils shim that references _distutils_hack but file is gone
  try {
    if (isWin) {
      const pth = path.join(ENV_DIR, "Lib", "site-packages", "distutils-precedence.pth");
      if (fs.existsSync(pth)) fs.unlinkSync(pth);
    }
  } catch {}

  // 4) Ensure pip toolchain exists and is up to date
  await sh([[py, "-m", "ensurepip", "--upgrade"]]);
  await sh([[py, "-m", "pip", "install", "-U", "pip", "setuptools", "wheel"]]);

  // 5) Install Torch + FlashAttention combo via local torch.js helper
  const torchSetup = require("./torch.js");
  await torchSetup({ sh, ctx });

  // 6) App requirements (optional)
  const reqA = path.join(APP_DIR, "requirements.txt");
  const reqB = path.join(APP_DIR, "requirements-dev.txt");
  if (fs.existsSync(reqA)) {
    await sh([[py, "-m", "pip", "install", "-r", reqA]]);
  }
  if (fs.existsSync(reqB)) {
    await sh([[py, "-m", "pip", "install", "-r", reqB]]);
  }

  // 7) Minimal runtime sanity check: import torch and optional flash_attn
  await sh([[py, "-c", "import torch; print('torch', torch.__version__, 'cuda', getattr(torch.version,'cuda',None))"]]);
  await sh([[py, "-c", "import importlib, sys; \
try:\n import flash_attn_2_cuda; print('flash_attn OK')\nexcept Exception as e:\n print('flash_attn NOT LOADED:', e)\n"]]);

  io.println("\n[install.js] HiDream-I1 setup complete. Run start.js to launch.\n");
};
