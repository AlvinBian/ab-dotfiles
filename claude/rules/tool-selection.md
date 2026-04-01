---
name: tool-selection
description: >
  AI 語意路由框架：用四維分析推理選擇 Agent / Command / Skill，
  不做關鍵字硬匹配，從意圖、範圍、依賴、可並行性出發做決策。
matchWhen:
  always: true
---

# Tool Selection — AI Semantic Routing

## 核心原則

**不要關鍵字匹配。** 每次收到請求，先做四維分析，再推導最適合的工具組合。

---

## 四維分析框架

收到任何請求前，先在腦中快速過這四個問題：

### 維度 1：意圖類型（Intent）

| 意圖 | 特徵 | 傾向工具 |
|------|------|---------|
| **理解** | 想搞懂某個概念、代碼、系統 | Read + 直接解釋，或 @explorer |
| **規劃** | 方向未定，需要拆任務或設計方案 | @planner、@architect（唯讀） |
| **創作** | 寫新功能、生成文件、實作需求 | @coder、@documenter、/command |
| **修復** | 已知有問題，要找原因並修好 | @debugger、/build-fix |
| **審查** | 已有產出，要從某個維度評估 | @reviewer、@security、@perf-analyzer |
| **通訊** | 對外溝通、發布通知、回覆訊息 | /draft-slack、@chief-of-staff |
| **部署** | 打標、發版、推送、管理 release | @deployer、/pr-workflow |
| **分析** | 理解數據、指標、日誌、統計 | @data-analyst、@monitor、@explorer |

### 維度 2：範圍估計（Scope）

- **單點（1-2 檔案）**：直接操作（Read/Edit），不需要 Agent
- **模組級（3-10 檔案）**：可以 Agent 但不強求；主進程直接操作也可以
- **系統級（10+ 檔案、跨模組）**：優先 Agent，隔離 context 避免膨脹
- **跨服務**：需要 @architect 先做邊界設計，再分配給其他 Agent

### 維度 3：Context 依賴（Dependency）

問自己：「這個任務需要剛才寫的代碼或對話狀態嗎？」

- **需要最新狀態** → 主進程直接執行，不要 Agent（Agent 看不到主進程剛寫的修改）
- **獨立任務** → 適合 Agent（可以隔離 context，不互相污染）
- **需要前一步的輸出** → 串行（前一步完成後才啟動下一步）

### 維度 4：可並行性（Parallelization）

問自己：「這些子任務互相依賴嗎？」

- **互相獨立** → 同時啟動多個 Agent（Fan-out）
- **有順序依賴** → 串行（Chain）
- **最終需要彙整** → Fan-in（多 Agent 並行 → 主進程收集結果）

---

## 推理示範

這不是規則表，而是推理範例，幫助你建立直覺。

### 範例 A：「幫我在這個模組加一個 rate limiting」

分析：
- 意圖：創作（寫新功能）
- 範圍：模組級（3-5 個檔案）
- Context 依賴：可能需要看現有代碼結構 → 先讀，再決定 Agent 或直接操作
- 可並行：否，這是單一線性任務

**推導**：範圍不大，可以主進程直接操作；若需要不打擾主 context，用 @coder

---

### 範例 B：「準備 PR，包括審查、安全掃描、效能」

分析：
- 意圖：三個審查維度（代碼品質 + 安全 + 效能）
- 範圍：可能跨多個檔案
- Context 依賴：三個任務互相獨立
- 可並行：**完全並行**

**推導**：Fan-out 同時啟動 @reviewer + @security + @perf-analyzer，結果彙整後決定是否發 PR

---

### 範例 C：「這個功能有 bug，幫我找出來修掉」

分析：
- 意圖：修復
- 範圍：不確定（先診斷）
- Context 依賴：修復依賴診斷結果 → 串行
- 可並行：診斷和修復有順序依賴

**推導**：@debugger 先找根因 → 根因確定後 @coder 修復（或主進程直接修）

---

### 範例 D：「幫我設計一個通知系統架構，然後實作」

分析：
- 意圖：規劃（架構）→ 創作（實作）
- 範圍：系統級
- Context 依賴：實作依賴架構設計
- 可並行：不可，有強順序依賴

**推導**：@architect 先設計（唯讀，出文字方案）→ 用戶確認 → @coder 實作

---

### 範例 E：「快速了解這個 codebase，找出哪裡可以改進」

分析：
- 意圖：理解 + 分析
- 範圍：系統級（要掃全局）
- Context 依賴：獨立任務
- 可並行：可以同時讓 @explorer 統計 + @reviewer 快速審查

