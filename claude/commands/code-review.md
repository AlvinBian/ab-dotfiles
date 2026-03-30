---
name: code-review
description: >
  程式碼審查，按嚴重度分級。自動載入匹配的技術棧 checklist。
  Use when: "review", "審查", "幫我看", "merge 前檢查", "code review", "check this".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Code Review

啟動 reviewer agent 進行深度程式碼審查。

## 取得變更

```bash
gh pr diff $PR_NUMBER 2>/dev/null || git diff ${BASE:-main}...HEAD
```

## 審查要點

1. 讀取專案 CLAUDE.md 了解團隊規範
2. 偵測語言 / 框架，載入對應 checklist
3. 逐檔案審查，按 🔴 Critical / 🟡 Warning / 🔵 Suggestion 分級
4. 確認跨端影響（API contract / 多平台同步）

輸出格式同 reviewer agent。
