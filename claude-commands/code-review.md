---
name: code-review
description: >
  KKday code review，按嚴重度分級，含 KKday 專屬 checklist（Vue/TS/PHP）。
  Use when: (1) "review", "審查", "幫我看", "merge 前檢查",
  (2) 提供 PR URL 或 diff, (3) "code review", "check this".
metadata:
  author: Alvin Bian
  version: 3.0.0
---

# Code Review

## 取得變更

```bash
gh pr diff $PR_NUMBER 2>/dev/null   # 從 PR number
git diff ${BASE:-develop}...HEAD    # 從 current branch
```

## 審查面向（按優先順序）

🔴 **Critical**：安全性漏洞、邏輯錯誤、資料遺失風險、破壞性變更
🟡 **Warning**：`any` 型別、缺少 error handling、效能問題（re-render / N+1 query）、未處理 edge case
🔵 **Suggestion**：命名優化、重複邏輯、測試覆蓋、風格一致性

---

## Vue / TypeScript checklist

- [ ] 型別定義在 `.types.ts` | 禁止 `any`（用 `unknown` + 型別收窄）
- [ ] Vue 組件用 Composition API（Vue 3: `<script setup>` | Vue 2.7: `defineComponent`）
- [ ] import 排序正確（第三方 → 內部共用 → 同層 → 型別）
- [ ] 無 `console.log` | 無 hardcoded 字串（應用 i18n）
- [ ] design tokens（無 magic number / hardcoded color）
- [ ] Props 有型別定義 | emit 用 kebab-case
- [ ] `computed` / `watch` 無副作用 | async 函式有 error handling

## PHP checklist

- [ ] SQL 使用 prepared statement，無字串拼接 query
- [ ] 輸入有驗證（`preg_match` / `filter_var`），無直接使用 `$_GET/$_POST`
- [ ] 無 `var_dump` / `print_r` 殘留
- [ ] API response 統一格式（`is_api_success`）
- [ ] Cache key 無衝突，TTL 合理 | PII 資料不寫入 log

## 跨 Repo 影響確認

- [ ] API contract 有沒有 breaking change（b2c-web ↔ member-ci）
- [ ] Mobile / PC 雙端是否同步更新

---

## 輸出格式

```
REVIEW: {scope / PR #}
Verdict: APPROVED ✅ | NEEDS_CHANGES ❌
🔴 Critical: {n} | 🟡 Warning: {n} | 🔵 Suggestion: {n}
---
[檔案:行號] 🔴/🟡/🔵 {問題描述} → 建議：{具體修改方式}
---
整體評分：{1-5} / 5  總結：{一句話}
```

用 `reviewer` subagent 執行以隔離 context，避免汙染主對話。