**推導**：/onboarding（快速了解）→ @explorer 補充統計 → @reviewer 找改進點

---

## 工具能力邊界

選工具前確認：這個工具**有權限**做這件事嗎？

### 唯讀（只能分析、報告，不能寫檔案）

| 工具 | 職責 |
|------|------|
| @planner | 規劃、拆任務、時程估算 |
| @architect | 架構設計、ADR、技術選型 |
| @architecture-reviewer | SOLID / 耦合 / 分層 / 擴展性深度審查 |
| @security | 漏洞掃描、secrets 偵測 |
| @perf-analyzer | 效能瓶頸、bundle 分析、N+1 |
| @load-tester | 壓測設計、容量估算 |
| @database-reviewer | N+1 / 索引 / migration 審查 |
| @typescript-reviewer | 型別安全 / strict 模式審查 |
| @accessibility | WCAG 合規審查 |
| @dependency-auditor | 依賴健康、漏洞版本報告 |
| @explorer | codebase 統計、使用率分析 |
| @monitor | 日誌模式、告警分析 |
| @data-analyst | SQL 查詢、指標分析 |
| @reviewer | 代碼審查、嚴重度分級 |
| @chief-of-staff | 訊息分類、回覆草稿 |

### 可寫（有限寫入範圍）

| 工具 | 可寫範圍 |
|------|---------|
| @coder | 任務範圍內的源碼 |
| @tester | 測試檔案（*.test.*, *.spec.*） |
| @refactor | 重構範圍內源碼（不改邏輯） |
| @documenter | 文件檔案（README, docs/） |
| @migrator | migration 腳本、配置更新 |
| @deployer | CI/CD 配置、Release tag |
| @debugger | 修復 bug 的最小範圍 |
| @build-error-resolver | 最小 diff 修復 build 錯誤 |
| @tdd-guide | 測試 + 對應實作 |

---

## 組合模式（推理輔助，非強制規則）

不要死記這些組合。把它們當作推理的起點：看到類似場景，先想想這個組合是否合適，再根據實際情況調整。

**新功能（標準）**
→ 考慮：@planner 確立方向 → @coder 實作 → /tdd 補測試 → @reviewer + @security 並行審查 → /pr-workflow

**Bug 修復**
→ 考慮：@debugger 定位 → @coder 修復 → @tester 驗證 → /pr-workflow

**系統重構**
→ 考慮：@architect 設計邊界 → @refactor 清理 → @reviewer 確認 → /changelog + /pr-workflow

**架構設計**
→ 考慮：@architect 出 ADR → /adr 格式化 → 存入 docs/

**數據異常排查**
→ 考慮：@monitor 找模式 → @data-analyst 分析根因 → @debugger 定位代碼

**發版前品質門**
→ 考慮：@security + @reviewer + @perf-analyzer 並行 → /quality-gate 彙整 → /changelog → @deployer

**新人 onboarding**
→ 考慮：/onboarding 概覽 → @explorer 統計 → /auto-setup 補環境

**TypeScript 專案品質**
→ 考慮：@typescript-reviewer + @database-reviewer + @architecture-reviewer 並行 → /quality-gate

---

## 模型選擇決策樹

收到任何任務時，**按順序走以下決策節點**，第一個命中的分支即為答案。不要跳節點，不要同時評估多個分支。

```
START：收到任務
│
├─ [Q1] 是批次操作 或 每次 commit/save 都會觸發？
│        例：分析100個檔案、掃描全 repo、lint fix、預熱呼叫
│   YES ──→ ★ HAIKU（高頻，推理代價高過收益）
│   NO  ↓
│
├─ [Q2] 輸出只需要「分類 / 標籤 / 計數」？
│        例：是/否判斷、A/B/C 分類、統計數字、版本比對
│   YES ──→ ★ HAIKU（低推理，結構化輸出）
│   NO  ↓
│
├─ [Q3] 涉及「架構決策」或「不可逆操作」？
│        例：系統邊界設計、ADR、刪除 schema、選型取捨、
│            影響多個下游服務的改動
│   YES ──→ ★ OPUS（高錯誤代價，需要深度推理）
│   NO  ↓
│
├─ [Q4] 需要同時理解 3+ 個模組 / 大量跨檔案上下文？
│        例：分析整個認證系統、理解 legacy monorepo 關係、
│            1M context 的優勢有實質作用
│   YES ──→ ★ OPUS（大上下文，1M context 發揮作用）
│   NO  ↓
│
├─ [Q5] 這個問題「非直覺」且已嘗試多次仍未解？
│        例：「試了3種方法還是不對」、「行為很奇怪看不懂」、
│            跨多層的 race condition、神秘的型別推斷錯誤
│   YES ──→ ★ OPUS（需要深度推論找根因）
│   NO  ↓
│
├─ [Q6] 需要評估重大技術選型取捨？
│        例：「要選 Kafka 還是 RabbitMQ」、「要不要引入微服務」、
│            「這個設計長期維護成本如何」
│   YES ──→ ★ OPUS（tradeoff 分析，需要全面考慮）
│   NO  ↓
│
└─ DEFAULT ──→ ★ SONNET
                （代碼實作、review、一般 bug、文件、測試生成、
                  安全掃描、效能分析、部署流程…等絕大多數任務）
```

