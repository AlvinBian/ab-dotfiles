---
name: refactor-clean
description: >
  死代碼清理：未使用的 export、重複邏輯、過時的 TODO。
  Use when: "清理", "dead code", "unused", "重複代碼", "refactor clean".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Refactor Clean

## Step 1 — 掃描死代碼

```bash
# TypeScript/JavaScript
npx knip --reporter compact 2>/dev/null || npx ts-prune 2>/dev/null
# 未使用的依賴
npx depcheck 2>/dev/null
```

## Step 2 — 分類

| 類型 | 動作 |
|------|------|
| 未使用的 export | 確認無外部引用後刪除 |
| 未使用的依賴 | `npm uninstall` |
| 重複邏輯 | 提取共用函式 |
| 過時 TODO/FIXME | 已修復的刪除，未修復的建 issue |
| 註解掉的代碼 | 直接刪除（git 有歷史）|

## Step 3 — 安全刪除

每次刪除後跑 build + test，確認不 break。
