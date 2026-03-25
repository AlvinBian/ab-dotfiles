#!/usr/bin/env bash
# =============================================================================
# scripts/build-plugin.sh
# 打包 Claude Cowork 插件（.plugin）供 Cowork Desktop App 安裝
#
# 用法：
#   pnpm run build:plugin
#   bash scripts/build-plugin.sh
#
# 輸出：dist/ab-dotfiles.plugin
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/tmp/ab-dotfiles-plugin-$$"
DIST_DIR="$REPO_DIR/dist"
OUTPUT="$DIST_DIR/ab-dotfiles.plugin"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

# 讀取 plugin 基本資訊
PLUGIN_NAME="ab-dotfiles"
PLUGIN_VERSION="$(python3 -c "import json; d=json.load(open('$REPO_DIR/package.json')); print(d['version'])" 2>/dev/null || echo '1.0.0')"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Claude Cowork 插件打包                     ║${NC}"
echo -e "${BOLD}║   $PLUGIN_NAME  v$PLUGIN_VERSION                          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/.claude-plugin" "$BUILD_DIR/skills" "$BUILD_DIR/agents" "$BUILD_DIR/hooks"

# ── plugin.json ──────────────────────────────────────────────────
cat > "$BUILD_DIR/.claude-plugin/plugin.json" << JSON_EOF
{
  "name": "$PLUGIN_NAME",
  "version": "$PLUGIN_VERSION",
  "description": "Alvin Bian 個人開發工具包：KKday 開發規範、PR 流程、Code Review、測試生成、Slack 訊息格式",
  "author": { "name": "Alvin Bian", "email": "alvin.bian@kkday.com" },
  "keywords": ["kkday", "code-review", "pr-workflow", "test-gen", "slack", "vue", "typescript", "php"]
}
JSON_EOF

# ── Slash Commands → skills/ ──────────────────────────────────────
echo -e "${BLUE}📦 Slash Commands${NC}"
CMD_COUNT=0
for f in "$REPO_DIR/claude/commands/"*.md; do
  name=$(basename "$f" .md)
  mkdir -p "$BUILD_DIR/skills/$name"
  cp "$f" "$BUILD_DIR/skills/$name/SKILL.md"
  echo -e "   ${GREEN}✅${NC} /${name}"
  CMD_COUNT=$((CMD_COUNT + 1))
done
echo -e "   ${CYAN}→ $CMD_COUNT 個 commands 已打包${NC}"
echo ""

# ── Agents ───────────────────────────────────────────────────────
echo -e "${BLUE}🤖 Agents${NC}"
AGENT_COUNT=0
for f in "$REPO_DIR/claude/agents/"*.md; do
  name=$(basename "$f" .md)
  cp "$f" "$BUILD_DIR/agents/"
  echo -e "   ${GREEN}✅${NC} @$name"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done
echo -e "   ${CYAN}→ $AGENT_COUNT 個 agents 已打包${NC}"
echo ""

# ── Hooks ─────────────────────────────────────────────────────────
echo -e "${BLUE}🪝 Hooks${NC}"
cp "$REPO_DIR/claude/hooks.json" "$BUILD_DIR/hooks/hooks.json"
HOOK_EVENTS=$(python3 -c "
import json
d = json.load(open('$REPO_DIR/claude/hooks.json'))
hooks = d.get('hooks', {})
for event, items in hooks.items():
    print(f'   • {event}: {len(items)} 條規則')
" 2>/dev/null || echo "   • hooks 已打包")
echo "$HOOK_EVENTS"
echo ""

# ── README ────────────────────────────────────────────────────────
cp "$REPO_DIR/README.md" "$BUILD_DIR/README.md"

# ── 打包 zip → .plugin ───────────────────────────────────────────
(cd "$BUILD_DIR" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
rm -rf "$BUILD_DIR"

# 取得檔案大小
FILE_SIZE=$(du -sh "$OUTPUT" | awk '{print $1}')

echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ 插件打包完成                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}插件名稱：${NC} $PLUGIN_NAME"
echo -e "  ${BOLD}版    本：${NC} $PLUGIN_VERSION"
echo -e "  ${BOLD}內    容：${NC} $CMD_COUNT commands · $AGENT_COUNT agents · hooks"
echo -e "  ${BOLD}檔案大小：${NC} $FILE_SIZE"
echo -e "  ${BOLD}輸出路徑：${NC} $OUTPUT"
echo ""
echo -e "${YELLOW}📌 安裝到 Cowork Desktop App：${NC}"
echo -e "   將 ${BOLD}dist/ab-dotfiles.plugin${NC} 拖入 Claude Desktop App 視窗"
echo ""
echo -e "${YELLOW}🔄 更新流程：${NC}"
echo -e "   1. 修改 ${BOLD}claude/commands/${NC} 或 ${BOLD}claude/agents/${NC}"
echo -e "   2. ${BOLD}pnpm run deploy${NC}  ← CLI + Cowork 同步更新"
echo -e "   3. 重新拖入 .plugin 安裝"
