#!/usr/bin/env bash
# =============================================================================
# scripts/install-claude.sh
# Claude 設定安裝 — manifest 追蹤，尊重本地修改
#
# 優先順序：
#   1. 當前專案 .claude/（若 CWD 有 .claude/ 目錄）
#   2. ~/.claude/ 中已本地修改的檔案（manifest hash 不一致 → 略過）
#   3. ab-dotfiles 模板（只填補未修改 / 不存在的位置）
#
# 用法：
#   bash scripts/install-claude.sh                            ← 全部安裝
#   bash scripts/install-claude.sh --commands "a,b" --hooks  ← 指定安裝
#   bash scripts/install-claude.sh --force                   ← 強制覆蓋（忽略本地修改）
#
# Manifest：~/.claude/.ab-manifest（JSON，記錄安裝時各檔 hash）
# ab.config.json：僅讀取 kkday_repos
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INVOKE_DIR="$(pwd)"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
AGENTS_DIR="$CLAUDE_DIR/agents"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
MANIFEST_FILE="$CLAUDE_DIR/.ab-manifest"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BLUE='\033[0;34m'; DIM='\033[2m'; RED='\033[0;31m'; NC='\033[0m'

# ── 解析參數 ──────────────────────────────────────────────────────
SELECTED_COMMANDS=""
SELECTED_AGENTS=""
SELECTED_RULES=""
INSTALL_HOOKS=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commands) SELECTED_COMMANDS="$2"; shift 2 ;;
    --agents)   SELECTED_AGENTS="$2";   shift 2 ;;
    --rules)    SELECTED_RULES="$2";    shift 2 ;;
    --hooks)    INSTALL_HOOKS=true;     shift ;;
    --force)    FORCE=true;             shift ;;
    *)          shift ;;
  esac
done

if [[ -z "$SELECTED_COMMANDS" && -z "$SELECTED_AGENTS" && -z "$SELECTED_RULES" && "$INSTALL_HOOKS" == false ]]; then
  SELECTED_COMMANDS="all"
  SELECTED_AGENTS="all"
  # rules 不列為預設，需明確傳 --rules 才安裝（避免 pnpm run deploy 非預期帶入規範檔案）
  INSTALL_HOOKS=true
fi

# ── 偵測當前專案 .claude/（CWD 非 ab-dotfiles 本身）─────────────
PROJECT_COMMANDS_DIR=""
PROJECT_AGENTS_DIR=""

if [[ "$INVOKE_DIR" != "$REPO_DIR" ]]; then
  [[ -d "$INVOKE_DIR/.claude/commands" ]] && PROJECT_COMMANDS_DIR="$INVOKE_DIR/.claude/commands"
  [[ -d "$INVOKE_DIR/.claude/agents"   ]] && PROJECT_AGENTS_DIR="$INVOKE_DIR/.claude/agents"
fi

mkdir -p "$COMMANDS_DIR" "$AGENTS_DIR"

# ── Manifest 工具 ─────────────────────────────────────────────────
_file_hash() {
  md5 -q "$1" 2>/dev/null || md5sum "$1" 2>/dev/null | awk '{print $1}' || echo ""
}

_manifest_get() {
  python3 -c "
import json, os
try:
  d = json.load(open('$MANIFEST_FILE'))
  print(d.get('files', {}).get('$1', ''))
except:
  print('')
" 2>/dev/null
}

_manifest_set() {
  local key="$1" hash="$2"
  python3 << PYEOF
import json, os, sys
manifest = '$MANIFEST_FILE'
data = {}
if os.path.exists(manifest):
  try: data = json.load(open(manifest))
  except: pass
if 'files' not in data:
  data['files'] = {}
data['files']['$key'] = '$hash'
with open(manifest, 'w') as f:
  json.dump(data, f, indent=2, ensure_ascii=False)
PYEOF
}

# ── 智慧安裝（manifest 追蹤 + 優先順序）─────────────────────────
# $1=src（ab-dotfiles 模板） $2=dest（~/.claude/...） $3=manifest key $4=label
# $5=project_src（可選：專案自訂版本）
_install_file() {
  local src="$1" dest="$2" key="$3" label="$4" project_src="${5:-}"

  # 1. 有專案自訂版本 → 用專案版本（不更新 manifest，這不是 ab-dotfiles 的檔案）
  if [[ -n "$project_src" && -f "$project_src" ]]; then
    if [[ -f "$dest" ]] && diff -q "$project_src" "$dest" &>/dev/null; then
      echo -e "${DIM}  ─ $label（專案版本，無變更）${NC}"
    else
      cp "$project_src" "$dest"
      echo -e "${GREEN}  ✅ $label ${CYAN}[專案優先]${NC}"
    fi
    return
  fi

  [[ ! -f "$src" ]] && return

  local src_hash dest_hash saved_hash
  src_hash=$(_file_hash "$src")

  # 2. 目標不存在 → 直接安裝
  if [[ ! -f "$dest" ]]; then
    cp "$src" "$dest"
    _manifest_set "$key" "$src_hash"
    echo -e "${GREEN}  ✅ $label${NC}"
    return
  fi

  dest_hash=$(_file_hash "$dest")

  # 3. 目標與來源相同 → 無需更新
  if [[ "$src_hash" == "$dest_hash" ]]; then
    echo -e "${DIM}  ─ $label（無變更）${NC}"
    _manifest_set "$key" "$src_hash"
    return
  fi

  saved_hash=$(_manifest_get "$key")

  # 4. manifest 有記錄：比較本地檔案是否被修改過
  if [[ -n "$saved_hash" ]]; then
    if [[ "$dest_hash" != "$saved_hash" && "$FORCE" != true ]]; then
      # 本地有修改，略過（保護使用者的自訂）
      echo -e "${YELLOW}  ⚠ $label（本地已修改，略過）${NC}"
      return
    fi
  fi

  # 5. 安全更新（無本地修改 or --force）
  cp "$dest" "${dest}.bak" 2>/dev/null || true
  cp "$src" "$dest"
  _manifest_set "$key" "$src_hash"
  [[ "$FORCE" == true ]] \
    && echo -e "${GREEN}  ✅ $label ${YELLOW}[--force 覆蓋]${NC}" \
    || echo -e "${GREEN}  ✅ $label${NC}"
}

