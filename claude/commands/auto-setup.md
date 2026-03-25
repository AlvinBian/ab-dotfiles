---
name: auto-setup
description: >
  通用專案環境自動檢測與配置推薦引擎。識別任何專案類型，補齊缺失的 CLAUDE.md、rules、skills、hooks、MCP。
  Use when: (1) "setup", "初始化", "環境檢查", "auto setup", "optimize",
  (2) 首次進入任何專案, (3) "檢查缺少什麼", "幫我配置", "優化環境",
  (4) "需要裝什麼", "recommend", "建議配置".
metadata:
  author: KKday IT
  version: 2.1.0
---

# 通用專案自動檢測與配置推薦

## Step 1：專案指紋採集

```bash
echo "=== Project Fingerprint ==="
[ -f "nuxt.config.ts" ] && echo "FRAMEWORK:nuxt3"
[ -f "next.config.js" ] || [ -f "next.config.ts" ] && echo "FRAMEWORK:nextjs"
[ -f "application/config/config.php" ] && echo "FRAMEWORK:codeigniter"
[ -f "artisan" ] && echo "FRAMEWORK:laravel"
[ -f "manage.py" ] && echo "FRAMEWORK:django"
[ -f "go.mod" ] && echo "FRAMEWORK:go"
[ -f "tsconfig.json" ] && echo "LANG:typescript"
grep -q '"vue"' package.json 2>/dev/null && echo "LANG:vue"
grep -q '"react"' package.json 2>/dev/null && echo "LANG:react"
[ -f "pnpm-lock.yaml" ] && echo "PKG:pnpm"
[ -f "yarn.lock" ] && echo "PKG:yarn"
grep -q "vitest" package.json 2>/dev/null && echo "TEST:vitest"
grep -q '"jest"' package.json 2>/dev/null && echo "TEST:jest"
[ -f ".eslintrc.js" ] || [ -f "eslint.config.mjs" ] && echo "LINT:eslint"
[ -f ".prettierrc" ] || [ -f "prettier.config.js" ] && echo "LINT:prettier"
[ -f "CLAUDE.md" ] && echo "CONFIG:claude-md"
[ -d ".claude/commands" ] && echo "CONFIG:commands:$(ls .claude/commands/*.md 2>/dev/null | wc -l)"
```

## Step 2：配置分析與推薦

### CLAUDE.md 檢查

| 狀態 | 動作 |
| --- | --- |
| 不存在 | 建議執行 `/init` 或根據指紋自動生成 |
| 存在但 > 200 行 | 建議精簡，將專門知識移到 rules |
| 存在且 < 200 行 | ✅ 合格，檢查是否有 Compact Instructions |

### Hooks 推薦矩陣

| 專案特徵 | 推薦 hook |
| --- | --- |
| LINT:prettier | PostToolUse: auto prettier --write |
| LINT:eslint | PostToolUse: auto eslint --fix |
| 任何專案 | PreToolUse: 保護 .env / lock 檔案 |
| 任何專案 | SessionStart[compact]: 壓縮後注入關鍵上下文 |

> 原則：**CLI 優先於 MCP**（gh > GitHub MCP、jq > JSON MCP）。

## Step 3：輸出檢測報告並互動式安裝

用 AskUserQuestion 讓使用者選擇要安裝哪些項目，逐一執行。
所有生成的檔案放在專案的 `.claude/` 目錄下，方便 git 管理。
