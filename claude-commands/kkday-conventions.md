---
name: kkday-conventions
description: >
  KKday TypeScript / Vue / PHP 開發規範（精簡版，token 友好）。
  Use when: (1) 寫程式, (2) "coding style", "命名規範", "TypeScript 規範",
  (3) 建立新檔案或組件, (4) 需要知道 KKday 的開發慣例.
metadata:
  author: Alvin Bian
  version: 3.0.0
---

# KKday 開發規範

## 型別（TypeScript）

- 型別定義放 `.types.ts`，interface 用於物件，type 用於 union / function
- 只標註 object / array / function / ref / computed / defineProps / defineEmits
- 禁止 `any`，用 `unknown` + 型別收窄
- API response 型別放 `server/types/` 或 `*.types.ts`

## 命名

| 對象 | 規範 |
|------|------|
| 變數 / 函式 | camelCase |
| 常數 | UPPER_SNAKE_CASE |
| 類別 / Interface | PascalCase |
| Vue 組件檔 | PascalCase.vue |
| Vue 組件使用 | kebab-case |
| Vue event | kebab-case |
| PHP 函式 / 變數 | snake_case |
| PHP Controller / Model | PascalCase |

## 程式風格

- 縮排：2 spaces（JS / TS / Vue / SCSS）| 4 spaces（PHP）
- 引號：single quote | 分號 | trailing comma | 禁止 `var`
- import 順序：第三方 → 內部共用 → 同層 → 型別（各組間空行）
- 禁止 `console.log` 進 commit
- 禁止 hardcoded 字串（需用 i18n）

## Vue

- **Vue 3（b2c-web）**：`<script setup lang="ts">` + Composition API
- **Vue 2.7（member-ci）**：`defineComponent()` + Composition API
- Props 必須定義型別 | emit 用 kebab-case
- Store 用 Pinia（Vue 3）/ Vuex（Vue 2）

## PHP（CodeIgniter）

- Controller 繼承 `MY_Controller`，方法對應 route
- Model 繼承 `MY_Model`，DB 操作集中在 Model
- API response 統一用 `$this->api_response()`
- Cache 操作統一透過 Redis helper

## Git

- Conventional Commits：`{type}({scope}): {desc} [{TICKET}]`
- Branch：`{type}/{TICKET}-{desc}`
- 非必要不刪除原有邏輯（代碼保留原則）
- Breaking change 必須在 PR 描述標注跨 Repo 影響
