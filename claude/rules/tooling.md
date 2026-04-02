---
name: tooling
description: >
  工具選擇與 Agent 編排：決策框架、何時用 Agent、並行 vs 串行。
  極度精簡版，移除所有長篇幅範例。
matchWhen:
  always: true
---

# Tooling

## 四維分析框架（決策時快速檢查）

### 維度 1：意圖類型

| 意圖 | 工具傾向 |
|------|---------|
| 理解 / 分析 | Read + 解釋，或 @explorer |
| 規劃 / 設計 | @planner / @architect（唯讀） |
| 創作 / 實作 | @coder / @documenter |
| 修復 / Debug | @debugger |
| 審查評估 | @reviewer / @security / @perf-analyzer |
| 通訊 | @chief-of-staff / /draft-slack |
| 部署 | @deployer / /pr-workflow |
| 數據分析 | @data-analyst / @monitor |

### 維度 2：範圍估計

- **1-2 檔案**：直接操作（Read/Edit）
- **3-10 檔案**：可用 Agent，主進程也可直接操作
- **10+ 檔案 / 跨模組**：優先 Agent（隔離 context）
- **跨服務**：@architect 先設計邊界

### 維度 3：Context 依賴

- **需要最新狀態** → 主進程（Agent 看不到剛寫的修改）
- **獨立任務** → Agent（隔離 context）
- **依賴前步輸出** → 串行執行

### 維度 4：可並行性

- **無依賴** → 平行執行（Fan-out）
- **有依賴** → 串行執行（Chain）

## Agent 組合模式

| 模式 | 用途 | 特徵 |
|------|------|------|
| **Chain** | 有順序依賴 | Agent A 完 → Agent B 開始 |
| **Fan-out** | 並行驗證 | 一個觸發 → 多 Agent 同時跑 |
| **Fan-in** | 多角色決策 | 多 Agent 完 → 主進程整合 |
| **Hierarchical** | 超大任務 | Orchestrator 呼叫多個 Worker |

## 何時用 Agent

✅ 分析需要大量檔案（> 10 個）；獨立子任務；保護主 context；可與其他任務平行

❌ 單檔案修改；簡單查詢；需要主 context 最新結果；完成後立即需要依賴

**黃金法則**：Agent 做分析 + 報告，主進程做決策 + 寫檔案。

## Model 選擇決策樹

1. 需要複雜推理（架構決策）？→ Opus
2. 主要編碼任務（實作 / 重構）？→ Sonnet
3. 輕量或快速迴圈？→ Haiku
4. 成本優先的代理工作？→ Haiku

## Context 管理警戒線

| 用量 | 動作 |
|------|------|
| < 50% | 正常 |
| 50–70% | 避免大檔案，用 Grep/Glob |
| 70–85% | 考慮 /compact |
| > 85% | 立即 /compact 或 /save-session |

**應 /compact**：探索完畢、子任務完成、大量輸出已讀、超 70% 用量
**不 /compact**：修改未驗證；程式碼未完成；有未處理錯誤
