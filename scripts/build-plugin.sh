#!/usr/bin/env bash
# =============================================================================
# scripts/build-plugin.sh
# 智慧打包 Claude Cowork 插件（.plugin）
#
# 執行邏輯：
#   1. git pull 拿最新 ab-dotfiles 模板（保持最新）
#   2. 偵測執行位置的專案上下文：
#      - CLAUDE.md        → 提取規則嵌入 plugin.json
#      - .claude/commands/ → 專案自訂指令（優先於 ab-dotfiles 同名指令）
#      - .claude/agents/  → 專案自訂 agents
#      - package.json     → 偵測技術棧，決定要包含哪些 commands
#   3. 合併：專案配置 > ab-dotfiles 模板
#   4. 打包輸出 dist/ab-dotfiles.plugin
#
# 用法：
#   pnpm run build           ← 從 ab-dotfiles 自身打包，或從任意專案目錄執行（自動整合專案配置）
#   pnpm run deploy          ← install + build
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INVOKE_DIR="$(pwd)"          # 執行指令時所在的目錄（可能是任意專案）
BUILD_DIR="/tmp/ab-dotfiles-plugin-$$"
DIST_DIR="$REPO_DIR/dist"
OUTPUT="$DIST_DIR/ab-dotfiles.plugin"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

