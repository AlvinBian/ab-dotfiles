#!/usr/bin/env zsh
# =============================================================================
# zsh/install.sh — Zsh 開發環境安裝腳本
#
# 用法：
#   pnpm run install:zsh          ← 互動式選擇模組
#   pnpm run install:zsh -- --all ← 直接全部安裝
#   bash zsh/install.sh --all
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ZSH_DIR="$REPO_DIR/zsh"
MODULES_DIR="$ZSH_DIR/modules"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; DIM='\033[2m'; RESET='\033[0m'

step()    { echo -e "\n${BOLD}$1${RESET}"; }
info()    { echo -e "  ${CYAN}▶ $1${RESET}"; }
success() { echo -e "  ${GREEN}✔ $1${RESET}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${RESET}"; }

# ── 模組清單（名稱 → 說明）─────────────────────────────────────
typeset -A MODULE_DESC
MODULE_DESC=(
  nvm          "Node 版本管理（lazy load，支援 nvm / n）"
  pnpm         "PNPM PATH 設定"
  completion   "ZSH 補全系統（智慧配色 + 模糊比對）"
  history      "歷史記錄（50000 筆，去重、跨 session 共享）"
  keybindings  "按鍵綁定（Option 移動單詞 / Ctrl 刪行）"
  plugins      "ZSH 插件（autosuggestions / syntax-highlight / starship）"
  fzf          "FZF 模糊搜尋整合（Ctrl-T / Alt-C）"
  tools        "現代 CLI（bat / eza / zoxide / fd / tldr）"
  git          "Git aliases + delta diff viewer"
  aliases      "編輯器自動偵測（Kiro → Cursor → VSCode）+ 通用 aliases"
)

# 固定顯示順序
MODULE_ORDER=(nvm pnpm completion history keybindings plugins fzf tools git aliases)

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Zsh 開發環境安裝                           ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"

# ── 解析參數 ──────────────────────────────────────────────────────
INSTALL_ALL=false
[[ "$1" == "--all" || "$2" == "--all" ]] && INSTALL_ALL=true

# ── STEP 1：模組選擇 ──────────────────────────────────────────────
step "STEP 1：選擇要安裝的 Zsh 模組"

SELECTED_MODULES=()

if $INSTALL_ALL; then
  SELECTED_MODULES=($MODULE_ORDER)
  success "模式：全部安裝（--all）"
else
  echo ""
  echo -e "  ${DIM}可用模組：${RESET}"
  local i=1
  for name in $MODULE_ORDER; do
    printf "  ${CYAN}[%2d]${RESET} %-14s ${DIM}%s${RESET}\n" $i "$name" "$MODULE_DESC[$name]"
    i=$((i + 1))
  done
  echo ""
  echo -e "  ${BOLD}請選擇（Enter = 全部安裝，輸入數字如 1,3,5-7 = 選擇，0 = 取消）：${RESET}"
  printf "  > "
  read -r user_input

  if [[ -z "$user_input" ]]; then
    # Enter = 全部
    SELECTED_MODULES=($MODULE_ORDER)
    echo -e "  ${CYAN}▶ 選擇：全部模組${RESET}"

  elif [[ "$user_input" == "0" ]]; then
    warn "已取消安裝"
    exit 0

  else
    # 解析輸入（支援 1,3,5 和 1-3 範圍）
    local indices=()
    for token in ${(s:,:)user_input}; do
      token="${token// /}"
      if [[ "$token" =~ ^([0-9]+)-([0-9]+)$ ]]; then
        for n in {$match[1]..$match[2]}; do
          indices+=($n)
        done
      elif [[ "$token" =~ ^[0-9]+$ ]]; then
        indices+=($token)
      fi
    done

    for idx in $indices; do
      if (( idx >= 1 && idx <= ${#MODULE_ORDER} )); then
        SELECTED_MODULES+=($MODULE_ORDER[$idx])
      fi
    done

    if [[ ${#SELECTED_MODULES} -eq 0 ]]; then
      warn "未選擇任何有效模組，結束"
      exit 0
    fi
    echo -e "  ${CYAN}▶ 選擇：${SELECTED_MODULES[*]}${RESET}"
  fi
fi

# ── STEP 2：安裝 Homebrew CLI 工具（若選了相關模組才執行）───────
NEEDS_BREW=false
for m in $SELECTED_MODULES; do
  [[ "$m" == "fzf" || "$m" == "tools" || "$m" == "plugins" || "$m" == "git" ]] && NEEDS_BREW=true && break
done

if $NEEDS_BREW; then
  step "STEP 2：安裝 Homebrew CLI 工具"
  if ! command -v brew &>/dev/null; then
    warn "未偵測到 Homebrew，請先安裝：https://brew.sh"; exit 1
  fi

  BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr)
  for tool in $BREW_TOOLS; do
    if brew list "$tool" &>/dev/null 2>&1; then
      info "$tool 已安裝，略過"
    else
      info "安裝 $tool ..."; brew install "$tool"; success "$tool 安裝完成"
    fi
  done

  # fzf key bindings
  if [ -f "$(brew --prefix)/opt/fzf/install" ]; then
    "$(brew --prefix)/opt/fzf/install" --key-bindings --completion \
      --no-update-rc --no-bash --no-fish 2>/dev/null || true
  fi
else
  step "STEP 2：跳過 Homebrew 工具（所選模組不需要）"
  success "略過"
fi

# ── STEP 3：確保 nvm（若選了 nvm 模組）───────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" nvm "* ]]; then
  step "STEP 3：檢查 Node 版本管理器"
  if [[ ! -d "$HOME/.nvm" ]] && ! command -v n &>/dev/null; then
    warn "未偵測到 nvm 或 n，自動安裝 nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    success "nvm 安裝完成"
  else
    success "Node 版本管理器已存在，略過"
  fi
fi

# ── STEP 4：部署選擇的模組 → ~/.zsh/modules/ ─────────────────────
step "STEP 4：部署 Zsh 模組（${#SELECTED_MODULES} 個）"
mkdir -p ~/.zsh/modules

for name in $SELECTED_MODULES; do
  src="$MODULES_DIR/$name.zsh"
  if [[ -f "$src" ]]; then
    cp "$src" ~/.zsh/modules/"$name.zsh"
    success "$name.zsh"
  else
    warn "$name.zsh 不存在，略過"
  fi
done

# ── STEP 5：部署 ~/.zshrc（若尚未存在或選了全部）────────────────
step "STEP 5：部署 ~/.zshrc"
if [[ -f ~/.zshrc ]]; then
  BACKUP="$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
  cp ~/.zshrc "$BACKUP"
  info "已備份舊版 → $(basename $BACKUP)"
fi
cp "$ZSH_DIR/zshrc" ~/.zshrc
success "~/.zshrc 部署完成"

# ── STEP 6：~/.ripgreprc ──────────────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" tools "* ]]; then
  step "STEP 6：設定 ripgrep"
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
fi

# ── 完成 ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   ✔ 安裝完成！                              ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}已安裝模組：${RESET} ${SELECTED_MODULES[*]}"
echo -e "  ${BOLD}模組路徑  ：${RESET} ~/.zsh/modules/"
echo -e "  ${BOLD}設定檔    ：${RESET} ~/.zshrc"
echo ""
echo -e "${YELLOW}  請執行：${RESET}${BOLD}source ~/.zshrc${RESET}  或開新 Terminal 讓設定生效"
echo ""
echo -e "${BLUE}  日後更新：${RESET}"
echo -e "    修改 ${BOLD}zsh/modules/<name>.zsh${RESET} 後執行 ${BOLD}pnpm run install:zsh${RESET}"
