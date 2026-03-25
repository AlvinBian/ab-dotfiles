#!/usr/bin/env zsh
# =============================================================================
# zsh/install.sh — Zsh 模組安裝
#
# 用法：
#   bash zsh/install.sh                          ← 互動式選擇
#   bash zsh/install.sh --all                    ← 全部安裝
#   bash zsh/install.sh --modules "nvm,git,fzf"  ← 指定模組（由 setup.mjs 傳入）
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

# 所有模組及說明（有序）
MODULE_ORDER=(nvm pnpm completion history keybindings plugins fzf tools git aliases)
typeset -A MODULE_DESC
MODULE_DESC=(
  nvm          "Node 版本管理（lazy load）"
  pnpm         "PNPM PATH 設定"
  completion   "ZSH 補全系統"
  history      "歷史記錄設定"
  keybindings  "按鍵綁定"
  plugins      "autosuggestions / syntax-highlight / starship"
  fzf          "FZF 模糊搜尋整合"
  tools        "現代 CLI（bat / eza / zoxide）"
  git          "Git aliases + delta"
  aliases      "編輯器自動偵測 + 通用 aliases"
)

# ── 解析參數 ──────────────────────────────────────────────────────
SELECTED_MODULES=()
INSTALL_ALL=false
MODULES_ARG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)     INSTALL_ALL=true; shift ;;
    --modules) MODULES_ARG="$2"; shift 2 ;;
    *)         shift ;;
  esac
done

# 若由 setup.mjs 傳入 --modules，直接使用（跳過互動）
if [[ -n "$MODULES_ARG" ]]; then
  IFS=',' read -rA SELECTED_MODULES <<< "$MODULES_ARG"

elif $INSTALL_ALL; then
  SELECTED_MODULES=($MODULE_ORDER)

else
  # ── 互動式選擇（直接執行時）─────────────────────────────────
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║   Zsh 環境安裝                               ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  step "選擇要安裝的 Zsh 模組"
  echo ""
  echo -e "  ${DIM}可用模組：${RESET}"
  local i=1
  for name in $MODULE_ORDER; do
    printf "  ${CYAN}[%2d]${RESET} %-14s ${DIM}%s${RESET}\n" $i "$name" "$MODULE_DESC[$name]"
    i=$((i + 1))
  done
  echo ""
  echo -e "  ${BOLD}請輸入（Enter = 全部，數字如 1,3,5-7 = 選擇，0 = 取消）：${RESET}"
  printf "  > "
  read -r user_input

  if [[ -z "$user_input" ]]; then
    SELECTED_MODULES=($MODULE_ORDER)
  elif [[ "$user_input" == "0" ]]; then
    warn "已取消"; exit 0
  else
    local indices=()
    for token in ${(s:,:)user_input}; do
      token="${token// /}"
      if [[ "$token" =~ ^([0-9]+)-([0-9]+)$ ]]; then
        for n in {$match[1]..$match[2]}; do indices+=($n); done
      elif [[ "$token" =~ ^[0-9]+$ ]]; then
        indices+=($token)
      fi
    done
    for idx in $indices; do
      (( idx >= 1 && idx <= ${#MODULE_ORDER} )) && SELECTED_MODULES+=($MODULE_ORDER[$idx])
    done
  fi
fi

[[ ${#SELECTED_MODULES} -eq 0 ]] && { warn "未選擇任何模組"; exit 0; }

# ── 安裝 Homebrew 工具（若需要）──────────────────────────────────
NEEDS_BREW=false
for m in $SELECTED_MODULES; do
  [[ "$m" == "fzf" || "$m" == "tools" || "$m" == "plugins" || "$m" == "git" ]] && NEEDS_BREW=true && break
done

if $NEEDS_BREW && command -v brew &>/dev/null; then
  step "安裝 Homebrew CLI 工具"
  BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr)
  for tool in $BREW_TOOLS; do
    brew list "$tool" &>/dev/null 2>&1 && info "$tool 已安裝" || { info "安裝 $tool ..."; brew install "$tool"; }
  done
  [ -f "$(brew --prefix)/opt/fzf/install" ] && \
    "$(brew --prefix)/opt/fzf/install" --key-bindings --completion --no-update-rc --no-bash --no-fish 2>/dev/null || true
fi

# ── 確保 nvm ──────────────────────────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" nvm "* ]]; then
  if [[ ! -d "$HOME/.nvm" ]] && ! command -v n &>/dev/null; then
    step "安裝 nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
    success "nvm 安裝完成"
  fi
fi

# ── 部署模組 → ~/.zsh/modules/ ───────────────────────────────────
step "部署模組（${#SELECTED_MODULES} 個）"
mkdir -p ~/.zsh/modules

for name in $SELECTED_MODULES; do
  src="$MODULES_DIR/$name.zsh"
  [[ -f "$src" ]] && { cp "$src" ~/.zsh/modules/"$name.zsh"; success "$name.zsh"; } || warn "$name.zsh 不存在"
done

# ── 部署 ~/.zshrc ─────────────────────────────────────────────────
[[ -f ~/.zshrc ]] && cp ~/.zshrc "$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ZSH_DIR/zshrc" ~/.zshrc
success "~/.zshrc 部署完成"

# ── ~/.ripgreprc ──────────────────────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" tools "* ]]; then
  cat > ~/.ripgreprc << 'RGEOF'
--line-number
--color=auto
--hidden
--smart-case
--glob=!.git/*
--glob=!node_modules/*
--glob=!dist/*
--glob=!build/*
RGEOF
  success "~/.ripgreprc 完成"
fi

echo -e "\n${GREEN}✔ Zsh 安裝完成：${SELECTED_MODULES[*]}${RESET}"
