#!/usr/bin/env bash
# =============================================================================
# scripts/fetch-kkday-context.sh
# 針對 ab.config.json 的 kkday_repos，透過 gh api（不 clone）
# 抓取各 repo 的 package.json + CLAUDE.md，打包完整 Claude Code CLI 配置 plugin
#
# 覆蓋範圍：
#   CLAUDE.md（repo 規範整合）+ skills + agents + hooks + rules
#
# 邏輯：
#   有 CLAUDE.md → 以 CLAUDE.md rules + package.json 技術棧選 skills
#   無 CLAUDE.md → 只以 package.json 技術棧選 skills
#   → 輸出 dist/{repo-name}.plugin
#
# 用法：
#   bash scripts/fetch-kkday-context.sh
#   pnpm run context
# =============================================================================
set -e
trap '[[ -n "${_SPIN_PID:-}" ]] && { kill "$_SPIN_PID" 2>/dev/null; wait "$_SPIN_PID" 2>/dev/null || true; printf "\r\033[2K"; }; echo -e "\033[1;33m  ⚠ 步驟失敗，中止執行\033[0m"; exit 1' ERR

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$REPO_DIR/ab.config.json"
DIST_DIR="$REPO_DIR/dist"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "  ${CYAN}▶ $1${NC}"; }
success() { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
skip()    { echo -e "  ${DIM}─ $1${NC}"; }

# ── 進度顯示工具 ─────────────────────────────────────────────────
_spin_start() {
  _SPIN_MSG="$1"
  ( i=0
    while true; do
      case $(( i % 8 )) in
        0) c='⠋';; 1) c='⠙';; 2) c='⠹';; 3) c='⠸';;
        4) c='⠼';; 5) c='⠴';; 6) c='⠦';; 7) c='⠧';;
      esac
      printf "\r  \033[0;36m%s %s\033[0m   " "$c" "$_SPIN_MSG"
      sleep 0.1
      i=$(( i+1 ))
    done
  ) &
  _SPIN_PID=$!
}

_spin_stop() {
  local status="${1:-ok}"
  kill "$_SPIN_PID" 2>/dev/null
  wait "$_SPIN_PID" 2>/dev/null || true
  printf "\r\033[2K"
  [[ "$status" == "ok" ]] \
    && echo -e "  ${GREEN}✔ $_SPIN_MSG${NC}" \
    || echo -e "  ${YELLOW}⚠ $_SPIN_MSG${NC}"
  unset _SPIN_PID _SPIN_MSG
}

_progress_bar() {
  local current="$1" total="$2" label="$3"
  local width=24 bar="" i
  local filled=$(( total > 0 ? current * width / total : width ))
  for (( i=0; i<filled; i++ )); do bar+="█"; done
  for (( i=filled; i<width; i++ )); do bar+="░"; done
  echo -e "  ${CYAN}[${bar}]${NC} ${BOLD}${current}/${total}${NC}  ${DIM}${label}${NC}"
}

PLUGIN_VERSION="$(python3 -c "
import json
print(json.load(open('$REPO_DIR/package.json')).get('version','1.0.0'))
" 2>/dev/null || echo '1.0.0')"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   KKday Repos Plugin Builder  v$PLUGIN_VERSION       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"

# ── 自動安裝 gh CLI ───────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo ""
  echo -e "${BOLD}📦 gh CLI 未安裝，自動安裝中...${NC}"
  if ! command -v brew &>/dev/null; then
    warn "Homebrew 未安裝，請先安裝：https://brew.sh"; exit 1
  fi
  echo -e "  ${CYAN}▶ brew install gh${NC}"
  brew install gh
  if ! command -v gh &>/dev/null; then
    warn "gh CLI 安裝失敗，請手動執行：brew install gh"; exit 1
  fi
  echo -e "  ${GREEN}✔ gh CLI 安裝完成${NC}"
fi

# ── gh 認證 ───────────────────────────────────────────────────────
if ! gh auth status &>/dev/null 2>&1; then
  echo ""
  echo -e "${BOLD}🔑 需要登入 GitHub${NC}"
  echo -e "  ${DIM}請依照提示在瀏覽器中完成授權...${NC}"
  echo ""
  gh auth login
  echo ""
  if ! gh auth status &>/dev/null 2>&1; then
    warn "gh 登入失敗，無法繼續"; exit 1
  fi
  echo -e "  ${GREEN}✔ GitHub 登入完成${NC}"
fi

# ── 前置條件確認 ──────────────────────────────────────────────────
if [[ ! -f "$CONFIG" ]]; then
  warn "ab.config.json 不存在"; exit 1
