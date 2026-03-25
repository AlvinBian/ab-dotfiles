#!/usr/bin/env bash
# =============================================================================
# scripts/setup-hooks.sh
# 安裝 git hooks + macOS launchd 排程，讓倉庫自動與 GitHub 同步
#
# 安裝後行為：
#   - git pull 後      → 自動執行 auto-update.sh（針對性部署）
#   - 每天上午 9:00    → 自動 fetch + 比較 + 部署（如有更新）
#
# 用法：
#   bash scripts/setup-hooks.sh          ← 安裝全部
#   bash scripts/setup-hooks.sh --uninstall ← 移除全部
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_FILE="$REPO_DIR/.git/hooks/post-merge"
PLIST_LABEL="com.alvin.ab-dotfiles.auto-update"
PLIST_FILE="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

success() { echo -e "  ${GREEN}✔ $1${NC}"; }
info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
step()    { echo -e "\n${BOLD}$1${NC}"; }

# ── 移除模式 ──────────────────────────────────────────────────────
if [[ "$1" == "--uninstall" ]]; then
  echo ""
  echo -e "${BOLD}移除自動更新機制${NC}"
  [[ -f "$HOOK_FILE" ]] && rm "$HOOK_FILE" && success "git post-merge hook 已移除" || warn "hook 不存在"
  if [[ -f "$PLIST_FILE" ]]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm "$PLIST_FILE"
    success "launchd 排程已移除"
  else
    warn "launchd 排程不存在"
  fi
  echo ""
  success "自動更新機制已完全移除"
  exit 0
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   安裝自動更新機制                           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo -e "  倉庫：$REPO_DIR"

# ── Step 1：git post-merge hook ───────────────────────────────────
step "① git post-merge hook（git pull 後自動部署）"

cat > "$HOOK_FILE" << HOOK_EOF
#!/usr/bin/env bash
# 由 ab-dotfiles/scripts/setup-hooks.sh 自動生成
# git pull 成功後，自動針對性更新變更的 Claude / Zsh 設定
REPO_DIR="\$(cd "\$(dirname "\$0")/../.." && pwd)"
bash "\$REPO_DIR/scripts/auto-update.sh" 2>&1 | tee -a "\$REPO_DIR/.update.log"
HOOK_EOF

chmod +x "$HOOK_FILE"
success "已安裝 .git/hooks/post-merge"
info "效果：git pull 後自動觸發 auto-update.sh"

# ── Step 2：launchd 每日定時排程 ─────────────────────────────────
step "② macOS launchd 排程（每天 09:00 自動拉取）"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_FILE" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${REPO_DIR}/scripts/auto-update.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${REPO_DIR}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${REPO_DIR}/.update.log</string>

  <key>StandardErrorPath</key>
  <string>${REPO_DIR}/.update.log</string>

  <key>RunAtLoad</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
PLIST_EOF

# 載入排程
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE"
success "已安裝 launchd 排程（$PLIST_LABEL）"
info "效果：每天 09:00 自動從 GitHub 拉取並部署"

# ── 完成 ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ 自動更新機制安裝完成                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}觸發方式：${NC}"
echo -e "    • git pull          → 立即自動部署變更"
echo -e "    • 每天 09:00        → 自動拉取 GitHub 最新版並部署"
echo -e "    • pnpm run update   → 手動執行一次"
echo ""
echo -e "  ${BOLD}查看更新記錄：${NC}"
echo -e "    tail -f ${REPO_DIR}/.update.log"
echo ""
echo -e "  ${BOLD}移除自動更新：${NC}"
echo -e "    bash scripts/setup-hooks.sh --uninstall"
