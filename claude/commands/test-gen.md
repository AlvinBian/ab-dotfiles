---
name: test-gen
description: >
  單元測試生成，自動偵測框架並載入對應測試模式。
  Use when: "寫測試", "unit test", "加測試", "補測試", "測試覆蓋率", "test coverage".
metadata:
  version: 1.0.0
---

# 測試生成

## Step 1 — 框架偵測

分析專案配置檔（package.json / go.mod / Podfile 等），偵測：
- 語言：TypeScript / JavaScript / PHP / Swift / Go / Python
- 測試框架：Vitest / Jest / PHPUnit / XCTest / Go test / pytest
- 載入對應的技能片段

## Step 2 — 生成測試

### 測試類型

| 類型 | 說明 |
|------|------|
| ✅ 正向 | Happy path，預期行為 |
| ❌ 反向 | 錯誤輸入、例外處理 |
| 🔲 邊界 | null / empty / 極值 |

### 規範

- 測試描述用繁體中文：`it('當使用者點擊時應發送事件')`
- 檔案放原始碼旁（同目錄或 `__tests__/`）
- 每個 `describe` / test class 對應一個 export / method

### Mock 原則

| ✅ 應 Mock | ❌ 不 Mock |
|-----------|-----------|
| 外部 API 呼叫 | 內部邏輯 |
| 第三方套件 | 純函式 |
| 資料庫 / 檔案系統 | 計算邏輯 |

## Step 3 — 執行驗證

執行測試確認全部通過，無 skip / pending。
