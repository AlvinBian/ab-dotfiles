---
name: code-review
description: >
  程式碼審查，按嚴重度分級。自動載入匹配的技術棧 checklist。
  Use when: "review", "審查", "幫我看", "merge 前檢查", "code review", "check this".
metadata:
  version: 1.0.0
---

# Code Review

## 取得變更

```bash
gh pr diff $PR_NUMBER 2>/dev/null   # 從 PR
git diff ${BASE:-main}...HEAD       # 從 branch
```

## 嚴重度分級

| 等級 | 範圍 |
|------|------|
| 🔴 Critical | 安全漏洞、邏輯錯誤、資料遺失、破壞性變更 |
| 🟡 Warning | 型別不安全、缺少 error handling、效能問題、未處理 edge case |
| 🔵 Suggestion | 命名優化、重複邏輯、測試覆蓋、風格一致性 |

## 審查流程

1. 讀取專案 CLAUDE.md 了解團隊規範（若存在）
2. 偵測語言 / 框架，載入對應 checklist
3. 逐檔案審查，按嚴重度分類
4. 確認跨端影響（API contract / 多平台同步）

## 輸出格式

```
REVIEW: {scope / PR #}
Verdict: APPROVED ✅ | NEEDS_CHANGES ❌
🔴 Critical: {n} | 🟡 Warning: {n} | 🔵 Suggestion: {n}
---
[檔案:行號] 🔴/🟡/🔵 {問題} → {建議修改}
---
整體評分：{1-5}/5 | 總結：{一句話}
```
