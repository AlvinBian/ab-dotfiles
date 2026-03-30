---
name: auto-setup
description: >
  通用專案環境自動檢測與配置推薦。識別專案類型，補齊缺失的 CLAUDE.md、rules、hooks、MCP。
  Use when: "setup", "初始化", "環境檢查", "auto setup", "optimize",
  "檢查缺少什麼", "幫我配置", "優化環境", "建議配置".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# 專案自動檢測與配置推薦

## Step 1 — 專案指紋採集

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

## Step 2 — 配置分析與推薦

### CLAUDE.md

| 狀態 | 動作 |
|------|------|
| 不存在 | 根據指紋自動生成 |
| > 200 行 | 建議精簡，專門知識移到 rules |
| ≤ 200 行 | ✅ 合格，檢查 Compact Instructions |

### Hooks 推薦

| 專案特徵 | 推薦 Hook |
|----------|----------|
| Prettier | PostToolUse → auto `prettier --write` |
| ESLint | PostToolUse → auto `eslint --fix` |
| 任何專案 | PreToolUse → 保護 `.env` / lock 檔案 |
| 任何專案 | SessionStart → 壓縮後注入關鍵上下文 |

> 原則：CLI 優先於 MCP（`gh` > GitHub MCP、`jq` > JSON MCP）

## Step 3 — 互動式安裝

用 AskUserQuestion 讓使用者選擇要安裝的項目，逐一執行。
所有生成的檔案放在專案 `.claude/` 目錄下。
