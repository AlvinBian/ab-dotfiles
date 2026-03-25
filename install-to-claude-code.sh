#!/usr/bin/env bash
# =============================================================================
# install-to-claude-code.sh
# 將 ~/scripts/claude-commands、claude-agents、claude-hooks.json
# 安裝到 Claude Code CLI 全域設定（~/.claude/）
# 用法：bash ~/scripts/install-to-claude-code.sh
# =============================================================================
set -e

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
AGENTS_DIR="$CLAUDE_DIR/agents"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo -e "${BLUE}=== Claude Code CLI 全域設定安裝 ===${NC}"

# 建立目錄
mkdir -p "$COMMANDS_DIR" "$AGENTS_DIR"

# 複製 slash commands
echo -e "${BLUE}📦 安裝 slash commands...${NC}"
for f in "$SCRIPTS_DIR/claude-commands/"*.md; do
  cp "$f" "$COMMANDS_DIR/"
  echo -e "${GREEN}  ✅ $(basename $f)${NC}"
done

# 複製 agents
echo -e "${BLUE}🤖 安裝 agents...${NC}"
for f in "$SCRIPTS_DIR/claude-agents/"*.md; do
  cp "$f" "$AGENTS_DIR/"
  echo -e "${GREEN}  ✅ $(basename $f)${NC}"
done

# 合併 hooks 到 settings.json
echo -e "${BLUE}🪝 安裝 hooks...${NC}"
HOOKS_FILE="$SCRIPTS_DIR/claude-hooks.json"

if [ ! -f "$HOOKS_FILE" ]; then
  echo -e "${YELLOW}  ⚠️  claude-hooks.json 不存在，略過${NC}"
else
  python3 - "$SETTINGS_FILE" "$HOOKS_FILE" << 'PYEOF'
import json, sys, os
settings_path, hooks_path = sys.argv[1], sys.argv[2]
new_hooks = json.load(open(hooks_path))["hooks"]
existing = {}
if os.path.exists(settings_path):
  with open(settings_path) as f:
    try: existing = json.load(f)
    except: pass
  import shutil; shutil.copy(settings_path, settings_path + ".bak")
if "hooks" not in existing: existing["hooks"] = {}
for event, hooks in new_hooks.items():
  if event not in existing["hooks"]:
    existing["hooks"][event] = hooks
  else:
    matchers = {h.get("matcher","") for h in existing["hooks"][event]}
    for h in hooks:
      if h.get("matcher","") not in matchers:
        existing["hooks"][event].append(h)
with open(settings_path, "w") as f:
  json.dump(existing, f, indent=2, ensure_ascii=False)
print("  ✅ hooks 合併完成")
PYEOF
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 安裝完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📁 Slash commands ($(ls $COMMANDS_DIR/*.md 2>/dev/null | wc -l | tr -d ' ') 個) → $COMMANDS_DIR/"
echo "🤖 Agents        ($(ls $AGENTS_DIR/*.md  2>/dev/null | wc -l | tr -d ' ') 個) → $AGENTS_DIR/"
echo "🪝 Hooks         → $SETTINGS_FILE"
echo ""
echo -e "${YELLOW}⚠️  Hooks 在下次 claude 啟動後生效${NC}"
echo "💡 日後更新：bash ~/scripts/install-to-claude-code.sh"
