---
name: code-style
description: >
  代碼格式、函式設計、命名慣例規範。
matchWhen:
  always: true
---

# Code Style

## 格式

- 縮排：依專案設定（通常 2 spaces for JS/TS，4 spaces for PHP/Python/Go）
- 行尾不留空白，檔案末尾留一個空行
- 單行不超過 120 字元

## 函式

- 超過 30 行考慮拆分
- 單一職責，一個函式做一件事
- 避免超過 3 層巢狀

## 命名

- 使用有意義的名稱，避免縮寫（`getUserData` 非 `getUD`）
- Boolean 變數用 `is` / `has` / `should` 前綴
- 具體命名慣例（camelCase / snake_case 等）依語言技能片段定義
