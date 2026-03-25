#!/usr/bin/env bash
# =============================================================================
# scripts/setup-hooks.sh
# 安裝 git post-merge hook：git pull 後自動針對性部署變更
#
# 不使用定時排程 — 在手動 git pull 或執行 pnpm run update 時觸發
#
# 用法：
#   pnpm run hooks              ← 安裝
#   pnpm run hooks -- --off     ← 移除
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_FILE="$REPO_DIR/.git/hooks/post-merge"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

success() { echo -e "  ${GREEN}✔ $1${NC}"; }
info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }

# ── 移除 ──────────────────────────────────────────────────────────
if [[ "$1" == "--off" || "$1" == "--uninstall" ]]; then
  [[ -f "$HOOK_FILE" ]] && rm "$HOOK_FILE" && success "git post-merge hook 已移除" || warn "hook 不存在"
  exit 0
fi

# ── 安裝 ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}安裝 git post-merge hook${NC}"
echo -e "  效果：git pull 後自動偵測變更並針對性部署"
echo ""

cat > "$HOOK_FILE" << 'HOOK_EOF'
#!/usr/bin/env bash
# ab-dotfiles git post-merge hook
# 每次 git pull 成功後，自動針對性更新變更的 Claude / zsh 環境模組
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "🔄 [ab-dotfiles] 偵測更新中..."
bash "$REPO_DIR/scripts/auto-update.sh" 2>&1 | tee -a "$REPO_DIR/.update.log"
HOOK_EOF

chmod +x "$HOOK_FILE"
success "已安裝 .git/hooks/post-merge"
echo ""
echo -e "  ${BOLD}觸發方式：${NC}"
echo -e "    • git pull           → 自動執行（已安裝）"
echo -e "    • pnpm run update    → 手動執行一次"
echo -e "    • pnpm run update -- --dry-run  → 預覽變更"
echo ""
echo -e "  ${BOLD}移除：${NC} pnpm run hooks -- --off"
