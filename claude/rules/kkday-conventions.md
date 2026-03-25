# KKday 通用開發慣例

## TypeScript 型別規範
- 所有型別定義在 `.types.ts` 檔案中，不在 `.vue` 或 `.js` 內定義型別
- 使用 `interface` 定義物件型別，`type` 定義 union / primitive / function
- 型別匯入使用 `@import` 語法（TypeScript 5.5+）或 `import type`
- 只標註 object、array、function、ref、computed、defineProps、defineEmit

## API 呼叫慣例
- API 回傳格式：`{ metadata: { status: string }, data: T }`
- 錯誤處理必須包含 try-catch 且記錄足夠上下文
- API 路徑遵循 RESTful 風格

## Vue 組件慣例
- 單一職責原則：一個組件做一件事
- Props 必須定義型別，不使用 any
- Emit 事件名使用 kebab-case
- 組件檔案名使用 PascalCase

## 測試慣例
- 測試檔案放在對應原始碼旁邊，命名 `*.test.ts` 或 `*.spec.ts`
- 測試描述使用中文，清楚說明行為
- 覆蓋正向、反向、邊界三種情境

## JIRA 整合
- 主要專案：GT（kkday-b2c-web）、KB2CW
- Commit 和 PR 標題包含 ticket 編號
