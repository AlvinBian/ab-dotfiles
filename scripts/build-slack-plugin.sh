#!/usr/bin/env bash
# =============================================================================
# scripts/build-slack-plugin.sh
# 打包 ab-slack-message.plugin
#
# 包含內容：
#   skills: draft-slack, review-slack, slack-formatting
#   rules:  slack-mrkdwn.md
#   plugin.json
#
# 用法：
#   bash scripts/build-slack-plugin.sh
#   pnpm run build:slack
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/tmp/ab-slack-plugin-$$"
DIST_DIR="$REPO_DIR/dist/release"
OUTPUT="$DIST_DIR/ab-slack-message.plugin"
mkdir -p "$DIST_DIR"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

PLUGIN_VERSION="$(python3 -c "import json; print(json.load(open('$REPO_DIR/package.json')).get('version','1.0.0'))" 2>/dev/null || echo '1.0.0')"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ab-slack-message Plugin Builder  v$PLUGIN_VERSION    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"

mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/.claude-plugin" \
         "$BUILD_DIR/skills" \
         "$BUILD_DIR/rules"

# ── plugin.json ───────────────────────────────────────────────────
cat > "$BUILD_DIR/.claude-plugin/plugin.json" << JSON_EOF
{
  "name": "ab-slack-message",
  "version": "$PLUGIN_VERSION",
  "description": "Slack mrkdwn 訊息工具 — 起草、審查、格式化",
  "author": "ab-dotfiles",
  "keywords": ["slack", "mrkdwn", "messaging", "draft", "review"]
}
JSON_EOF

# ── Skills（3 個 slack commands）────────────────────────────────
echo -e "${BLUE}📦 Skills${NC}"
SKILL_COUNT=0
for skill in draft-slack review-slack slack-formatting; do
  f="$REPO_DIR/claude/commands/$skill.md"
  if [[ -f "$f" ]]; then
    mkdir -p "$BUILD_DIR/skills/$skill"
    cp "$f" "$BUILD_DIR/skills/$skill/SKILL.md"
    echo -e "   ${GREEN}✔${NC} /$skill"
    SKILL_COUNT=$((SKILL_COUNT + 1))
  else
    echo -e "   ${YELLOW}⚠${NC} /$skill 不存在，略過"
  fi
done

# ── Rules ─────────────────────────────────────────────────────────
echo -e "${BLUE}📋 Rules${NC}"
RULE_FILE="$REPO_DIR/claude/rules/slack-mrkdwn.md"
if [[ -f "$RULE_FILE" ]]; then
  cp "$RULE_FILE" "$BUILD_DIR/rules/slack-mrkdwn.md"
  echo -e "   ${GREEN}✔${NC} slack-mrkdwn.md"
else
  echo -e "   ${YELLOW}⚠${NC} claude/rules/slack-mrkdwn.md 不存在"
fi

# ── 壓縮打包 + 保留資料夾供查閱 ──────────────────────────────────
PREVIEW_DIR="$DIST_DIR/ab-slack-message"
rm -rf "$PREVIEW_DIR"
cp -r "$BUILD_DIR" "$PREVIEW_DIR"
(cd "$BUILD_DIR" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
rm -rf "$BUILD_DIR"

FILE_SIZE=$(du -sh "$OUTPUT" | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ ab-slack-message.plugin 打包完成        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${BOLD}版    本：${NC} $PLUGIN_VERSION"
echo -e "  ${BOLD}內    容：${NC} $SKILL_COUNT skills · slack-mrkdwn rule"
echo -e "  ${BOLD}輸出路徑：${NC} $OUTPUT（$FILE_SIZE）"
echo ""
echo -e "${YELLOW}📌 將 dist/release/ab-slack-message.plugin 拖入 Claude Desktop App 安裝${NC}"
