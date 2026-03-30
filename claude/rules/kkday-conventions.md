---
name: kkday-conventions
description: >
  KKday TypeScript / Vue / PHP 開發規範。
matchWhen:
  org: ["kkday"]
  skills: ["vue", "typescript", "php", "nuxt"]
  matchMode: any
---

## TypeScript 型別規範
- 型別定義在 `.types.ts`，不在 `.vue` 或 `.js` 內定義
- `interface` 定義物件，`type` 定義 union / primitive / function
- 型別匯入用 `import type`
- 只標註 object、array、function、ref、computed、defineProps、defineEmits

## API 呼叫慣例
- 回傳格式：`{ metadata: { status: string }, data: T }`
- try-catch + 上下文日誌
- RESTful 路徑風格

## Vue 組件慣例
- 單一職責，Props 必須定義型別，不使用 any
- Emit 事件名 kebab-case，檔名 PascalCase

## 測試慣例
- 測試檔放原始碼旁，`*.test.ts` 或 `*.spec.ts`
- 描述用中文，覆蓋正向/反向/邊界

## JIRA 整合
- 主要專案：GT（kkday-b2c-web）、KB2CW
- Commit 和 PR 標題包含 ticket 編號
