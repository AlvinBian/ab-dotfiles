---
name: tdd
description: >
  Test-Driven Development 流程：RED → GREEN → REFACTOR。
  Use when: "tdd", "測試驅動", "先寫測試", "紅綠燈", "test first".
metadata:
  version: 1.0.0
matchWhen:
  skills: ["vitest", "jest", "phpunit", "pytest", "go"]
---

# TDD 流程

## Step 1 — RED（寫失敗的測試）

1. 確認需求：函式簽名、輸入輸出、邊界條件
2. 建立測試檔案（同目錄，`*.test.ts` / `*.spec.ts`）
3. 寫測試案例（正向 + 反向 + 邊界，描述用繁體中文）
4. 執行測試 → 確認全部 FAIL（紅燈）

## Step 2 — GREEN（最小實作）

1. 寫最少的代碼讓測試通過
2. 不追求完美，只求通過
3. 執行測試 → 確認全部 PASS（綠燈）

## Step 3 — REFACTOR（重構）

1. 消除重複、改善命名、簡化邏輯
2. 每次改動後跑測試 → 確認仍全部 PASS
3. 確認覆蓋率 ≥ 80%：`npx vitest --coverage`

## 原則

- 每個 cycle 不超過 10 分鐘
- 測試描述用繁體中文
- 不 mock 內部邏輯，只 mock 外部依賴
- 先跑舊測試確認不 break
