#!/usr/bin/env bash
# =============================================================================
# scripts/generate-workspace.sh
# 自動掃描 MyProjects/ 同級 git 專案，生成 Kiro / VS Code 工作區檔案
#
# 用法：
#   pnpm run workspace
#   bash scripts/generate-workspace.sh [output_path]
# =============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PARENT_DIR="$(dirname "$REPO_DIR")"
WORKSPACE_NAME="$(basename "$PARENT_DIR")"
OUTPUT="${1:-$PARENT_DIR/$WORKSPACE_NAME.code-workspace}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BLUE}=== 生成工作區檔案 ===${NC}"
echo -e "${BLUE}掃描目錄：${NC} $PARENT_DIR"

FOLDERS_JSON=""
FOUND=0

# 掃描同級 git repos（第一層）
for dir in "$PARENT_DIR"/*/; do
  dir="${dir%/}"
  [ -d "$dir/.git" ] || continue
  name="$(basename "$dir")"
  FOUND=$((FOUND + 1))
  [ -n "$FOLDERS_JSON" ] && FOLDERS_JSON="$FOLDERS_JSON,"$'\n'
  FOLDERS_JSON="${FOLDERS_JSON}    { \"path\": \"./$name\", \"name\": \"$name\" }"
  echo -e "${GREEN}  ✅ $name${NC}"
done

# 掃描 Study/ 子目錄（第二層）
for dir in "$PARENT_DIR"/Study/*/; do
  [ -d "$dir" ] || continue
  dir="${dir%/}"
  [ -d "$dir/.git" ] || continue
  name="$(basename "$dir")"
  FOUND=$((FOUND + 1))
  [ -n "$FOLDERS_JSON" ] && FOLDERS_JSON="$FOLDERS_JSON,"$'\n'
  FOLDERS_JSON="${FOLDERS_JSON}    { \"path\": \"./Study/$name\", \"name\": \"$name\" }"
  echo -e "${GREEN}  ✅ Study/$name${NC}"
done

if [ "$FOUND" -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  未找到任何 git 專案：$PARENT_DIR${NC}"
  exit 1
fi

cat > "$OUTPUT" << WORKSPACE_EOF
{
  "folders": [
$FOLDERS_JSON
  ],
  "settings": {
    "editor.formatOnSave": true,
    "editor.tabSize": 2,
    "files.trimTrailingWhitespace": true,
    "typescript.preferences.importModuleSpecifier": "relative",
    "eslint.workingDirectories": [{ "mode": "auto" }],
    "search.exclude": {
      "**/node_modules": true,
      "**/dist": true,
      "**/.git": true,
      "**/vendor": true
    }
  },
  "extensions": {
    "recommendations": [
      "vue.volar",
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "bradlc.vscode-tailwindcss",
      "mikestead.dotenv",
      "eamodio.gitlens"
    ]
  }
}
WORKSPACE_EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 工作區已生成（$FOUND 個專案）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📁 輸出：$OUTPUT"
echo "🚀 開啟：open \"$OUTPUT\""
