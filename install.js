// install.js — Windows-safe Pinokio installer (no `sh`) for HiDream-I1 via DevNullInc fork
// - Clones/updates https://github.com/DevNullInc/HiDream-I1 into ./app
// - Creates fresh Python venv in ./env
// - Boots pip clean (works even if the venv started empty)
// - Pins Torch 2.7.0 cu128 on Windows + matching flash-attn torch270 wheel
// - Installs app requirements if present
// - Prints a quick sanity readout

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
  if (r.status !== 0) throw new Error(`[install.js] Failed: ${cmd} ${args.join(" ")}`);
}

module.exports = async () => {
  const REPO = process.env.HIDREAM_REPO || "https://github.com/DevNullInc/HiDream-I1";
  const CWD = process.cwd();
  const APP_DIR = path.join(CWD, "app");
  const ENV_DIR = path.join(CWD, "env");
  const isWin = process.platform === "win32";
  const PY = isWin ? path.join(ENV_DIR, "Scripts", "python.exe") : path.join(ENV_DIR, "bin", "python");

  // 1) Clone or update repo into ./app
  if (!fs.existsSync(APP_DIR)) {
    run("git", ["clone", "--depth", "1", REPO, "app"]);
  } else {
    const gitDir = path.join(APP_DIR, ".git");
    if (fs.existsSync(gitDir)) {
      run("git", ["-C", "app", "fetch", "--all", "--prune"]);
      run("git", ["-C", "app", "reset", "--hard", "origin/main"]);
    } else {
      fs.rmSync(APP_DIR, { recursive: true, force: true });
      run("git", ["clone", "--depth", "1", REPO, "app"]);
    }
  }

  // 2) Create venv if missing
  if (!fs.existsSync(PY)) {
    run("python", ["-m", "venv", "env"]);
  }

  // 3) Clean bad distutils shim on Windows that points to missing _distutils_hack
  if (isWin) {
    const pth = path.join(ENV_DIR, "Lib", "site-packages", "distutils-precedence.pth");
    try { if (fs.existsSync(pth)) fs.unlinkSync(pth); } catch {}
  }

  // 4) Bootstrap pip tooling no matter what state the venv is in
  run(PY, ["-m", "ensurepip", "--upgrade"]);
  run(PY, ["-m", "pip", "install", "-U", "pip", "setuptools", "wheel"]);

  // 5) Torch + FlashAttention (Windows: pin to torch 2.7.0 cu128 + torch270 FA wheel)
  if (isWin) {
    run(PY, ["-m", "pip", "uninstall", "-y", "flash-attn", "flash_attn", "flash_attn_cuda", "torch", "torchvision", "torchaudio"]);
    run(PY, ["-m", "pip", "install",
      "torch==2.7.0+cu128",
      "torchvision==0.22.0+cu128",
      "torchaudio==2.7.0+cu128",
      "--index-url", "https://download.pytorch.org/whl/cu128"
    ]);
    const FA_WHL = process.env.FA_WHL ||
      "https://github.com/petermg/flash_attn_windows/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu128.torch270-cp310-cp310-win_amd64.whl";
    run(PY, ["-m", "pip", "install", "--no-deps", FA_WHL]);
  } else {
    // Non-Windows: leave default torch path (customize if you need a specific CUDA)
    run(PY, ["-m", "pip", "install", "torch==2.8.0", "torchvision==0.23.0", "torchaudio==2.8.0"]);
  }

  // 6) App requirements (optional)
  const req = path.join(APP_DIR, "requirements.txt");
  const reqDev = path.join(APP_DIR, "requirements-dev.txt");
  if (fs.existsSync(req)) run(PY, ["-m", "pip", "install", "-r", req]);
  if (fs.existsSync(reqDev)) run(PY, ["-m", "pip", "install", "-r", reqDev]);

  // 7) Sanity check
  run(PY, ["-c", "import torch,sys; print('torch', torch.__version__, 'cuda', getattr(torch.version,'cuda',None), 'avail', torch.cuda.is_available())"]);
  try {
    run(PY, ["-c", "import flash_attn_2_cuda; print('flash_attn OK')"]);
  } catch {
    console.log("[install.js] flash_attn not loaded; continuing");
  }

  console.log("\n[install.js] HiDream-I1 setup complete. Start it with start.js.\n");
};
