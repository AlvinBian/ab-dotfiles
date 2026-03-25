#!/usr/bin/env bash
# =============================================================================
# scripts/install-claude.sh
# 安裝 claude/ 設定到 ~/.claude/
#
# 用法：
#   bash scripts/install-claude.sh                          ← 全部安裝
#   bash scripts/install-claude.sh --commands "a,b" --agents "explorer" --hooks
#   （由 bin/setup.mjs 傳入具體選擇）
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
AGENTS_DIR="$CLAUDE_DIR/agents"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# ── 解析參數 ──────────────────────────────────────────────────────
SELECTED_COMMANDS=""
SELECTED_AGENTS=""
INSTALL_HOOKS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commands) SELECTED_COMMANDS="$2"; shift 2 ;;
    --agents)   SELECTED_AGENTS="$2";   shift 2 ;;
    --hooks)    INSTALL_HOOKS=true;     shift ;;
    *)          shift ;;
  esac
done

# 若未指定，預設全部
if [[ -z "$SELECTED_COMMANDS" && -z "$SELECTED_AGENTS" && "$INSTALL_HOOKS" == false ]]; then
  SELECTED_COMMANDS="all"
  SELECTED_AGENTS="all"
  INSTALL_HOOKS=true
fi

mkdir -p "$COMMANDS_DIR" "$AGENTS_DIR"

# ── 安裝 commands ─────────────────────────────────────────────────
if [[ -n "$SELECTED_COMMANDS" ]]; then
  echo -e "${BLUE}📦 安裝 slash commands...${NC}"
  IFS=',' read -ra CMD_LIST <<< "$SELECTED_COMMANDS"
  for f in "$REPO_DIR/claude/commands/"*.md; do
    name=$(basename "$f" .md)
    if [[ "$SELECTED_COMMANDS" == "all" ]] || printf '%s\n' "${CMD_LIST[@]}" | grep -qx "$name"; then
      cp "$f" "$COMMANDS_DIR/"
      echo -e "${GREEN}  ✅ /$name${NC}"
    fi
  done
fi

# ── 安裝 agents ───────────────────────────────────────────────────
if [[ -n "$SELECTED_AGENTS" ]]; then
  echo -e "${BLUE}🤖 安裝 agents...${NC}"
  IFS=',' read -ra AGENT_LIST <<< "$SELECTED_AGENTS"
  for f in "$REPO_DIR/claude/agents/"*.md; do
    name=$(basename "$f" .md)
    if [[ "$SELECTED_AGENTS" == "all" ]] || printf '%s\n' "${AGENT_LIST[@]}" | grep -qx "$name"; then
      cp "$f" "$AGENTS_DIR/"
      echo -e "${GREEN}  ✅ @$name${NC}"
    fi
  done
fi

# ── 安裝 hooks ────────────────────────────────────────────────────
if [[ "$INSTALL_HOOKS" == true ]]; then
  echo -e "${BLUE}🪝 安裝 hooks...${NC}"
  HOOKS_FILE="$REPO_DIR/claude/hooks.json"
  if [ ! -f "$HOOKS_FILE" ]; then
    echo -e "${YELLOW}  ⚠️  claude/hooks.json 不存在，略過${NC}"
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
fi
