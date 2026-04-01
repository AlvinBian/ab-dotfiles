---
name: tool-selection
description: >
  Agent / Command / Skill 選擇決策樹：何時用哪個工具，觸發詞對照，組合模式，反模式。
matchWhen:
  always: true
---

# Tool Selection Decision Tree

## 三層工具概念

| 層次 | 本質 | 執行者 | 適用場景 |
|------|------|--------|----------|
| **Agent** | 獨立子進程，有自己的 context 和工具 | 子進程 Claude | 耗時分析、平行作業、保護主 context |
| **Command** | `/cmd` 展開為結構化 prompt + 輸出模板 | 主進程 Claude | 複雜輸出格式、流程化工作 |
| **Skill** | 載入工作指引 prompt | 主進程 Claude | 標準化流程、有固定步驟的任務 |

> **原則**：Agent 做分析/生成，Command 做輸出，Skill 做流程。不確定時優先 Command，需要平行或隔離時用 Agent。

---

## 決策樹

### A. 開發生命週期

```
需求到上線全流程
│
├─ [需求分析 / 方案設計]
│   ├─ 功能複雜、需要拆任務 → @planner agent
│   ├─ 架構決策、選型比較、產出 ADR → @architect agent
│   └─ 快速了解陌生 codebase → /onboarding command
│
├─ [實作]
│   ├─ 寫新功能 / 修改既有邏輯 → @coder agent
│   ├─ 先寫測試再實作（TDD 流程）→ /tdd command
│   └─ 前端組件開發 → /multi-frontend command
│
├─ [測試]
│   ├─ 生成單元測試 → /test-gen command 或 @tester agent
│   ├─ 分析覆蓋率缺口 → /test-coverage command
│   └─ E2E 測試（Playwright）→ /e2e command
│
├─ [Review]
│   ├─ 程式碼審查（嚴重度分級）→ /code-review command 或 @reviewer agent
│   ├─ 複雜度 / 可讀性檢查 → /simplify command
│   ├─ 安全漏洞掃描 → @security agent
│   └─ 效能問題（bundle/SQL N+1）→ @perf-analyzer agent
│
├─ [發版]
│   ├─ 完整 PR 流程（分支+commit+PR）→ /pr-workflow command
│   ├─ 生成 changeset → /changeset command
│   ├─ 生成 CHANGELOG → /changelog command
│   └─ 部署、Release tag → @deployer agent
│
└─ [維護]
    ├─ 清理死代碼 / 舊 TODO → /refactor-clean command 或 @refactor agent
    ├─ 框架升級 / Breaking change 處理 → @migrator agent
    └─ 文件更新（README/API doc）→ @documenter agent
```

---

### B. 問題排查

```
遇到問題
│
├─ Build 失敗 / 編譯錯誤 → /build-fix command
├─ Bug 定位 / 錯誤日誌分析 → @debugger agent
├─ 效能問題（慢/記憶體/bundle）→ @perf-analyzer agent
├─ 監控告警 / 日誌異常模式 → @monitor agent
└─ 生產事故（P0/P1/P2）→ /incident command
```

---

### C. 數據 & 分析

```
數據相關
│
├─ 寫 SQL / 分析指標 / 找異常 → @data-analyst agent
└─ 掃描 codebase 統計（檔案數/使用率）→ @explorer agent
```

---

### D. 設計 & 規範

```
設計與規格
│
├─ 設計 REST API（命名/版本/錯誤格式）→ /api-design command
└─ DB Schema 設計 + Migration + Rollback 計畫 → /db-migration command
```

---

### E. 溝通 & 通知

```
對外溝通
│
├─ 寫 Slack 訊息（公告/告警/進度）→ /draft-slack command
├─ 審查 Slack 訊息格式 → /review-slack command
├─ Slack mrkdwn 格式查詢 → /slack-formatting command
└─ Email/Slack/LINE 訊息分類與回覆 → @chief-of-staff agent
```

---

### F. 環境 & 配置

```
環境設定
│
└─ 專案環境檢測、補齊缺失配置 → /auto-setup command
```

---

## 觸發詞速查表

### Agent 觸發詞

