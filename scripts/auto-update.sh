#!/usr/bin/env bash
# =============================================================================
# scripts/auto-update.sh
# 從 GitHub 自動拉取最新版本，針對性更新變更部分
#
# 用法：
#   bash scripts/auto-update.sh            ← 手動執行
#   bash scripts/auto-update.sh --dry-run  ← 只顯示變更，不實際更新
#   pnpm run update                        ← 透過 pnpm 執行
#
# 自動觸發：
#   - git pull 後（由 .git/hooks/post-merge 呼叫）
#
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BLUE='\033[0;34m'; DIM='\033[2m'; RED='\033[0;31m'; NC='\033[0m'

step()    { echo -e "\n${BOLD}$1${NC}"; }
info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
success() { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
skip()    { echo -e "  ${DIM}─ $1${NC}"; }

REPO_NAME="ab-dotfiles"
REPO_BRANCH="master"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ab-dotfiles 自動更新                       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${DIM}來源：$REPO_NAME@$REPO_BRANCH${NC}"
echo -e "  ${DIM}路徑：$REPO_DIR${NC}"
$DRY_RUN && echo -e "  ${YELLOW}[DRY RUN 模式 — 只顯示變更，不實際執行]${NC}"

cd "$REPO_DIR"

# ── Step 1：確認 git 狀態 ─────────────────────────────────────────
step "① 檢查 GitHub 遠端版本"

if ! git remote get-url origin &>/dev/null; then
  warn "此倉庫沒有 git remote，跳過更新"
  exit 0
fi

git fetch origin "$REPO_BRANCH" --quiet 2>/dev/null || {
  warn "無法連線到 GitHub（$REPO_NAME），略過本次更新"
  exit 0
}

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$REPO_BRANCH")

if [[ "$LOCAL" == "$REMOTE" ]]; then
  success "已是最新版本（$(git log -1 --format='%h %s')）"
  exit 0
fi

# 列出有哪些 commit 要拉
COMMIT_COUNT=$(git rev-list HEAD.."origin/$REPO_BRANCH" --count)
info "發現 $COMMIT_COUNT 個新 commit："
git log HEAD.."origin/$REPO_BRANCH" --oneline | sed 's/^/    /'
echo ""

# ── Step 2：偵測哪些檔案有變更 ───────────────────────────────────
step "② 分析變更範圍"

CHANGED_FILES=$(git diff --name-only HEAD "origin/$REPO_BRANCH")

# 分類變更
COMMANDS_CHANGED=$(echo "$CHANGED_FILES" | grep "^claude/commands/" | sed 's|claude/commands/||;s|\.md$||' | tr '\n' ',' | sed 's/,$//')
AGENTS_CHANGED=$(echo "$CHANGED_FILES"   | grep "^claude/agents/"   | sed 's|claude/agents/||;s|\.md$||'   | tr '\n' ',' | sed 's/,$//')
RULES_CHANGED=$(echo "$CHANGED_FILES"    | grep "^claude/rules/"    | sed 's|claude/rules/||;s|\.md$||'    | tr '\n' ',' | sed 's/,$//')
HOOKS_CHANGED=$(echo "$CHANGED_FILES"    | grep -c "claude/hooks.json" || true)
ZSH_MODULES=$(echo "$CHANGED_FILES"      | grep "^zsh/modules/"     | sed 's|zsh/modules/||;s|\.zsh$||'     | tr '\n' ',' | sed 's/,$//')
ZSHRC_CHANGED=$(echo "$CHANGED_FILES"    | grep -c "^zsh/zshrc$" || true)

# 顯示分析結果
[[ -n "$COMMANDS_CHANGED" ]] && info "Claude commands：$COMMANDS_CHANGED" || skip "Claude commands（無變更）"
[[ -n "$AGENTS_CHANGED"   ]] && info "Claude agents：$AGENTS_CHANGED"     || skip "Claude agents（無變更）"
[[ -n "$RULES_CHANGED"    ]] && info "Claude rules：$RULES_CHANGED"       || skip "Claude rules（無變更）"
[[ "$HOOKS_CHANGED" -gt 0 ]] && info "hooks.json：有變更"                 || skip "hooks.json（無變更）"
[[ -n "$ZSH_MODULES"      ]] && info "zsh 環境模組：$ZSH_MODULES"          || skip "zsh 環境模組（無變更）"
[[ "$ZSHRC_CHANGED" -gt 0 ]] && info "~/.zshrc：有變更"                   || skip "~/.zshrc（無變更）"

# 若完全沒有可處理的變更
if [[ -z "$COMMANDS_CHANGED" && -z "$AGENTS_CHANGED" && -z "$RULES_CHANGED" \
   && "$HOOKS_CHANGED" -eq 0 && -z "$ZSH_MODULES" && "$ZSHRC_CHANGED" -eq 0 ]]; then
  info "其他變更（README / scripts / package.json 等），不需重新部署"
  $DRY_RUN || git pull origin "$REPO_BRANCH" --quiet
  success "已拉取最新版本"
  exit 0
fi

# Dry run 到此結束
if $DRY_RUN; then
  echo ""
  echo -e "${YELLOW}[DRY RUN] 以上為預計執行的更新，實際未變更任何檔案${NC}"
  exit 0
fi

# ── Step 3：git pull ──────────────────────────────────────────────
step "③ 拉取最新版本"
git pull origin "$REPO_BRANCH" --quiet
success "git pull 完成"

# ── Step 4：針對性部署 ────────────────────────────────────────────
step "④ 針對性部署"

DEPLOYED=0

# Claude commands
if [[ -n "$COMMANDS_CHANGED" ]]; then
  info "更新 commands：$COMMANDS_CHANGED"
  bash "$REPO_DIR/scripts/install-claude.sh" --commands "$COMMANDS_CHANGED"
  DEPLOYED=$((DEPLOYED + 1))
fi

# Claude agents
if [[ -n "$AGENTS_CHANGED" ]]; then
  info "更新 agents：$AGENTS_CHANGED"
  bash "$REPO_DIR/scripts/install-claude.sh" --agents "$AGENTS_CHANGED"
  DEPLOYED=$((DEPLOYED + 1))
fi

# Hooks
if [[ "$HOOKS_CHANGED" -gt 0 ]]; then
  info "更新 hooks.json"
  bash "$REPO_DIR/scripts/install-claude.sh" --hooks
  DEPLOYED=$((DEPLOYED + 1))
fi

# zsh 環境模組
if [[ -n "$ZSH_MODULES" ]]; then
  info "更新 zsh 環境模組：$ZSH_MODULES"
  zsh "$REPO_DIR/zsh/install.sh" --modules "$ZSH_MODULES"
  DEPLOYED=$((DEPLOYED + 1))
fi

# Claude rules
if [[ -n "$RULES_CHANGED" ]]; then
  info "更新 rules：$RULES_CHANGED"
  bash "$REPO_DIR/scripts/install-claude.sh" --rules "$RULES_CHANGED"
  DEPLOYED=$((DEPLOYED + 1))
fi

# zshrc
if [[ "$ZSHRC_CHANGED" -gt 0 ]]; then
  info "更新 ~/.zshrc"
  [[ -f ~/.zshrc ]] && cp ~/.zshrc "$HOME/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$REPO_DIR/zsh/zshrc" ~/.zshrc
  success "~/.zshrc 已更新"
  DEPLOYED=$((DEPLOYED + 1))
fi

# ── 完成 ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ 自動更新完成                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  已更新 ${BOLD}$DEPLOYED${NC} 個區塊"
echo -e "  版本：$(git log -1 --format='%h %s')"
echo -e "  時間：$(date '+%Y-%m-%d %H:%M:%S')"

# 記錄到 log
LOG_FILE="$REPO_DIR/.update.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') | $(git log -1 --format='%h') | deployed=$DEPLOYED" >> "$LOG_FILE"
