---
name: context-management
description: >
  Context 管理規範：何時用 Plan Mode、何時 /compact、context 快滿的應對策略。
matchWhen:
  always: true
---

# Context Management

## Context 使用原則

- **不浪費 context**：不重複讀已知內容，不把大型檔案完整貼入對話
- **提早規劃**：複雜任務在 context 充足時用 Plan Mode 確立方向
- **主動壓縮**：接近限制前主動 /compact，不等系統強制壓縮

## 何時用 Plan Mode（/plan）

| 情境 | 用 Plan Mode | 不用 |
|------|-------------|------|
| 跨 5+ 檔案的重構 | ✅ | |
| 需要在開始前對齊方向 | ✅ | |
| 架構決策影響多個模組 | ✅ | |
| 單檔案 bug 修復 | | ✅ |
| 簡單功能新增（< 3 檔案）| | ✅ |
| 已有清楚指令的任務 | | ✅ |

## Context 用量警戒線

| 用量 | 動作 |
|------|------|
| < 50% | 正常工作 |
| 50–70% | 避免讀大型檔案，優先使用 Grep/Glob 替代全文讀取 |
| 70–85% | 考慮 /compact，完成當前子任務後壓縮 |
| > 85% | 立即 /compact，或結束當前工作存 /save-session |

## /compact 使用時機

**應該 /compact：**
- 探索階段結束、方向確定後
- 完成一個獨立子任務後
- 大量工具調用結果已讀取但不再需要細節
- context 超過 70%

**不要 /compact：**
- 正在進行中的修改還未完成
- 剛產生的程式碼還未驗證
- 有尚未處理的錯誤訊息

## 大型任務策略

```
大型重構 / 多模組任務
│
├─ 第一步：Plan Mode 確立方向、拆子任務
├─ 第二步：逐個子任務執行，每完成一個 /compact
├─ 第三步：接近 context 限制 → /save-session 記錄進度
└─ 第四步：新 session /resume-session 繼續
```

## Agent 的 Context 隔離

- 耗時分析（@explorer、@security、@perf-analyzer）→ 用 Agent，結果摘要回主 context
- 不要把大型 Agent 輸出完整貼入主對話
- Agent 完成後只保留關鍵結論，丟棄原始輸出

## 禁止行為

- 不讀整個 `node_modules/` 或 `vendor/` 目錄
- 不把 `package-lock.json`、`pnpm-lock.yaml` 完整讀入
- 不重複讀同一檔案超過兩次（先確認是否已知）
- 不在 context 快滿時開始大型任務
