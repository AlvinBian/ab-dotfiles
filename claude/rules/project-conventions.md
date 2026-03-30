---
name: project-conventions
description: >
  專案開發慣例：API 格式、錯誤處理、測試策略、版本控制。
matchWhen:
  always: true
---

## API 慣例
- 統一回傳格式：`{ metadata: { status: string }, data: T }`
- 錯誤處理必須包含 try-catch 且記錄足夠上下文
- RESTful 路徑風格

## 測試慣例
- 測試檔放原始碼旁，命名 `*.test.*` 或 `*.spec.*`
- 測試描述清楚說明行為
- 覆蓋正向、反向、邊界三種情境

## 版本控制
- Commit 和 PR 標題包含 ticket 編號
- branch 命名：`<type>/<TICKET>-<short-desc>`
