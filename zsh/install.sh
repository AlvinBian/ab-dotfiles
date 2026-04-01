#!/usr/bin/env zsh
# =============================================================================
# zsh/install.sh — zsh 環境模組安裝
#
# 用法：
#   zsh zsh/install.sh                                    ← 互動式選擇
#   zsh zsh/install.sh --all                              ← 全部安裝
#   zsh zsh/install.sh --modules "nvm,git,plugins,tools"  ← 指定模組（由 setup.mjs 傳入）
#
# 模組結構（10 模組，brew 原生）：
#   aliases     → 編輯器自動偵測 + open -e + gh / uv + 通用 aliases
#   completion  → zsh 補全系統（compinit + menu select）
#   fzf         → FZF key-bindings + fd + bat 預覽
#   git         → delta / lazygit / git aliases
#   history     → 歷史記錄 setopt（50k + dedup + share）
#   keybindings → 按鍵綁定（Alt/Ctrl+←/→、↑↓前綴搜尋）
#   nvm         → Node 版本管理（lazy load + .nvmrc 自動切換）
#   plugins     → autosuggestions + syntax-highlighting + starship + IDE
#   pnpm        → PNPM PATH
#   tools       → bat / eza / zoxide / fd / ripgrep / tldr
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

# ── 模組定義（10 模組）───────────────────────────────────────────
MODULE_ORDER=(aliases completion fzf git history keybindings nvm plugins pnpm tools)
typeset -A MODULE_DESC
MODULE_DESC=(
  aliases     "編輯器自動偵測（Kiro/Cursor/VSCode）+ open -e + gh / uv + 通用 aliases"
  completion  "zsh 補全系統（menu select、大小寫不敏感）"
  fzf         "FZF 整合（key-bindings Ctrl+R/T / fd + bat 預覽）"
  git         "Git aliases + delta diff viewer + lazygit"
  history     "歷史記錄（50k 筆 + dedup + 跨 session 共享）"
  keybindings "按鍵綁定（Alt+←/→、Ctrl+←/→、↑↓前綴搜尋）"
  nvm         "Node 版本管理（nvm lazy load / n 支援，自動讀取 .nvmrc）"
  plugins     "zsh 插件（autosuggestions + syntax-highlighting）+ starship + IDE"
  pnpm        "PNPM_HOME PATH 設定"
  tools       "現代 CLI（bat / eza / zoxide / fd / ripgrep / tldr）"
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
  echo -e "${BOLD}║   zsh 環境模組安裝                          ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
  step "選擇要安裝的 zsh 環境模組"
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
  [[ "$m" == "fzf" || "$m" == "tools" || "$m" == "git" || "$m" == "plugins" ]] && NEEDS_BREW=true && break
done

if $NEEDS_BREW && command -v brew &>/dev/null; then
  step "安裝 Homebrew CLI 工具"
  BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr ripgrep zsh-autosuggestions zsh-syntax-highlighting)
  for tool in $BREW_TOOLS; do
    brew list "$tool" &>/dev/null 2>&1 \
      && info "$tool 已安裝" \
      || { info "安裝 $tool ..."; brew install "$tool" 2>/dev/null && success "$tool 安裝完成" || warn "$tool 安裝失敗，略過"; }
  done

  # fzf key-bindings 初始化（產生 shell 整合檔）
  if [ -f "$(brew --prefix)/opt/fzf/install" ]; then
    "$(brew --prefix)/opt/fzf/install" --key-bindings --completion --no-update-rc --no-bash --no-fish 2>/dev/null || true
  fi
fi

# ── 確保 Node 版本管理器已安裝 ───────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" nvm "* ]]; then
  if [[ ! -d "$HOME/.nvm" ]] && ! command -v n &>/dev/null; then
    step "安裝 n（Node 版本管理，輕量 brew 方案）"
    brew install n && n lts
    success "n 安裝完成（LTS 已設定）"
  fi
fi

# ── 部署模組 → ~/.zsh/modules/ ───────────────────────────────────
step "部署模組（${#SELECTED_MODULES} 個）"
mkdir -p ~/.zsh/modules

for name in $SELECTED_MODULES; do
  src="$MODULES_DIR/$name.zsh"
  dest=~/.zsh/modules/"$name.zsh"
  if [[ ! -f "$src" ]]; then
    warn "$name.zsh 不存在於 $MODULES_DIR，略過"
    continue
  fi
  if [[ -f "$dest" ]] && diff -q "$src" "$dest" &>/dev/null; then
    info "$name.zsh（無變更，略過）"
  else
    cp "$src" "$dest"
    success "$name.zsh"
  fi
done

# ── 部署 ~/.zshrc ─────────────────────────────────────────────────
step "部署 ~/.zshrc"
if [[ -f ~/.zshrc ]]; then
  cp ~/.zshrc "$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
  info "原 .zshrc 已備份"

  # 自動遷移：從舊 .zshrc 提取個人設定到 ~/.zshrc.local（不會被覆蓋）
  if [[ ! -f ~/.zshrc.local ]]; then
    # ab-dotfiles 內部識別碼 — 這些行不屬於使用者個人設定
    local _ab_internal='ab-dotfiles|BREW_PREFIX|PYENV_ROOT|_zsh_module|_safe_source|_command_exists|\.zsh/modules|zsh/modules|ZSH_DIR|SELECTED_MODULES|_AB_'
    # 擷取策略：
    #   1. export / alias / 任意變數賦值（含小寫、含引號）
    #   2. PATH += / path += / typeset -x
    #   3. eval / source（含縮寫 .）
    #   4. setopt / unsetopt / bindkey
    #   5. function 宣告行（含 func() { 寫法）
    #   6. autoload
    grep -E '^\s*(export |alias |eval |source |\. |setopt |unsetopt |bindkey |autoload |typeset |[A-Za-z_][A-Za-z0-9_]*=|[A-Za-z_][A-Za-z0-9_]*\+?=|function [A-Za-z_]|[A-Za-z_][A-Za-z0-9_]*\s*\(\))' ~/.zshrc \
      | grep -vE "$_ab_internal" \
      > ~/.zshrc.local 2>/dev/null || true
    if [[ -s ~/.zshrc.local ]]; then
      echo "" >> ~/.zshrc.local
      echo "# ── 以上由 ab-dotfiles 從舊 .zshrc 自動遷移 ──" >> ~/.zshrc.local
      echo "# 如有遺漏請查看備份：ls ~/.zshrc.backup.*" >> ~/.zshrc.local
      info "個人設定已遷移到 ~/.zshrc.local（$(wc -l < ~/.zshrc.local | tr -d ' ') 行）"
    else
      rm -f ~/.zshrc.local  # 沒有可遷移的設定，不建立空檔案
    fi
  fi
fi
cp "$ZSH_DIR/zshrc" ~/.zshrc
success "~/.zshrc 部署完成（個人設定在 ~/.zshrc.local）"

# ── ~/.ripgreprc ──────────────────────────────────────────────────
if [[ " ${SELECTED_MODULES[*]} " == *" tools "* ]]; then
  # 保留用戶已有的 ripgreprc，只在不存在時建立
  if [[ -f ~/.ripgreprc ]]; then
    info "~/.ripgreprc 已存在，保留不動"
  else
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
    success "~/.ripgreprc 建立完成"
  fi
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}║  ✅ zsh 環境模組安裝完成                     ║${RESET}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo -e "  已安裝模組：${CYAN}${SELECTED_MODULES[*]}${RESET}"
echo -e "  執行 ${BOLD}exec zsh${RESET} 立即套用"
