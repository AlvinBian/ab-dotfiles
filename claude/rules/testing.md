---
name: testing
description: >
  測試撰寫規範：命名慣例、覆蓋要求、Mock 原則。
matchWhen:
  skills: ["vitest", "jest", "phpunit", "pytest", "go"]
  matchMode: any
---

## 命名

- 測試描述用繁體中文：`it('當使用者未登入時應導向登入頁')`
- 檔案放原始碼旁：`utils.ts` → `utils.test.ts`
- 每個 describe 對應一個 export / method

## 三情境覆蓋

| 情境 | 說明 |
|------|------|
| ✅ 正向 | Happy path，預期行為 |
| ❌ 反向 | 錯誤輸入、例外處理 |
| 🔲 邊界 | null / empty / 極值 / 併發 |

## Mock 原則

| ✅ 應 Mock | ❌ 不 Mock |
|-----------|-----------|
| 外部 API | 內部邏輯 |
| 第三方套件 | 純函式 |
| 資料庫 | 計算邏輯 |
| 時間 (Date.now) | 字串處理 |

## 覆蓋率

- 目標 ≥ 80%
- API 路由/控制器 ≥ 90%
- 工具函數 ≥ 95%
