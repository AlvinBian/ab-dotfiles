#!/usr/bin/env zsh
# =============================================================================
# zsh/install.sh — Zsh 開發環境安裝腳本
#
# 用法：
#   pnpm run install:zsh
#   bash zsh/install.sh
#
# 執行內容：
#   1. 安裝 Homebrew 工具（fzf / bat / eza / zoxide 等）
#   2. 確保 nvm 存在
#   3. 將 zsh/modules/*.zsh 複製到 ~/.zsh/modules/
#   4. 將 zsh/zshrc 部署為 ~/.zshrc
#   5. 寫入 ~/.ripgreprc
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZSH_DIR="$REPO_DIR/zsh"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; RESET='\033[0m'

step()    { echo -e "\n${BOLD}$1${RESET}"; }
info()    { echo -e "  ${CYAN}▶ $1${RESET}"; }
success() { echo -e "  ${GREEN}✔ $1${RESET}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${RESET}"; }

echo -e "\n${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Zsh 開發環境安裝                           ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"

# ── STEP 1：安裝 Homebrew CLI 工具 ───────────────────────────────
step "STEP 1：安裝現代 CLI 工具"

if ! command -v brew &>/dev/null; then
  warn "未偵測到 Homebrew，請先安裝：https://brew.sh"
  exit 1
fi

BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr)
for tool in "${BREW_TOOLS[@]}"; do
  if brew list "$tool" &>/dev/null 2>&1; then
    info "$tool 已安裝，略過"
  else
    info "安裝 $tool ..."
    brew install "$tool"
    success "$tool 安裝完成"
  fi
done

# fzf key bindings
if [ -f "$(brew --prefix)/opt/fzf/install" ]; then
  "$(brew --prefix)/opt/fzf/install" --key-bindings --completion \
    --no-update-rc --no-bash --no-fish 2>/dev/null || true
fi

# ── STEP 2：確保 nvm 存在 ────────────────────────────────────────
step "STEP 2：檢查 Node 版本管理器"

if [[ ! -d "$HOME/.nvm" ]] && ! command -v n &>/dev/null; then
  warn "未偵測到 nvm 或 n，自動安裝 nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  success "nvm 安裝完成"
else
  success "Node 版本管理器已存在，略過"
fi

# ── STEP 3：部署 zsh/modules/ → ~/.zsh/modules/ ─────────────────
step "STEP 3：部署 Zsh 模組（$(ls "$ZSH_DIR/modules/"*.zsh | wc -l | tr -d ' ') 個）"

mkdir -p ~/.zsh/modules

MODULE_COUNT=0
for src in "$ZSH_DIR/modules/"*.zsh; do
  name="$(basename "$src")"
  cp "$src" ~/.zsh/modules/"$name"
  info "✅ $name"
  MODULE_COUNT=$((MODULE_COUNT + 1))
done
success "$MODULE_COUNT 個模組已複製到 ~/.zsh/modules/"

# ── STEP 4：部署 ~/.zshrc ─────────────────────────────────────────
step "STEP 4：部署 ~/.zshrc"

if [[ -f ~/.zshrc ]]; then
  BACKUP="$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
  cp ~/.zshrc "$BACKUP"
  info "已備份舊版 → $BACKUP"
fi

cp "$ZSH_DIR/zshrc" ~/.zshrc
success "~/.zshrc 部署完成"

# ── STEP 5：寫入 ~/.ripgreprc ─────────────────────────────────────
step "STEP 5：設定 ripgrep"

cat > ~/.ripgreprc << 'RGEOF'
--line-number
--color=auto
--hidden
--smart-case
--glob=!.git/*
--glob=!node_modules/*
--glob=!.next/*
--glob=!dist/*
--glob=!build/*
--glob=!.DS_Store
RGEOF
success "~/.ripgreprc 寫入完成"

# ── 完成 ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ✔ Zsh 環境安裝完成                        ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}模組路徑：${RESET} ~/.zsh/modules/"
echo -e "  ${BOLD}設定檔  ：${RESET} ~/.zshrc"
echo ""
echo -e "${YELLOW}  請執行：${RESET}${BOLD}source ~/.zshrc${RESET}  或開新 Terminal 讓設定生效"
echo ""
echo -e "${BLUE}  日後更新模組：${RESET}"
echo -e "    1. 修改 ${BOLD}zsh/modules/XX-name.zsh${RESET}"
echo -e "    2. ${BOLD}pnpm run install:zsh${RESET}  ← 重新部署"