### 自動升級規則（Sonnet → Opus）

開始用 Sonnet 執行後，遇到以下情況**自動升級到 Opus**，不需要等使用者指示：

- Sonnet 的回答包含「可能」「不確定」「建議進一步確認」等不確定語氣，且任務是關鍵決策
- 第一次嘗試給出的方案，使用者說「不對」或「還是有問題」超過 1 次
- 分析到一半發現影響範圍遠超預期（原以為 2 個檔案，實際跨 8 個模組）
- 任務涉及資安漏洞確認（錯判後果嚴重）

升級時說明原因：「這個問題超出初步判斷的複雜度，切換到 Opus 重新分析。」

### 禁止濫用 Opus 的情況

以下情況**即使使用者沒有指定，也不應升級到 Opus**（避免浪費）：

- 任務有標準答案或固定流程（lint、格式化、常見錯誤修復）
- 只是生成樣板代碼（CRUD、test stub、boilerplate）
- 重試相同的 Sonnet 請求（換模型不能解決 prompt 問題）
- 使用者只是在測試或草稿階段

### 各 Agent 的決策樹結果

這些是對每個 agent 典型任務走完決策樹後的結論，作為快速查找：

| Agent | 模型 | 命中節點 |
|-------|------|---------|
| @architect | **opus** | Q3（架構決策）|
| @architecture-reviewer | **opus** | Q3（不可逆的架構判斷）|
| @planner | **opus** 或 **sonnet** | Q3（系統級規劃）或 DEFAULT |
| @debugger | **sonnet** → 升 **opus** | DEFAULT，Q5 命中時升級 |
| @security | **sonnet** | DEFAULT（有方法論）|
| @coder | **sonnet** | DEFAULT |
| @reviewer | **sonnet** | DEFAULT |
| @tester | **sonnet** | DEFAULT |
| @refactor | **sonnet** | DEFAULT |
| @migrator | **sonnet** | DEFAULT |
| @deployer | **sonnet** | DEFAULT |
| @perf-analyzer | **sonnet** | DEFAULT |
| @database-reviewer | **sonnet** | DEFAULT（索引/N+1 有 checklist）|
| @typescript-reviewer | **sonnet** | DEFAULT |
| @documenter | **sonnet** | DEFAULT |
| @load-tester | **sonnet** | DEFAULT |
| @accessibility | **sonnet** | DEFAULT |
| @build-error-resolver | **sonnet** | DEFAULT |
| @tdd-guide | **sonnet** | DEFAULT |
| @chief-of-staff | **sonnet** | DEFAULT |
| @explorer | **haiku** | Q1（批次掃描）|
| @monitor | **haiku** | Q1（批次日誌分析）|
| @dependency-auditor | **haiku** | Q2（版本比對分類）|
| @data-analyst | **haiku** 或 **sonnet** | Q2（簡單查詢）或 DEFAULT（複雜分析）|

---

## 應避免的選法

不是「這樣做錯」，而是「這樣做代價高，通常有更好的方式」：

- **用 Agent 做 1-2 檔案的修改** — 冷啟動成本比直接操作高
- **把 Agent 大量輸出貼回主 context** — 抵銷了隔離的優勢，只保留結論
- **不確認架構就開始寫** — @planner/@architect 先，@coder 後
- **PR 前略過安全審查** — @security 應是發版前的標配
- **@planner/@architect 直接寫代碼** — 唯讀角色，方案由 @coder 實作
- **Chain 超過 5 個 Agent** — 錯誤傳播難追蹤，考慮拆成多個 session
- **用主進程直接做系統級重構** — 10+ 檔案的修改用 Agent 隔離 context