# ── 安裝 commands ─────────────────────────────────────────────────
if [[ -n "$SELECTED_COMMANDS" ]]; then
  echo -e "${BLUE}📦 Slash Commands${NC}"
  [[ -n "$PROJECT_COMMANDS_DIR" ]] && \
    echo -e "${DIM}   偵測到專案 .claude/commands/（同名時專案版本優先）${NC}"

  IFS=',' read -ra CMD_LIST <<< "$SELECTED_COMMANDS"
  for f in "$REPO_DIR/claude/commands/"*.md; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f" .md)
    if [[ "$SELECTED_COMMANDS" == "all" ]] || printf '%s\n' "${CMD_LIST[@]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -qx "$name"; then
      _install_file \
        "$f" \
        "$COMMANDS_DIR/$name.md" \
        "commands/$name.md" \
        "/$name" \
        "${PROJECT_COMMANDS_DIR:+$PROJECT_COMMANDS_DIR/$name.md}"
    fi
  done
fi

# ── 安裝 agents ───────────────────────────────────────────────────
if [[ -n "$SELECTED_AGENTS" ]]; then
  echo -e "${BLUE}🤖 Agents${NC}"
  [[ -n "$PROJECT_AGENTS_DIR" ]] && \
    echo -e "${DIM}   偵測到專案 .claude/agents/（同名時專案版本優先）${NC}"

  IFS=',' read -ra AGENT_LIST <<< "$SELECTED_AGENTS"
  for f in "$REPO_DIR/claude/agents/"*.md; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f" .md)
    if [[ "$SELECTED_AGENTS" == "all" ]] || printf '%s\n' "${AGENT_LIST[@]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -qx "$name"; then
      _install_file \
        "$f" \
        "$AGENTS_DIR/$name.md" \
        "agents/$name.md" \
        "@$name" \
        "${PROJECT_AGENTS_DIR:+$PROJECT_AGENTS_DIR/$name.md}"
    fi
  done
fi

# ── 安裝 hooks ────────────────────────────────────────────────────
if [[ "$INSTALL_HOOKS" == true ]]; then
  echo -e "${BLUE}🪝 Hooks${NC}"
  HOOKS_FILE="$REPO_DIR/claude/hooks.json"
  if [[ ! -f "$HOOKS_FILE" ]]; then
    echo -e "${YELLOW}  ⚠ claude/hooks.json 不存在，略過${NC}"
  else
    HOOKS_HASH=$(_file_hash "$HOOKS_FILE")

    # 本地 settings.json 被修改過（且不是 --force）→ 只 merge，不覆蓋
    python3 - "$SETTINGS_FILE" "$HOOKS_FILE" << 'PYEOF'
import json, sys, os, shutil

settings_path = sys.argv[1]
hooks_path    = sys.argv[2]

new_hooks = json.load(open(hooks_path))["hooks"]
existing  = {}

if os.path.exists(settings_path):
  with open(settings_path) as f:
    try: existing = json.load(f)
    except: pass
  shutil.copy(settings_path, settings_path + ".bak")

if "hooks" not in existing:
  existing["hooks"] = {}

for event, hooks in new_hooks.items():
  if event not in existing["hooks"]:
    existing["hooks"][event] = hooks
  else:
    matchers = {h.get("matcher", "") for h in existing["hooks"][event]}
    for h in hooks:
      if h.get("matcher", "") not in matchers:
        existing["hooks"][event].append(h)

with open(settings_path, "w") as f:
  json.dump(existing, f, indent=2, ensure_ascii=False)

print("  \033[0;32m✅ hooks 合併完成\033[0m")
PYEOF
    _manifest_set "hooks" "$HOOKS_HASH"
  fi
fi

# ── 安裝 rules ────────────────────────────────────────────────────
if [[ -n "$SELECTED_RULES" ]]; then
  RULES_DIR="$CLAUDE_DIR/rules"
  mkdir -p "$RULES_DIR"
  RULES_SRC="$REPO_DIR/claude/rules"
  if [[ ! -d "$RULES_SRC" ]]; then
    echo -e "${YELLOW}  ⚠ claude/rules/ 不存在，略過${NC}"
  else
    echo -e "${BLUE}📋 Rules${NC}"
    IFS=',' read -ra RULE_LIST <<< "$SELECTED_RULES"
    for f in "$RULES_SRC/"*.md; do
      [[ -f "$f" ]] || continue
      name=$(basename "$f" .md)
      if [[ "$SELECTED_RULES" == "all" ]] || printf '%s\n' "${RULE_LIST[@]}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -qx "$name"; then
        _install_file \
          "$f" \
          "$RULES_DIR/$name.md" \
          "rules/$name.md" \
          "$name"
      fi
    done
  fi
fi

echo ""
echo -e "${DIM}  📋 Manifest：$MANIFEST_FILE${NC}"
