---
name: multi-frontend
description: >
  多前端框架開發輔助，自動偵測框架並載入對應最佳實踐。
  Use when: "frontend", "前端", "組件開發", "UI 開發", "component".
metadata:
  version: 1.0.0
matchWhen:
  skills: ["vue", "react", "nuxt", "next", "svelte", "angular"]
---

# Frontend Development

## Step 1 — 框架偵測

分析專案：
- Vue 3 + Nuxt 3 → Composition API + auto-import
- React + Next.js → Hooks + Server Components
- 通用 → 依 package.json 判斷

## Step 2 — 組件開發

| 規範 | Vue | React |
|------|-----|-------|
| 狀態管理 | `ref` / `reactive` / Pinia | `useState` / Zustand |
| API 呼叫 | `useFetch` / `useAsyncData` | `use` / `useSWR` |
| 樣式 | Scoped CSS / Tailwind | CSS Modules / Tailwind |
| 型別 | defineProps<T>() | interface Props {} |

## Step 3 — 品質檢查

- 組件 ≤ 200 行（超過則拆分）
- Props 必須定義型別
- 事件名用 kebab-case（Vue）/ onXxx（React）
- 無 any 型別