fi

# ── 讀取 kkday_repos ──────────────────────────────────────────────
REPOS_JSON=$(python3 -c "
import json
for r in json.load(open('$CONFIG')).get('kkday_repos', []):
    print(r['repo'] + '|' + r.get('branch', 'master'))
" 2>/dev/null)

if [[ -z "$REPOS_JSON" ]]; then
  warn "ab.config.json 中沒有 kkday_repos"; exit 1
fi

TOTAL_REPOS=$(echo "$REPOS_JSON" | wc -l | tr -d ' ')
mkdir -p "$DIST_DIR"

# ── package.json 全量分析 ─────────────────────────────────────────
# 輸入：pkg_file 路徑
# 輸出：JSON {"stack":[], "skills":[], "summary":"..."}
_analyze_package() {
  local pkg_file="$1"
  python3 - "$pkg_file" << 'PYEOF'
import json, sys, os

try:
  d = json.load(open(sys.argv[1]))
except:
  print(json.dumps({"stack": [], "skills": [], "summary": "無法解析 package.json"}))
  sys.exit(0)

deps = {**d.get('dependencies',{}), **d.get('devDependencies',{}), **d.get('peerDependencies',{})}
scripts = d.get('scripts', {})
all_deps = list(deps.keys())

stack = []
skills = ['auto-setup', 'pr-workflow', 'draft-slack', 'slack-formatting', 'review-slack']
summary_parts = []

# 框架偵測
if 'vue' in deps or '@vue/core' in deps:
  stack.append('vue')
  for s in ['code-review','kkday-conventions','test-gen']:
    if s not in skills: skills.append(s)
if 'nuxt' in deps or 'nuxt3' in deps:
  stack.append('nuxt')
if 'react' in deps or 'react-dom' in deps:
  stack.append('react')
  for s in ['code-review','test-gen']:
    if s not in skills: skills.append(s)
if 'next' in deps:
  stack.append('next')

# TypeScript
if 'typescript' in deps or '@types/node' in deps or any(k.startswith('@types/') for k in deps):
  stack.append('typescript')
  for s in ['code-review','kkday-conventions','test-gen']:
    if s not in skills: skills.append(s)

# Build tools
if 'vite' in deps: stack.append('vite')
if 'webpack' in deps: stack.append('webpack')
if 'esbuild' in deps: stack.append('esbuild')
if 'rollup' in deps: stack.append('rollup')

# Testing
has_test = any(k in deps for k in ['vitest','jest','@testing-library/vue','@testing-library/react','cypress','playwright'])
if has_test:
  stack.append('testing')
  if 'test-gen' not in skills: skills.append('test-gen')

# CSS / UI
ui_libs = [k for k in deps if any(k.startswith(p) for p in ['@headlessui','@radix-ui','@shadcn','element-plus','ant-design','naive-ui','quasar','vuetify'])]
if 'tailwindcss' in deps: stack.append('tailwind')
if ui_libs: stack.extend([lib.split('/')[1] if '/' in lib else lib for lib in ui_libs[:2]])

# State management
if any(k in deps for k in ['pinia','vuex','zustand','jotai','recoil','@reduxjs/toolkit']):
  state = next(k for k in ['pinia','vuex','zustand','jotai','@reduxjs/toolkit'] if k in deps)
  stack.append(state)

# API / Data fetching
if any(k in deps for k in ['axios','@tanstack/vue-query','@tanstack/react-query','swr']):
  stack.append('http-client')

# i18n
if any(k in deps for k in ['vue-i18n','react-i18next','i18next']):
  stack.append('i18n')

# Summary
name = d.get('name', os.path.basename(sys.argv[1].replace('/package.json','')))
version = d.get('version', 'unknown')
dep_count = len(all_deps)
test_runner = next((k for k in ['vitest','jest','cypress','playwright'] if k in deps), None)

summary_parts.append(f"專案：{name} v{version}")
summary_parts.append(f"依賴總數：{dep_count} 個")
if test_runner: summary_parts.append(f"測試框架：{test_runner}")
if 'pnpm' in str(d.get('packageManager','')): summary_parts.append("套件管理：pnpm")

print(json.dumps({
  "stack": list(dict.fromkeys(stack)),  # 去重保序
  "skills": skills,
  "all_deps": all_deps,
  "summary": " | ".join(summary_parts)
}, ensure_ascii=False))
PYEOF
}

# ── 逐 repo 打包 ──────────────────────────────────────────────────
BUILT=0
REPO_IDX=0

while IFS='|' read -r repo branch; do
  [[ -z "$repo" ]] && continue
  REPO_IDX=$(( REPO_IDX + 1 ))
  name=$(basename "$repo")
  echo ""
  _progress_bar "$REPO_IDX" "$TOTAL_REPOS" "$name"
  echo -e "${BLUE}── $name（$repo @ $branch）${NC}"

  BUILD_TMP="/tmp/ab-kkday-plugin-$$-$name"
  mkdir -p "$BUILD_TMP/.claude-plugin" \
           "$BUILD_TMP/skills" \
           "$BUILD_TMP/agents" \
           "$BUILD_TMP/hooks" \
           "$BUILD_TMP/rules"

  # ── 抓 package.json → 全量分析 ──────────────────────────────────
  PKG_TMPFILE=$(mktemp)
  _spin_start "抓取 $name/package.json"
  gh api "repos/$repo/contents/package.json?ref=$branch" \
    --jq '.content' 2>/dev/null \
    | base64 -d 2>/dev/null > "$PKG_TMPFILE" || true
  _spin_stop "ok"

  ANALYSIS=$(_analyze_package "$PKG_TMPFILE")
  rm -f "$PKG_TMPFILE"

  TECH_STACK=$(echo "$ANALYSIS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join(d['stack']) or 'javascript')" 2>/dev/null || echo "javascript")
  SKILLS_CSV=$(echo "$ANALYSIS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join(d['skills']))" 2>/dev/null || echo "auto-setup,pr-workflow")
  PKG_SUMMARY=$(echo "$ANALYSIS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('summary',''))" 2>/dev/null || echo "")
  ALL_DEPS=$(echo "$ANALYSIS" | python3 -c "import json,sys; d=json.load(sys.stdin); print('\n'.join(d.get('all_deps',[])))" 2>/dev/null || echo "")

  if [[ -n "$PKG_SUMMARY" ]]; then
    success "package.json 分析完成"
    info "$PKG_SUMMARY"
    info "技術棧：$TECH_STACK"
  else
    skip "package.json 無法取得，使用預設配置"
  fi

  # ── 抓 CLAUDE.md（選用）────────────────────────────────────────
  CLAUDE_TMPFILE=$(mktemp)
  _spin_start "抓取 $name/CLAUDE.md"
  gh api "repos/$repo/contents/CLAUDE.md?ref=$branch" \
    --jq '.content' 2>/dev/null \
    | base64 -d 2>/dev/null > "$CLAUDE_TMPFILE" || true
  _spin_stop "ok"

  HAS_CLAUDE=false
  if [[ -s "$CLAUDE_TMPFILE" ]]; then
    HAS_CLAUDE=true
    CLAUDE_LINE_COUNT=$(wc -l < "$CLAUDE_TMPFILE" | tr -d ' ')
    success "CLAUDE.md 取得（$CLAUDE_LINE_COUNT 行）"
  else
    skip "CLAUDE.md 不存在，以 package.json 分析結果推導規範"
  fi

  # ── 生成完整 CLAUDE.md ──────────────────────────────────────────
  {
    echo "# $name Claude 配置"
    echo ""
    echo "## 基本設定"
    echo "- 工作語言：繁體中文回覆，程式碼與技術術語保持英文"
    echo "- commit message 用英文（Conventional Commits）"
    echo "- 縮排：2 spaces；JS/TS 單引號；Vue template 雙引號"
    echo ""
    echo "## 專案資訊"
    echo "- GitHub：\`$repo\`"
    echo "- Branch：\`$branch\`"
    echo "- 技術棧：$TECH_STACK"
    [[ -n "$PKG_SUMMARY" ]] && echo "- $PKG_SUMMARY"
    echo ""

    if [[ -n "$ALL_DEPS" ]]; then
      echo "## 依賴清單"
      echo ""
      echo "\`\`\`"
      echo "$ALL_DEPS"
      echo "\`\`\`"
      echo ""
    fi

    if $HAS_CLAUDE; then
      echo "## 專案規範（來自 CLAUDE.md）"
      echo ""
      cat "$CLAUDE_TMPFILE"
      echo ""
    fi

    echo "## 通用規範"
    echo "@~/.claude/rules/git-workflow.md"
    echo "@~/.claude/rules/code-style.md"
    echo "@~/.claude/rules/kkday-conventions.md"
  } > "$BUILD_TMP/CLAUDE.md"

  rm -f "$CLAUDE_TMPFILE"

  # ── 複製 rules 檔案 ─────────────────────────────────────────────
  RULES_SRC="$REPO_DIR/claude/rules"
  if [[ -d "$RULES_SRC" ]]; then
    cp "$RULES_SRC/"*.md "$BUILD_TMP/rules/" 2>/dev/null || true
  fi
  # 補全：從 ~/.claude/rules 複製尚未包含的規範
  for f in "$HOME/.claude/rules/"{git-workflow,code-style,kkday-conventions}.md; do
    fname=$(basename "$f")
    [[ ! -f "$BUILD_TMP/rules/$fname" && -f "$f" ]] && cp "$f" "$BUILD_TMP/rules/$fname"
  done
  RULE_COUNT=$(ls "$BUILD_TMP/rules/" 2>/dev/null | wc -l | tr -d ' ')
  [[ "$RULE_COUNT" -gt 0 ]] && success "$RULE_COUNT 個 rules 已加入"

  # ── skills ───────────────────────────────────────────────────────
  info "skills：$(echo "$SKILLS_CSV" | tr ',' ' ')"
  IFS=',' read -ra SKILL_LIST <<< "$SKILLS_CSV"
  CMD_COUNT=0
  for skill in "${SKILL_LIST[@]}"; do
    skill=$(echo "$skill" | tr -d ' ')
    f="$REPO_DIR/claude/commands/$skill.md"
    [[ -f "$f" ]] || continue
    mkdir -p "$BUILD_TMP/skills/$skill"
    cp "$f" "$BUILD_TMP/skills/$skill/SKILL.md"
    CMD_COUNT=$((CMD_COUNT + 1))
  done
  success "$CMD_COUNT skills 已加入"

  # ── agents ───────────────────────────────────────────────────────
  AGENT_COUNT=0
  for f in "$REPO_DIR/claude/agents/"*.md; do
    [[ -f "$f" ]] || continue
    cp "$f" "$BUILD_TMP/agents/"
    AGENT_COUNT=$((AGENT_COUNT + 1))
  done
  success "$AGENT_COUNT agents 已加入"

  # ── hooks ────────────────────────────────────────────────────────
  if [[ -f "$REPO_DIR/claude/hooks.json" ]]; then
    cp "$REPO_DIR/claude/hooks.json" "$BUILD_TMP/hooks/hooks.json"
    HOOK_COUNT=$(python3 -c "
import json
d = json.load(open('$REPO_DIR/claude/hooks.json'))
print(sum(len(v) for v in d.get('hooks',{}).values()))
" 2>/dev/null || echo "?")
    success "hooks 已加入（$HOOK_COUNT 條規則）"
  fi

  # ── plugin.json ──────────────────────────────────────────────────
  PLUGIN_DESC="$name 完整 Claude Code CLI 配置（ab-dotfiles）"
  $HAS_CLAUDE && PLUGIN_DESC="$PLUGIN_DESC | CLAUDE.md 已整合"

  python3 - << PYEOF > "$BUILD_TMP/.claude-plugin/plugin.json"
import json
data = {
  "name": "ab-dotfiles-$name",
  "version": "$PLUGIN_VERSION",
  "description": "$PLUGIN_DESC",
  "author": {"name": "Alvin Bian", "email": "alvin.bian@kkday.com"},
  "keywords": ["kkday", "$name", "claude"],
  "techStack": [t.strip() for t in "$TECH_STACK".split(',') if t.strip()],
  "includes": {
    "skills": $CMD_COUNT,
    "agents": $AGENT_COUNT,
    "hooks": True,
    "rules": True,
    "claudeMd": $( $HAS_CLAUDE && echo 'True' || echo 'False' )
  }
}
print(json.dumps(data, indent=2, ensure_ascii=False))
PYEOF

  # ── 壓縮打包 ─────────────────────────────────────────────────────
  OUTPUT="$DIST_DIR/$name.plugin"
  (cd "$BUILD_TMP" && zip -r "$OUTPUT" . -x "*.DS_Store" > /dev/null)
  rm -rf "$BUILD_TMP"

  FILE_SIZE=$(du -sh "$OUTPUT" | awk '{print $1}')
  success "→ $OUTPUT（$FILE_SIZE）"
  BUILT=$((BUILT + 1))

done <<< "$REPOS_JSON"

# ── 結果摘要 ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ KKday Plugins 打包完成                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${BOLD}成功：${NC} $BUILT 個 plugins → $DIST_DIR/"
echo -e "  ${DIM}覆蓋範圍：CLAUDE.md + skills + agents + hooks + rules${NC}"
echo -e "  ${DIM}將各 .plugin 拖入 Cowork Desktop App 安裝${NC}"
echo ""
