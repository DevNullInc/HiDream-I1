// torch.js — force consistent Torch + FlashAttention on Windows
// Works in Pinokio's node runner

const path = require("path");
const os = require("os");

module.exports = async ({ sh, ctx }) => {
  // Always upgrade pip toolchain inside the venv before heavy installs
  await sh([
    ["python", "-m", "ensurepip", "--upgrade"],
    ["python", "-m", "pip", "install", "-U", "pip", "setuptools", "wheel"]
  ]);

  const isWin = process.platform === "win32";
  const torchIndex = "https://download.pytorch.org/whl/cu128";

  if (isWin) {
    // Windows: pin to torch 2.7.0 cu128 so FA wheel matches
    await sh([
      ["python", "-m", "pip", "uninstall", "-y", "flash-attn", "flash_attn", "flash_attn_cuda", "torch", "torchvision", "torchaudio"],
      ["python", "-m", "pip", "install",
        "torch==2.7.0+cu128",
        "torchvision==0.22.0+cu128",
        "torchaudio==2.7.0+cu128",
        "--index-url", torchIndex
      ],
      // Matching FlashAttention wheel for torch270 + cu128, cp310
      ["python", "-m", "pip", "install", "--no-deps",
        "https://github.com/petermg/flash_attn_windows/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu128.torch270-cp310-cp310-win_amd64.whl"
      ],
      // Quick import check right here so failures surface during install
      ["python", "-c", "import torch; import flash_attn_2_cuda; print('OK torch', torch.__version__)"]
    ]);
  } else {
    // Non-Windows: keep existing behavior, but ensure CUDA build is chosen
    await sh([
      ["python", "-m", "pip", "install",
        "torch==2.8.0", "torchvision==0.23.0", "torchaudio==2.8.0"
      ]
    ]);
  }
};