| 觸發詞 / 情境 | Agent |
|---|---|
| 「幫我規劃」「拆任務」「設計方案」 | @planner |
| 「架構決策」「ADR」「技術選型」「要不要用 X」 | @architect |
| 「幫我實作」「寫這個功能」「改這段邏輯」 | @coder |
| 「找 bug」「為什麼報錯」「追蹤問題」 | @debugger |
| 「跑測試」「生成測試」「補測試」 | @tester |
| 「發 PR」「commit」「打 tag」「release」 | @deployer |
| 「寫文件」「更新 README」「API 文件」 | @documenter |
| 「掃描 codebase」「有幾個檔案」「統計」 | @explorer |
| 「升級框架」「migration」「breaking change」 | @migrator |
| 「看日誌」「監控」「告警分析」 | @monitor |
| 「效能問題」「bundle 太大」「SQL N+1」 | @perf-analyzer |
| 「重構」「整理代碼」「消除重複」 | @refactor |
| 「幫我 review」「審查 PR」「code review」 | @reviewer |
| 「安全掃描」「有沒有漏洞」「secrets 洩漏」 | @security |
| 「寫 SQL」「分析指標」「找數據異常」 | @data-analyst |
| 「分類郵件」「整理 Slack 訊息」「幫我回覆」 | @chief-of-staff |

### Command / Skill 觸發詞

| 觸發詞 / 情境 | Command |
|---|---|
| 「設計 API」「REST 規範」「OpenAPI」 | /api-design |
| 「auto setup」「環境檢查」「補配置」 | /auto-setup |
| 「build 壞了」「編譯失敗」 | /build-fix |
| 「生成 changelog」「版本紀錄」 | /changelog |
| 「生成 changeset」「版本號」 | /changeset |
| 「幫我看代碼」「review 一下」「merge 前」 | /code-review |
| 「DB migration」「schema 設計」「rollback」 | /db-migration |
| 「寫 Slack 訊息」「Slack 公告」「草稿」 | /draft-slack |
| 「E2E 測試」「Playwright」「端對端」 | /e2e |
| 「P0」「生產事故」「出事了」「incident」 | /incident |
| 「前端組件」「React/Vue 開發」 | /multi-frontend |
| 「快速了解專案」「新成員 onboarding」 | /onboarding |
| 「發 PR」「開分支」「push」 | /pr-workflow |
| 「清死代碼」「unused export」「舊 TODO」 | /refactor-clean |
| 「檢查 Slack 格式」「mrkdwn 對嗎」 | /review-slack |
| 「太複雜了」「精簡」「simplify」 | /simplify |
| 「Slack 格式怎麼寫」「mrkdwn 語法」 | /slack-formatting |
| 「TDD」「先寫測試」「紅綠燈」 | /tdd |
| 「覆蓋率」「哪裡沒測到」 | /test-coverage |
| 「生成測試」「unit test」「補測試」 | /test-gen |

---

## 常見組合模式

### 新功能開發標準流程
```
@planner → @coder → /tdd → @reviewer → @security → /pr-workflow
```

### Bug 修復流程
```
@debugger → @coder → @tester → /code-review → /pr-workflow
```

### 架構重構流程
```
@architect → @planner → @refactor → @reviewer → /changelog → /pr-workflow
```

### 數據問題排查流程
```
@monitor → @data-analyst → @debugger（如需修復）
```

### 新人入職流程
```
/onboarding → @explorer（深入特定模組）→ /auto-setup（補環境配置）
```

### 發版流程
```
/changelog → /changeset → @reviewer（最終確認）→ @deployer
```

---

## 反模式（不要這樣用）

| 錯誤用法 | 正確做法 |
|---|---|
| 用 @explorer 讀大量檔案內容 | @explorer 只做統計，讀檔用 Read tool |
| 用 @coder 做架構決策 | 先 @architect → 再 @coder |
| 用 /code-review 替代 @security | /code-review 看邏輯，@security 找漏洞，各有側重 |
| 所有測試任務都用 @tester agent | 只生成測試用 /test-gen，分析覆蓋率用 /test-coverage |
| PR 前不跑 @security | 所有 PR 前應跑安全掃描 |
| 直接問 Claude 寫 Slack 訊息 | 先用 /draft-slack 確保格式正確 |
| 用 @planner 寫代碼 | @planner 唯讀，只出方案，@coder 才寫代碼 |

---

## 模型選擇原則

| 場景 | 模型 | 理由 |
|------|------|------|
| 架構設計 / 複雜推理 | opus（@architect, @planner） | 需要深度思考 |
| 代碼生成 / 日常開發 | sonnet（@coder, @reviewer...）| 最佳編碼模型 |
| 快速掃描 / 統計 | haiku（@explorer, @monitor） | 省 token，夠用 |

---

## 平行執行原則

獨立任務應同時啟動多個 agent：

```
# 發版前並行檢查（正確）
同時啟動：
- @security（安全掃描）
- @reviewer（代碼審查）
- @perf-analyzer（效能分析）

# 錯誤：依序執行浪費時間
先跑 @security → 完成後跑 @reviewer → 完成後跑 @perf-analyzer
```
