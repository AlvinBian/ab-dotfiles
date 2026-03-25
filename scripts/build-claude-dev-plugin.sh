#!/usr/bin/env bash
# =============================================================================
# scripts/build-claude-dev-plugin.sh
# 打包 ab-claude-dev.plugin（統一版）
#
# 包含內容：
#   skills:   claude/commands/ 全部
#   agents:   claude/agents/ 全部
#   hooks:    claude/hooks.json
#   rules:    claude/rules/ 全部 + ~/.claude/rules/（補全）
#   CLAUDE.md: 整合 ab.config.json 的 kkday_repos 上下文（需要 gh CLI）
#   plugin.json
#
# 用法：
#   bash scripts/build-claude-dev-plugin.sh
#   pnpm run build
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/tmp/ab-claude-dev-plugin-$$"
DIST_DIR="$REPO_DIR/dist"
OUTPUT="$DIST_DIR/ab-claude-dev.plugin"
CONFIG="$REPO_DIR/ab.config.json"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
YELLOW='\033[1;33m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

step()    { echo -e "\n${BOLD}$1${NC}"; }
info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
success() { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
skip()    { echo -e "  ${DIM}─ $1${NC}"; }

PLUGIN_VERSION="$(python3 -c "import json; print(json.load(open('$REPO_DIR/package.json')).get('version','1.0.0'))" 2>/dev/null || echo '1.0.0')"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ab-claude-dev Plugin Builder  v$PLUGIN_VERSION       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"

mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/.claude-plugin" \
         "$BUILD_DIR/skills" \
         "$BUILD_DIR/agents" \
         "$BUILD_DIR/hooks" \
         "$BUILD_DIR/rules"

# ── Skills（全部 commands）───────────────────────────────────────
step "📦 Skills"
SKILL_COUNT=0
for f in "$REPO_DIR/claude/commands/"*.md; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f" .md)
  mkdir -p "$BUILD_DIR/skills/$name"
  cp "$f" "$BUILD_DIR/skills/$name/SKILL.md"
  echo -e "   ${GREEN}✔${NC} /$name"
  SKILL_COUNT=$((SKILL_COUNT + 1))
done
echo -e "   ${CYAN}→ $SKILL_COUNT skills${NC}"

# ── Agents ────────────────────────────────────────────────────────
step "🤖 Agents"
AGENT_COUNT=0
for f in "$REPO_DIR/claude/agents/"*.md; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f" .md)
  cp "$f" "$BUILD_DIR/agents/"
  echo -e "   ${GREEN}✔${NC} @$name"
  AGENT_COUNT=$((AGENT_COUNT + 1))
done
echo -e "   ${CYAN}→ $AGENT_COUNT agents${NC}"

# ── Hooks ─────────────────────────────────────────────────────────
step "🪝 Hooks"
HOOKS_FILE="$REPO_DIR/claude/hooks.json"
if [[ -f "$HOOKS_FILE" ]]; then
  cp "$HOOKS_FILE" "$BUILD_DIR/hooks/hooks.json"
  HOOK_COUNT=$(python3 -c "
import json
d = json.load(open('$HOOKS_FILE'))
print(sum(len(v) for v in d.get('hooks',{}).values()))
" 2>/dev/null || echo "?")
  echo -e "   ${GREEN}✔${NC} hooks.json（$HOOK_COUNT 條規則）"
else
  warn "claude/hooks.json 不存在，略過"
fi

# ── Rules（repo 內 + ~/.claude/rules 補全）───────────────────────
step "📋 Rules"
RULE_COUNT=0

if [[ -d "$REPO_DIR/claude/rules" ]]; then
  for f in "$REPO_DIR/claude/rules/"*.md; do
    [[ -f "$f" ]] || continue
    name=$(basename "$f")
    cp "$f" "$BUILD_DIR/rules/$name"
    echo -e "   ${GREEN}✔${NC} $name"
    RULE_COUNT=$((RULE_COUNT + 1))
  done
fi

for f in "$HOME/.claude/rules/"*.md; do
  [[ -f "$f" ]] || continue
  name=$(basename "$f")
  if [[ ! -f "$BUILD_DIR/rules/$name" ]]; then
    cp "$f" "$BUILD_DIR/rules/$name"
    echo -e "   ${GREEN}✔${NC} $name ${DIM}[~/.claude/rules]${NC}"
    RULE_COUNT=$((RULE_COUNT + 1))
  fi
done
echo -e "   ${CYAN}→ $RULE_COUNT rules${NC}"

# ── KKday 上下文（選用，需要 gh CLI + ab.config.json）────────────
step "🏢 KKday 上下文"
KKDAY_CONTEXT=false

if ! command -v gh &>/dev/null; then
  skip "gh CLI 未安裝，略過 KKday 上下文"
elif ! gh auth status &>/dev/null 2>&1; then
  skip "gh 未登入，略過 KKday 上下文"
elif [[ ! -f "$CONFIG" ]]; then
  skip "ab.config.json 不存在，略過 KKday 上下文"
else
  REPOS_JSON=$(python3 -c "
import json
for r in json.load(open('$CONFIG')).get('kkday_repos', []):
    print(r['repo'] + '|' + r.get('branch', 'master'))
" 2>/dev/null || echo "")

  if [[ -z "$REPOS_JSON" ]]; then
    skip "ab.config.json 無 kkday_repos，略過"
  else
    CLAUDE_MD_FILE="$BUILD_DIR/CLAUDE.md"
    {
      echo "# KKday 專案上下文"
      echo ""
      echo "> 由 pnpm run build 自動抓取（$(date '+%Y-%m-%d')）"
      echo ""
    } > "$CLAUDE_MD_FILE"

    REPO_BUILT=0
    while IFS='|' read -r repo branch; do
      [[ -z "$repo" ]] && continue
      name=$(basename "$repo")
      info "抓取 $name..."

      # 抓 package.json
      PKG_TMPFILE=$(mktemp)
      gh api "repos/$repo/contents/package.json?ref=$branch" \
        --jq '.content' 2>/dev/null \
        | base64 -d 2>/dev/null > "$PKG_TMPFILE" || true

      PKG_SUMMARY=""
      TECH_STACK=""
      ALL_DEPS=""
      if [[ -s "$PKG_TMPFILE" ]]; then
        PKG_SUMMARY=$(python3 -c "
import json, sys
try:
  d = json.load(open('$PKG_TMPFILE'))
  deps = {**d.get('dependencies',{}), **d.get('devDependencies',{})}
  stack = []
  if 'vue' in deps: stack.append('vue')
  if 'nuxt' in deps: stack.append('nuxt')
  if 'react' in deps: stack.append('react')
  if 'typescript' in deps or '@types/node' in deps: stack.append('typescript')
  if 'vite' in deps: stack.append('vite')
  print('|'.join([','.join(stack), str(len(deps)), '\n'.join(list(deps.keys()))]))
except: print('||')
" 2>/dev/null || echo "||")
        TECH_STACK=$(echo "$PKG_SUMMARY" | cut -d'|' -f1)
        DEP_COUNT=$(echo "$PKG_SUMMARY" | cut -d'|' -f2)
        ALL_DEPS=$(echo "$PKG_SUMMARY" | cut -d'|' -f3)
      fi
      rm -f "$PKG_TMPFILE"

      # 抓 CLAUDE.md
      CLAUDE_TMPFILE=$(mktemp)
      gh api "repos/$repo/contents/CLAUDE.md?ref=$branch" \
        --jq '.content' 2>/dev/null \
        | base64 -d 2>/dev/null > "$CLAUDE_TMPFILE" || true

      # 寫入合併 CLAUDE.md
      {
        echo "---"
        echo ""
        echo "## $name"
        echo ""
        echo "- GitHub：\`$repo\` @ \`$branch\`"
        [[ -n "$TECH_STACK" ]] && echo "- 技術棧：$TECH_STACK"
        [[ -n "$DEP_COUNT" ]] && echo "- 依賴數：$DEP_COUNT 個"
        echo ""

        if [[ -n "$ALL_DEPS" ]]; then
          echo "### 依賴清單"
          echo ""
          echo '```'
          echo "$ALL_DEPS"
          echo '```'
          echo ""
        fi

        if [[ -s "$CLAUDE_TMPFILE" ]]; then
          echo "### 專案規範（CLAUDE.md）"
          echo ""
          cat "$CLAUDE_TMPFILE"
          echo ""
        fi
      } >> "$CLAUDE_MD_FILE"

      rm -f "$CLAUDE_TMPFILE"
      success "$name 已整合"
      REPO_BUILT=$((REPO_BUILT + 1))
    done <<< "$REPOS_JSON"

    if [[ $REPO_BUILT -gt 0 ]]; then
      echo -e "   ${CYAN}→ $REPO_BUILT 個 KKday repos 已整合至 CLAUDE.md${NC}"
      KKDAY_CONTEXT=true
    else
      # 全部失敗：移除僅含標題的空殼 CLAUDE.md，不打包不完整內容
      rm -f "$CLAUDE_MD_FILE"
      warn "所有 repo 抓取失敗，CLAUDE.md 已移除"
    fi
  fi
fi

# ── plugin.json ───────────────────────────────────────────────────
KKDAY_NOTE=""
[[ "$KKDAY_CONTEXT" == "true" ]] && KKDAY_NOTE=" + KKday 上下文（$(date '+%Y-%m-%d')）"
cat > "$BUILD_DIR/.claude-plugin/plugin.json" << JSON_EOF
{
  "name": "ab-claude-dev",
  "version": "$PLUGIN_VERSION",
  "description": "Claude Code 個人開發工具包 — skills / agents / hooks / rules${KKDAY_NOTE}",
  "author": { "name": "Alvin Bian", "email": "alvin.bian@kkday.com" },
  "keywords": ["claude-code", "kkday", "code-review", "pr-workflow", "test-gen", "slack", "vue", "typescript", "php"]
}
JSON_EOF

# ── 壓縮打包 + 保留資料夾供查閱 ──────────────────────────────────
PREVIEW_DIR="$DIST_DIR/ab-claude-dev"
rm -rf "$PREVIEW_DIR"
cp -r "$BUILD_DIR" "$PREVIEW_DIR"
(cd "$BUILD_DIR" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
rm -rf "$BUILD_DIR"

FILE_SIZE=$(du -sh "$OUTPUT" | awk '{print $1}')

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ ab-claude-dev.plugin 打包完成           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${BOLD}版    本：${NC} $PLUGIN_VERSION"
echo -e "  ${BOLD}內    容：${NC} $SKILL_COUNT skills · $AGENT_COUNT agents · hooks · $RULE_COUNT rules"
[[ "$KKDAY_CONTEXT" == "true" ]] && echo -e "  ${BOLD}KKday：  ${NC} $REPO_BUILT repos 上下文已整合"
echo -e "  ${BOLD}輸出路徑：${NC} $OUTPUT（$FILE_SIZE）"
echo ""
echo -e "${YELLOW}📌 將 dist/ab-claude-dev.plugin 拖入 Cowork Desktop App 安裝${NC}"
