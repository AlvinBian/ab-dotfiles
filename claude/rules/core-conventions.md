---
name: core-conventions
description: >
  核心程式碼規範：格式、命名、函式設計。最常用，務必精簡。
matchWhen:
  always: true
---

# Core Conventions

## 格式與命名

- **縮排**：依專案設定（JS/TS 2 spaces，PHP/Python/Go 4 spaces）
- **行尾**：無空白，檔案末尾一個空行，單行 ≤ 120 字元
- **命名**：有意義的名稱，避免縮寫（`getUserData` vs `getUD`）
- **Boolean**：`is` / `has` / `should` 前綴
- **語言慣例**：camelCase / snake_case 依語言技能片段定義

## 函式設計

- 超過 30 行考慮拆分
- 單一職責，最多 3 層巢狀
- 無副作用，明確返回值

## 專案開發慣例

| 面向 | 規範 |
|------|------|
| **API** | 統一回傳 `{ metadata: { status }, data: T }`；RESTful 路徑 |
| **測試** | 檔放原始碼旁 `*.test.*` / `*.spec.*`；覆蓋正向、反向、邊界 |
| **版本控制** | Commit/PR 含 ticket 編號；branch `<type>/<TICKET>-<desc>` |

## 版本控制規範

- **Branch 命名**：`feat/PROJ-1234-add-login`
- **Commit**：Conventional Commits (`<type>(<scope>): <subject>`)
- **PR 流程**：測試通過才 merge，禁止 force push 到 main/develop/master
