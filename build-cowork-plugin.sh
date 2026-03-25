#!/usr/bin/env bash
# =============================================================================
# build-cowork-plugin.sh
# 從 ~/scripts/claude-commands/ 打包成 ab-dotfiles.plugin，供 Cowork 安裝
#
# 用法：bash ~/Documents/MyProjects/ab-dotfiles/build-cowork-plugin.sh
# 輸出：~/scripts/ab-dotfiles.plugin（拖入 Cowork Desktop App 安裝）
#
# ~/scripts/ 是唯一 source of truth：
#   - install-to-claude-code.sh  → Claude Code CLI / VSCode / JetBrains
#   - build-cowork-plugin.sh     → Cowork Desktop App
# =============================================================================
set -e

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="/tmp/ab-dotfiles-plugin-$$"
OUTPUT="$SCRIPTS_DIR/ab-dotfiles.plugin"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}=== 打包 ab-dotfiles.plugin ===${NC}"

# 清理並建立 build 目錄
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/.claude-plugin"
mkdir -p "$BUILD_DIR/skills"
mkdir -p "$BUILD_DIR/agents"
mkdir -p "$BUILD_DIR/hooks"

# plugin.json
cat > "$BUILD_DIR/.claude-plugin/plugin.json" << 'JSON_EOF'
{
  "name": "ab-dotfiles",
  "version": "1.0.0",
  "description": "Alvin Bian 個人開發工具包：KKday 開發規範、PR 流程、Code Review、測試生成、Slack 訊息格式",
  "author": { "name": "Alvin Bian", "email": "alvin.bian@kkday.com" },
  "keywords": ["kkday", "code-review", "pr-workflow", "test-gen", "slack", "vue", "typescript", "php"]
}
JSON_EOF

# claude-commands/*.md → skills/{name}/SKILL.md
echo -e "${BLUE}📦 打包 skills...${NC}"
for f in "$SCRIPTS_DIR/claude-commands/"*.md; do
  name=$(basename "$f" .md)
  mkdir -p "$BUILD_DIR/skills/$name"
  cp "$f" "$BUILD_DIR/skills/$name/SKILL.md"
  echo -e "${GREEN}  ✅ skills/$name/SKILL.md${NC}"
done

# claude-agents/*.md → agents/
echo -e "${BLUE}🤖 打包 agents...${NC}"
for f in "$SCRIPTS_DIR/claude-agents/"*.md; do
  cp "$f" "$BUILD_DIR/agents/"
  echo -e "${GREEN}  ✅ agents/$(basename $f)${NC}"
done

# claude-hooks.json → hooks/hooks.json
echo -e "${BLUE}🪝 打包 hooks...${NC}"
cp "$SCRIPTS_DIR/claude-hooks.json" "$BUILD_DIR/hooks/hooks.json"
echo -e "${GREEN}  ✅ hooks/hooks.json${NC}"

# README
cp "$SCRIPTS_DIR/README.md" "$BUILD_DIR/README.md"

# 打包 zip → .plugin
(cd "$BUILD_DIR" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
rm -rf "$BUILD_DIR"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 打包完成：$OUTPUT${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📦 安裝到 Cowork："
echo "   將 ab-dotfiles.plugin 拖入 Claude Desktop App 視窗即可安裝"
echo ""
echo "🔄 更新流程（修改 claude-commands/ 後）："
echo "   1. bash ~/Documents/MyProjects/ab-dotfiles/install-to-claude-code.sh  ← CLI/VSCode 立即生效"
echo "   2. bash ~/Documents/MyProjects/ab-dotfiles/build-cowork-plugin.sh     ← 重新打包"
echo "   3. 拖入 Cowork 重新安裝 .plugin              ← Cowork 生效"
