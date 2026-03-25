#!/usr/bin/env bash
# =============================================================================
# generate-workspace.sh
# 自動掃描 MyProjects/ 中的同級 git 專案，生成 Kiro / VS Code 工作區檔案
#
# 用法：
#   pnpm workspace          ← 生成到 MyProjects/MyProjects.code-workspace
#   bash generate-workspace.sh [output_path]
#
# 輸出：{PARENT_DIR}/MyProjects.code-workspace
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_NAME="$(basename "$PARENT_DIR")"
OUTPUT="${1:-$PARENT_DIR/$WORKSPACE_NAME.code-workspace}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BLUE}=== 生成工作區檔案 ===${NC}"
echo -e "${BLUE}掃描目錄：${NC} $PARENT_DIR"

# 掃描同級目錄中的 git repos
FOLDERS_JSON=""
FOUND=0

for dir in "$PARENT_DIR"/*/; do
  dir="${dir%/}"
  name="$(basename "$dir")"

  # 跳過非 git repo 的目錄
  if [ ! -d "$dir/.git" ]; then
    continue
  fi

  FOUND=$((FOUND + 1))

  # 取得 relative path（相對於工作區輸出位置，即 PARENT_DIR）
  rel="./$name"

  # 第一個不加逗號
  if [ -n "$FOLDERS_JSON" ]; then
    FOLDERS_JSON="$FOLDERS_JSON,"$'\n'
  fi
  FOLDERS_JSON="${FOLDERS_JSON}    { \"path\": \"$rel\", \"name\": \"$name\" }"

  echo -e "${GREEN}  ✅ $name${NC}"
done

# 也掃描 Study/ 子目錄（兩層深）
for dir in "$PARENT_DIR"/Study/*/; do
  [ -d "$dir" ] || continue
  dir="${dir%/}"
  name="Study/$(basename "$dir")"
  [ -d "$dir/.git" ] || continue

  FOUND=$((FOUND + 1))
  rel="./$name"

  if [ -n "$FOLDERS_JSON" ]; then
    FOLDERS_JSON="$FOLDERS_JSON,"$'\n'
  fi
  FOLDERS_JSON="${FOLDERS_JSON}    { \"path\": \"$rel\", \"name\": \"$(basename "$dir")\" }"
  echo -e "${GREEN}  ✅ $name${NC}"
done

if [ "$FOUND" -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  未找到任何 git 專案，請確認目錄：$PARENT_DIR${NC}"
  exit 1
fi

# 生成 .code-workspace JSON
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
echo -e "${GREEN}✅ 工作區檔案已生成（$FOUND 個專案）${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📁 輸出路徑：$OUTPUT"
echo ""
echo "🚀 開啟方式："
echo "   Kiro:    open \"$OUTPUT\""
echo "   VS Code: code \"$OUTPUT\""
