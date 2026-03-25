#!/usr/bin/env zsh
# =============================================================================
# zsh/install.sh — Zsh 模組安裝
#
# 用法：
#   zsh zsh/install.sh                           ← 互動式選擇
#   zsh zsh/install.sh --all                     ← 全部安裝
#   zsh zsh/install.sh --modules "nvm,git,zinit" ← 指定模組（由 setup.mjs 傳入）
#
# 模組結構（10 → 8，zinit 整合 plugins/completion/keybindings）：
#   zinit   → 插件管理 + p10k + autosuggestions + syntax + fzf-tab + bindkey
#   nvm     → Node 版本管理（lazy load）
#   pnpm    → PNPM PATH
#   history → 歷史記錄 setopt
#   fzf     → FZF 環境變數（key-bindings 已由 fzf-tab 接管）
#   tools   → bat / eza / zoxide / fd / ripgrep / tldr
#   git     → delta / lazygit / git aliases
#   aliases → 編輯器偵測 / gh / uv / 通用 aliases
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

# ── 模組定義（新 8 模組）─────────────────────────────────────────
MODULE_ORDER=(zinit nvm pnpm history fzf tools git aliases)
typeset -A MODULE_DESC
MODULE_DESC=(
  zinit    "Zinit 插件管理 + Powerlevel10k + autosuggestions + fzf-tab"
  nvm      "Node 版本管理（nvm lazy load / n 支援）"
  pnpm     "PNPM PATH 設定"
  history  "歷史記錄（50k 筆 + dedup + share）"
  fzf      "FZF 模糊搜尋環境設定（fd + bat 整合）"
  tools    "現代 CLI 工具（bat / eza / zoxide / ripgrep / tldr）"
  git      "Git aliases + delta diff + lazygit"
  aliases  "編輯器自動偵測 + gh / uv + 通用 aliases"
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

# 由 setup.mjs 傳入 --modules → 直接使用，跳過互動
if [[ -n "$MODULES_ARG" ]]; then
  IFS=',' read -rA SELECTED_MODULES <<< "$MODULES_ARG"

elif $INSTALL_ALL; then
  SELECTED_MODULES=($MODULE_ORDER)

else
  # ── 互動式選擇 ────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║   Zsh 環境安裝（Zinit + p10k 架構）         ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  step "選擇要安裝的 Zsh 模組"
  echo ""
  echo -e "  ${DIM}可用模組（共 ${#MODULE_ORDER}）：${RESET}"
  local i=1
  for name in $MODULE_ORDER; do
    printf "  ${CYAN}[%2d]${RESET} %-10s ${DIM}%s${RESET}\n" $i "$name" "$MODULE_DESC[$name]"
    i=$((i + 1))
  done
  echo ""
  echo -e "  ${BOLD}請輸入（Enter = 全部，1,3,5 或 1-4 = 選擇，0 = 取消）：${RESET}"
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

# ── 安裝 Homebrew CLI 工具 ────────────────────────────────────────
NEEDS_BREW=false
for m in $SELECTED_MODULES; do
  [[ "$m" == "fzf" || "$m" == "tools" || "$m" == "git" || "$m" == "zinit" ]] && NEEDS_BREW=true && break
done

if $NEEDS_BREW && command -v brew &>/dev/null; then
  step "安裝 Homebrew CLI 工具"
  BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr ripgrep)
  for tool in $BREW_TOOLS; do
    brew list "$tool" &>/dev/null 2>&1 \
      && info "$tool 已安裝" \
      || { info "安裝 $tool ..."; brew install "$tool" 2>/dev/null && success "$tool 安裝完成" || warn "$tool 安裝失敗，略過"; }
  done
fi

# ── 確保 nvm 已安裝 ───────────────────────────────────────────────
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
  if [[ -f "$src" ]]; then
    cp "$src" ~/.zsh/modules/"$name.zsh"
    success "$name.zsh"
  else
    warn "$name.zsh 不存在於 $MODULES_DIR，略過"
  fi
done

# ── 部署 ~/.zshrc ─────────────────────────────────────────────────
step "部署 ~/.zshrc"
if [[ -f ~/.zshrc ]]; then
  cp ~/.zshrc "$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
  info "原 .zshrc 已備份"
fi
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

# ── p10k 提示 ─────────────────────────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" zinit "* ]]; then
  echo ""
  echo -e "${YELLOW}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${YELLOW}║  📌 Powerlevel10k 設定精靈                  ║${RESET}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════╝${RESET}"
  echo -e "  重啟 terminal 後，zinit 會自動安裝 p10k"
  echo -e "  首次啟動會自動執行設定精靈，或手動執行："
  echo -e "    ${CYAN}p10k configure${RESET}"
  echo -e "  設定完成後 ~/.p10k.zsh 會自動被 zinit.zsh 載入"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅ Zsh 安裝完成                             ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo -e "  已安裝模組：${CYAN}${SELECTED_MODULES[*]}${RESET}"
echo -e "  執行 ${BOLD}exec zsh${RESET} 立即套用"