step()    { echo -e "\n${BOLD}$1${NC}"; }
info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
success() { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
skip()    { echo -e "  ${DIM}─ $1${NC}"; }

PLUGIN_VERSION="$(python3 -c "import json; d=json.load(open('$REPO_DIR/package.json')); print(d.get('version','1.0.0'))" 2>/dev/null || echo '1.0.0')"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ab-dotfiles 智慧插件打包  v$PLUGIN_VERSION            ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"

REPO_NAME="ab-dotfiles"
REPO_BRANCH="master"

# ── Step 1：git pull 取得最新模板 ────────────────────────────────
step "① 同步最新模板（$REPO_NAME@$REPO_BRANCH）"
cd "$REPO_DIR"
git fetch origin "$REPO_BRANCH" --quiet 2>/dev/null && {
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$REPO_BRANCH")
  if [[ "$LOCAL" != "$REMOTE" ]]; then
    git pull origin "$REPO_BRANCH" --quiet
    success "已拉取最新版本（$(git log -1 --format='%h %s')）"
  else
    skip "已是最新版本（$(git log -1 --format='%h')）"
  fi
} || warn "無法連線 GitHub（$REPO_NAME），使用本地版本"
cd "$INVOKE_DIR"

# ── Step 2：偵測專案上下文 ────────────────────────────────────────
step "② 偵測專案上下文"

IS_SELF=false
[[ "$INVOKE_DIR" == "$REPO_DIR" ]] && IS_SELF=true

PROJECT_CLAUDE_MD=""
PROJECT_COMMANDS_DIR=""
PROJECT_AGENTS_DIR=""
PROJECT_NAME=""
TECH_STACK=()
INCLUDE_COMMANDS=()   # 最終要包含的 command 名稱清單

if $IS_SELF; then
  info "執行位置：ab-dotfiles 自身 → 打包完整預設版本"
else
  info "執行位置：$INVOKE_DIR"
  PROJECT_NAME=$(python3 -c "import json; d=json.load(open('package.json')); print(d.get('name',''))" 2>/dev/null || basename "$INVOKE_DIR")

  # ── CLAUDE.md ──────────────────────────────────────────────────
  if [[ -f "$INVOKE_DIR/CLAUDE.md" ]]; then
    PROJECT_CLAUDE_MD="$INVOKE_DIR/CLAUDE.md"
    success "CLAUDE.md 找到（$(wc -l < "$PROJECT_CLAUDE_MD") 行）"
  else
    skip "CLAUDE.md 不存在"
  fi

  # ── .claude/ 目錄 ──────────────────────────────────────────────
  if [[ -d "$INVOKE_DIR/.claude/commands" ]]; then
    PROJECT_COMMANDS_DIR="$INVOKE_DIR/.claude/commands"
    CMD_COUNT=$(ls "$PROJECT_COMMANDS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    success ".claude/commands/ 找到（$CMD_COUNT 個自訂指令，優先採用）"
  else
    skip ".claude/commands/ 不存在"
  fi

  if [[ -d "$INVOKE_DIR/.claude/agents" ]]; then
    PROJECT_AGENTS_DIR="$INVOKE_DIR/.claude/agents"
    AGENT_COUNT=$(ls "$PROJECT_AGENTS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
    success ".claude/agents/ 找到（$AGENT_COUNT 個自訂 agents）"
  else
    skip ".claude/agents/ 不存在"
  fi

  # ── package.json 技術棧偵測 ────────────────────────────────────
  if [[ -f "$INVOKE_DIR/package.json" ]]; then
    PKG=$(cat "$INVOKE_DIR/package.json")

    DETECTED=$(python3 -c "
import json
d = json.load(open('$INVOKE_DIR/package.json'))
deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
stack = []
if 'vue' in deps:           stack.append('vue')
if 'react' in deps:         stack.append('react')
if 'typescript' in deps or '@types/node' in deps: stack.append('typescript')
if 'vite' in deps:          stack.append('vite')
if 'nuxt' in deps:          stack.append('nuxt')
if 'laravel' in str(deps).lower() or 'php' in str(d.get('engines',{})).lower(): stack.append('php')
if '@testing-library' in str(deps) or 'vitest' in deps or 'jest' in deps: stack.append('testing')
print(','.join(stack) if stack else 'general')
" 2>/dev/null || echo "general")
    success "技術棧：$DETECTED"
    IFS=',' read -ra TECH_STACK <<< "$DETECTED"
  fi
fi

# ── Step 3：決定要包含的 commands ─────────────────────────────────
step "③ 組裝 commands 清單"

# 預設全部 ab-dotfiles commands
DEFAULT_CMDS=()
for f in "$REPO_DIR/claude/commands/"*.md; do
  DEFAULT_CMDS+=("$(basename "$f" .md)")
done

# 依技術棧過濾：只保留相關的 commands（從 ab-dotfiles）
_should_include_cmd() {
  local name="$1"
  # 這些指令對所有專案都有用
  case "$name" in
    auto-setup|pr-workflow|draft-slack|slack-formatting|review-slack) return 0 ;;
  esac
  # 技術棧相關
  for tech in "${TECH_STACK[@]}"; do
    case "$tech:$name" in
      vue:code-review|vue:kkday-conventions|vue:test-gen) return 0 ;;
      react:code-review|react:test-gen) return 0 ;;
      typescript:code-review|typescript:kkday-conventions|typescript:test-gen) return 0 ;;
      php:code-review|php:kkday-conventions) return 0 ;;
      testing:test-gen) return 0 ;;
    esac
  done
  # 沒有 tech stack 偵測時（自身打包或 general），全部包含
  [[ ${#TECH_STACK[@]} -eq 0 || "$DETECTED" == "general" || $IS_SELF == true ]] && return 0
  return 1
}

INCLUDED_CMDS=()
SKIPPED_CMDS=()
for cmd in "${DEFAULT_CMDS[@]}"; do
  if _should_include_cmd "$cmd"; then
    INCLUDED_CMDS+=("$cmd")
  else
    SKIPPED_CMDS+=("$cmd")
  fi
done

[[ ${#INCLUDED_CMDS[@]} -gt 0 ]] && success "包含：${INCLUDED_CMDS[*]}"
[[ ${#SKIPPED_CMDS[@]} -gt 0 ]] && skip "略過（與技術棧無關）：${SKIPPED_CMDS[*]}"

# ── Step 4：打包 ──────────────────────────────────────────────────
step "④ 打包中"

mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/.claude-plugin" "$BUILD_DIR/skills" "$BUILD_DIR/agents" "$BUILD_DIR/hooks"

# plugin.json
PLUGIN_DESC="Alvin Bian 個人開發工具包"
[[ -n "$PROJECT_NAME" && ! $IS_SELF ]] && PLUGIN_DESC="$PROJECT_NAME 專案 Claude 配置（基於 ab-dotfiles）"

# 若有 CLAUDE.md，提取前 5 行作為 description 補充
CLAUDE_SUMMARY=""
if [[ -n "$PROJECT_CLAUDE_MD" ]]; then
  CLAUDE_SUMMARY=$(grep -v '^#\|^$\|^---' "$PROJECT_CLAUDE_MD" 2>/dev/null | head -3 | tr '\n' ' ' | cut -c1-100 || true)
  [[ -n "$CLAUDE_SUMMARY" ]] && PLUGIN_DESC="$PLUGIN_DESC | $CLAUDE_SUMMARY"
fi

cat > "$BUILD_DIR/.claude-plugin/plugin.json" << JSON_EOF
{
  "name": "ab-dotfiles",
  "version": "$PLUGIN_VERSION",
  "description": "$PLUGIN_DESC",
  "author": { "name": "Alvin Bian", "email": "alvin.bian@kkday.com" },
  "keywords": ["kkday", "code-review", "pr-workflow", "test-gen", "slack", "vue", "typescript", "php"],
  "techStack": $(python3 -c "import json; s='${TECH_STACK[*]}'; print(json.dumps(s.split() if s.strip() else []))" 2>/dev/null || echo "[]")
}
JSON_EOF

# Commands：專案自訂 > ab-dotfiles（同名時專案優先）
echo -e "${BLUE}📦 Slash Commands${NC}"
CMD_COUNT=0
ADDED_CMDS=""   # 用空格分隔的字串模擬 set

_cmd_added()   { echo " $ADDED_CMDS " | grep -q " $1 "; }
_mark_cmd()    { ADDED_CMDS="$ADDED_CMDS $1"; }

# 先加入專案自訂 commands（若存在）
if [[ -n "$PROJECT_COMMANDS_DIR" ]]; then
  for f in "$PROJECT_COMMANDS_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f" .md)
    mkdir -p "$BUILD_DIR/skills/$name"
    cp "$f" "$BUILD_DIR/skills/$name/SKILL.md"
    echo -e "   ${GREEN}✔${NC} /$name ${CYAN}[專案自訂]${NC}"
    _mark_cmd "$name"
    CMD_COUNT=$((CMD_COUNT + 1))
  done
fi

# 再加入 ab-dotfiles commands（跳過已有的同名）
for name in "${INCLUDED_CMDS[@]}"; do
  _cmd_added "$name" && continue
  f="$REPO_DIR/claude/commands/$name.md"
  [[ -f "$f" ]] || continue
  mkdir -p "$BUILD_DIR/skills/$name"
  cp "$f" "$BUILD_DIR/skills/$name/SKILL.md"
  echo -e "   ${GREEN}✔${NC} /$name"
  CMD_COUNT=$((CMD_COUNT + 1))
done
echo -e "   ${CYAN}→ $CMD_COUNT 個 commands${NC}"

# Agents：同樣邏輯（專案優先）
echo -e "${BLUE}🤖 Agents${NC}"
AGENT_COUNT=0
ADDED_AGENTS=""
_agent_added() { echo " $ADDED_AGENTS " | grep -q " $1 "; }
_mark_agent()  { ADDED_AGENTS="$ADDED_AGENTS $1"; }

if [[ -n "$PROJECT_AGENTS_DIR" ]]; then
  for f in "$PROJECT_AGENTS_DIR"/*.md; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f" .md)
    cp "$f" "$BUILD_DIR/agents/"
    echo -e "   ${GREEN}✔${NC} @$name ${CYAN}[專案自訂]${NC}"
    _mark_agent "$name"
    AGENT_COUNT=$((AGENT_COUNT + 1))
  done
fi

for f in "$REPO_DIR/claude/agents/"*.md; do
  name=$(basename "$f" .md)
  _agent_added "$name" && continue
  cp "$f" "$BUILD_DIR/agents/"
  echo -e "   ${GREEN}✔${NC} @$name"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done
echo -e "   ${CYAN}→ $AGENT_COUNT 個 agents${NC}"

# Hooks
echo -e "${BLUE}🪝 Hooks${NC}"
cp "$REPO_DIR/claude/hooks.json" "$BUILD_DIR/hooks/hooks.json"
HOOK_EVENTS=$(python3 -c "
import json
d = json.load(open('$REPO_DIR/claude/hooks.json'))
for event, items in d.get('hooks', {}).items():
    print(f'   • {event}: {len(items)} 條規則')
" 2>/dev/null || echo "   • hooks 已打包")
echo "$HOOK_EVENTS"

# CLAUDE.md（若有，一併打包供參考）
if [[ -n "$PROJECT_CLAUDE_MD" ]]; then
  cp "$PROJECT_CLAUDE_MD" "$BUILD_DIR/CLAUDE.md"
  info "CLAUDE.md 已嵌入"
fi

cp "$REPO_DIR/README.md" "$BUILD_DIR/README.md"

# 壓縮
(cd "$BUILD_DIR" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
rm -rf "$BUILD_DIR"

FILE_SIZE=$(du -sh "$OUTPUT" | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ 插件打包完成                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${BOLD}版    本：${NC} $PLUGIN_VERSION"
echo -e "  ${BOLD}內    容：${NC} $CMD_COUNT commands · $AGENT_COUNT agents · hooks"
[[ ${#TECH_STACK[@]} -gt 0 ]] && \
echo -e "  ${BOLD}技術棧：  ${NC} ${TECH_STACK[*]}"
[[ -n "$PROJECT_CLAUDE_MD" ]] && \
echo -e "  ${BOLD}專案配置：${NC} CLAUDE.md 已整合"
echo -e "  ${BOLD}檔案大小：${NC} $FILE_SIZE"
echo -e "  ${BOLD}輸出路徑：${NC} $OUTPUT"
echo ""
echo -e "${YELLOW}📌 將 dist/ab-dotfiles.plugin 拖入 Cowork Desktop App 安裝${NC}"

# 記錄 build log
LOG_FILE="$REPO_DIR/.build.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') | v$PLUGIN_VERSION | $CMD_COUNT cmds | ${TECH_STACK[*]:-default} | from:$(basename $INVOKE_DIR)" >> "$LOG_FILE"
