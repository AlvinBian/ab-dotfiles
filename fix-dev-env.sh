#!/bin/zsh
# ============================================================
# 開發環境完整優化腳本
# 修復項目：
#   1. pnpm store 版本衝突 → 重裝 claude-code
#   2. Homebrew node@22 與 nvm 雙重管理衝突
#   3. pnpm store 路徑固定，防止未來再衝突
#   4. nvm lazy loading，加速 terminal 啟動
# ============================================================

set -e

# ── 顏色輸出 ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo "${BLUE}ℹ️  $1${NC}"; }
success() { echo "${GREEN}✅ $1${NC}"; }
warn()    { echo "${YELLOW}⚠️  $1${NC}"; }
error()   { echo "${RED}❌ $1${NC}"; exit 1; }
section() { echo "\n${BLUE}══════════════════════════════════════${NC}"; echo "${BLUE}  $1${NC}"; echo "${BLUE}══════════════════════════════════════${NC}"; }

# ── 確認函數 ─────────────────────────────────────────────
confirm() {
  echo -n "${YELLOW}❓ $1 [y/N] ${NC}"
  read -r reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# ══════════════════════════════════════════════════════════
section "修復前狀態診斷"
# ══════════════════════════════════════════════════════════

info "目前環境："
echo "  node (Homebrew): $(node --version 2>/dev/null || echo '未找到') → $(which node 2>/dev/null)"
echo "  pnpm:            $(pnpm --version 2>/dev/null || echo '未找到')"
echo "  pnpm store/v10:  $([ -d ~/Library/pnpm/store/v10 ] && echo '存在 ⚠️' || echo '不存在 ✅')"
echo "  pnpm store/v3:   $([ -d ~/Library/pnpm/store/v3 ] && echo '存在' || echo '不存在')"
echo "  node_modules 衝突: $([ -d ~/Library/pnpm/global/5/node_modules ] && echo '存在 ⚠️' || echo '不存在 ✅')"

# ══════════════════════════════════════════════════════════
section "STEP 1：備份 .zshrc 與 global 套件清單"
# ══════════════════════════════════════════════════════════

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/.dev-env-backup-$BACKUP_DATE"
mkdir -p "$BACKUP_DIR"

cp ~/.zshrc "$BACKUP_DIR/.zshrc.bak"
pnpm list -g --depth=0 2>/dev/null > "$BACKUP_DIR/pnpm-globals.txt" || true

success "備份已儲存至 $BACKUP_DIR"

# ══════════════════════════════════════════════════════════
section "STEP 2：修復 pnpm store 衝突"
# ══════════════════════════════════════════════════════════

if [ -d ~/Library/pnpm/global/5/node_modules ]; then
  info "刪除衝突的 global node_modules..."
  rm -rf ~/Library/pnpm/global/5/node_modules
  success "已清除 ~/Library/pnpm/global/5/node_modules"
else
  success "global node_modules 無衝突，跳過"
fi

if [ -d ~/Library/pnpm/store/v10 ]; then
  info "刪除舊的 pnpm store/v10（釋放磁碟空間）..."
  rm -rf ~/Library/pnpm/store/v10
  success "已清除 ~/Library/pnpm/store/v10"
fi

info "固定 pnpm store 路徑，防止未來版本升級再衝突..."
pnpm config set store-dir ~/.pnpm-store --global
pnpm config set auto-install-peers true --global
success "pnpm store 已固定至 ~/.pnpm-store"

# ══════════════════════════════════════════════════════════
section "STEP 3：修復 Homebrew node@22 與 nvm 衝突"
# ══════════════════════════════════════════════════════════

info "目前 nvm 管理的 node 版本："
source /opt/homebrew/opt/nvm/nvm.sh 2>/dev/null || true
nvm list 2>/dev/null | grep -v "N/A" | head -5 || warn "nvm 載入失敗，請手動確認"
echo ""

warn "Homebrew 的 node@22 與 nvm 並存，會導致非互動 shell 中 node 解析錯誤"
if confirm "移除 Homebrew node@22，讓 nvm 完全接管？（建議選 y）"; then
  info "移除 Homebrew node@22..."
  brew uninstall node@22 --ignore-dependencies 2>/dev/null || warn "node@22 移除失敗或不存在，繼續..."
  success "已移除 Homebrew node@22"

  # 確保 nvm 預設版本已安裝
  source /opt/homebrew/opt/nvm/nvm.sh 2>/dev/null || true
  DEFAULT_NODE=$(nvm alias default 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "v22")
  info "確認 nvm default node 版本存在（$DEFAULT_NODE）..."
  nvm install "$DEFAULT_NODE" 2>/dev/null || true
  nvm use "$DEFAULT_NODE" 2>/dev/null || true
  success "nvm node 版本確認完成：$(node --version 2>/dev/null)"
else
  warn "跳過移除 node@22，雙重管理問題保留"
fi

# ══════════════════════════════════════════════════════════
section "STEP 4：nvm Lazy Loading（加速 terminal 啟動）"
# ══════════════════════════════════════════════════════════

warn "目前 nvm 在每次開終端時立即 source，會讓啟動慢 0.3~1 秒"
if confirm "將 nvm 改為 lazy loading？（首次輸入 node/nvm/npm/pnpm 時才載入）"; then

  # 先移除 .zshrc 中舊的 NVM 載入區塊
  ZSHRC="$HOME/.zshrc"
  TEMP_FILE=$(mktemp)

  # 用 Python 來精準替換，避免 sed 跨平台問題
  python3 - "$ZSHRC" "$TEMP_FILE" << 'PYEOF'
import sys, re

with open(sys.argv[1], 'r') as f:
    content = f.read()

# 找到第三部分（NVM 區塊）的開始和結束
# 將整個 NVM source 載入部分替換為 lazy loading
OLD_BLOCK_PATTERN = r'(# ─── 加载 Homebrew 安装的 NVM ─{5,}.*?)(# ─── 自动切换)'
NEW_BLOCK = '''# ─── NVM Lazy Loading（首次使用時才載入，加速 terminal 啟動） ────────────
_load_nvm() {
  unset -f nvm node npm npx pnpm 2>/dev/null
  if [[ -s "/opt/homebrew/opt/nvm/nvm.sh" ]]; then
    source "/opt/homebrew/opt/nvm/nvm.sh"
    [[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ]] && \\
      source "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
  elif [[ -s "/usr/local/opt/nvm/nvm.sh" ]]; then
    source "/usr/local/opt/nvm/nvm.sh"
  elif [[ -s "$NVM_DIR/nvm.sh" ]]; then
    source "$NVM_DIR/nvm.sh"
  fi
}

# 第一次呼叫這些指令時觸發載入
for _cmd in nvm node nodejs npm npx pnpm; do
  eval "function ${_cmd}() { _load_nvm; unset -f ${_cmd}; ${_cmd} \\\"\\$@\\\"; }"
done
unset _cmd

# ─── 自动切换'''

result = re.sub(OLD_BLOCK_PATTERN, NEW_BLOCK, content, flags=re.DOTALL)

with open(sys.argv[2], 'w') as f:
    f.write(result)

print("success" if result != content else "no_change")
PYEOF

  RESULT=$(cat "$TEMP_FILE" | tail -1)
  if [[ "$RESULT" != "no_change" ]]; then
    # 去掉最後一行的 print 輸出
    head -n -1 "$TEMP_FILE" > "${TEMP_FILE}.clean"
    mv "${TEMP_FILE}.clean" "$ZSHRC"
    success ".zshrc 已更新為 nvm lazy loading"
  else
    warn "未找到可替換的 NVM 區塊（可能已經是 lazy loading），跳過"
  fi
  rm -f "$TEMP_FILE"
else
  warn "跳過 lazy loading 優化"
fi

# ══════════════════════════════════════════════════════════
section "STEP 5：重新安裝 @anthropic-ai/claude-code"
# ══════════════════════════════════════════════════════════

info "安裝 @anthropic-ai/claude-code..."
pnpm install -g @anthropic-ai/claude-code
success "claude-code 安裝完成"

# ══════════════════════════════════════════════════════════
section "最終驗證"
# ══════════════════════════════════════════════════════════

echo ""
info "環境驗證結果："
echo "  node:           $(node --version 2>/dev/null || echo '⚠️ 請重開終端') → $(which node 2>/dev/null)"
echo "  npm:            $(npm --version 2>/dev/null || echo '⚠️ 請重開終端')"
echo "  pnpm:           $(pnpm --version 2>/dev/null)"
echo "  pnpm store:     $(pnpm store path 2>/dev/null || echo '需重開終端確認')"
echo "  claude:         $(claude --version 2>/dev/null || echo '⚠️ 請重開終端後再確認')"
echo ""
echo "  pnpm store/v10: $([ -d ~/Library/pnpm/store/v10 ] && echo '仍存在 ⚠️' || echo '已清除 ✅')"
echo "  node@22 (brew): $(brew list node@22 2>/dev/null && echo '仍存在 ⚠️' || echo '已移除 ✅')"
echo ""

success "🎉 腳本執行完成！"
warn "請重開一個新的終端視窗，讓 .zshrc 設定生效"
echo ""
echo "  備份位置：$BACKUP_DIR"
echo "  如需還原：cp $BACKUP_DIR/.zshrc.bak ~/.zshrc"
