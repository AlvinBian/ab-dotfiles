---
name: agent-orchestration
description: >
  Agent 編排規範：何時用 Agent、平行 vs 串行、組合模式、避免過度使用。
matchWhen:
  always: true
---

# Agent Orchestration

## 何時用 Agent vs 直接操作

| 情境 | 用 Agent | 直接操作 |
|------|---------|---------|
| 分析需要大量 Grep/Read（> 10 個檔案）| ✅ | |
| 獨立子任務，不依賴主 context 的中間狀態 | ✅ | |
| 需要保護主 context（耗時掃描）| ✅ | |
| 可與其他任務平行執行 | ✅ | |
| 單檔案修改、簡單查詢 | | ✅ |
| 需要主 context 的最新修改結果 | | ✅ |
| 任務完成後需立即繼續依賴該結果 | | ✅ |

**黃金法則**：Agent 做分析 + 報告，主進程做決策 + 寫檔案。

---

## 平行 vs 串行執行原則

### 平行（Parallel / Fan-out）

條件：任務之間沒有相互依賴。

```
# 正確：發版前並行檢查
同時啟動：
1. @security — 掃描安全漏洞
2. @reviewer — 審查程式碼品質
3. @perf-analyzer — 分析效能問題

# 錯誤：依序執行浪費時間
先 @security → 等待 → @reviewer → 等待 → @perf-analyzer
```

### 串行（Sequential / Chain）

條件：後一個任務依賴前一個任務的輸出。

```
# 正確：新功能開發
@planner（產出方案） → @coder（依方案實作） → @reviewer（審查代碼）

# 錯誤：@coder 在 @planner 還沒確立方向時就開始寫
```

---

## Agent 組合模式

### Chain（鏈式）

每個 Agent 的輸出是下一個 Agent 的輸入。

```
用途：有順序依賴的流程
範例：@planner → @coder → @tester → @reviewer → /pr-workflow
```

### Fan-out（廣播）

一個觸發，多個 Agent 並行執行獨立任務。

```
用途：並行驗證、多維度分析
範例：上線前同時跑 @security + @reviewer + @perf-analyzer
```

### Fan-in（收斂）

多個 Agent 完成後，主進程整合結果做最終決策。

```
用途：多角色 review、集體 code review
範例：
  並行：@security + @reviewer + @data-analyst
  主進程收集三份報告 → 整合優先問題清單 → 決定是否上線
```

### Hierarchical（階層）

Orchestrator Agent 呼叫多個 Worker Agents。

```
用途：超大型任務（> 20 個檔案的重構）
範例：
  @planner（orchestrator）
    ├─ @explorer（分析現有代碼）
    ├─ @refactor（清理死代碼）
    └─ @tester（補測試）
```

---

## 避免 Agent 過度使用的反模式

| 反模式 | 問題 | 正確做法 |
|--------|------|---------|
| 每個問題都啟動 Agent | 冷啟動成本高，小任務得不償失 | 只有 > 5 分鐘的任務才用 Agent |
| Agent 結果全部貼回主 context | context 膨脹，抵銷隔離優勢 | 只保留關鍵結論，丟棄原始輸出 |
| 用 Agent 做需要主進程最新狀態的任務 | Agent 拿不到主進程剛寫的修改 | 主進程寫完 → commit → Agent 才讀 |
| Chain 太長（> 5 個 Agent）| 錯誤傳播、難以除錯 | 拆成多個獨立 session |
| @planner / @architect 直接寫檔案 | 違反唯讀職責，混淆責任 | 規劃 Agent 只出文字方案 |

---

## Agent 能力邊界

### 唯讀 Agent（不可寫檔案）

| Agent | 能做 | 不能做 |
|-------|------|--------|
| @planner | 規劃、拆任務、時程估算 | 寫代碼、修改配置 |
| @architect | 架構設計、ADR 建議 | 實作決策 |
| @security | 漏洞掃描、安全報告 | 修改代碼 |
| @perf-analyzer | 效能分析、瓶頸定位 | 優化代碼 |
| @explorer | codebase 統計、依賴圖 | 修改任何檔案 |
| @monitor | 日誌分析、告警摘要 | 修改配置 |
| @data-analyst | SQL 分析、數據洞察 | 修改 DB |
| @dependency-auditor | 依賴健康報告 | 執行 npm install |
| @accessibility | WCAG 審查報告 | 修改代碼 |
| @reviewer | 程式碼審查報告 | 修改被審代碼 |
| @chief-of-staff | 訊息分類、回覆草稿 | 直接發送訊息 |

### 可寫檔案 Agent（有限寫入）

| Agent | 可寫範圍 |
|-------|---------|
| @coder | 任務範圍內的源碼 |
| @tester | 測試檔案（*.test.*, *.spec.*）|
| @refactor | 重構範圍內的源碼（不改邏輯）|
| @documenter | 文件檔案（README, docs/）|
| @migrator | migration 腳本、配置更新 |
| @deployer | CI/CD 配置、Release tag |
| @debugger | 修復 bug 的最小範圍 |

---

## Agent 輸出整合回主 context

### 輸出格式規範

Agent 完成後，以下格式報告給主 context：

```
## [Agent 名稱] 結果

**結論**（1-3 句話）：{關鍵發現}

**待辦**（如有）：
- [ ] {行動項目 1}
- [ ] {行動項目 2}

**詳情**：{僅保留主進程需要的部分}
```

### 整合原則

1. 主進程只保留「結論」和「待辦」，其餘丟棄
2. 多個 Agent 結果 → 優先合併重複的待辦事項
3. 衝突結論 → 明確標記，由主進程或用戶決策
4. Agent 的原始掃描輸出不貼入主 context
