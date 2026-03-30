---
name: simplify
description: >
  審查已修改代碼的複雜度，找出可簡化的部分。
  Use when: "simplify", "簡化", "太複雜了", "精簡", "review changed code".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Simplify

## Step 1 — 收集變更

```bash
git diff --name-only HEAD~1
git diff --stat
```

## Step 2 — 複雜度檢查

逐檔案審查：
- 函式超過 30 行 → 拆分
- 巢狀超過 3 層 → 提前 return / 提取函式
- 重複代碼 → 提取共用邏輯
- 過度抽象 → 三行重複好過一個不必要的 helper
- 未使用的 import / 變數 → 刪除

## Step 3 — 精簡

原則：最少改動、不改變行為、不加功能。
每次改動後確認測試通過。
