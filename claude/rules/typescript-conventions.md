---
name: typescript-conventions
description: >
  TypeScript 代碼規範：型別安全、泛型設計、嚴格模式要求。
matchWhen:
  paths:
    - "**/*.ts"
    - "**/*.tsx"
---

# TypeScript Conventions

## 嚴格模式

`tsconfig.json` 必須啟用：

```json
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }
```

- 禁止裸 `any`，改用 `unknown` 加型別收窄
- 禁止 `@ts-ignore`，用 `@ts-expect-error` 並附說明
- 禁止非 null assertion `!`，除非有文件說明為何確定非 null

## 型別設計

**interface vs type alias**

- `interface`：可擴展的物件形狀、class 契約、API response
- `type`：union / intersection、mapped type、utility type 組合

```ts
// ✅ interface 用於可擴展的物件
interface UserProfile { id: string; email: string }

// ✅ type 用於 union
type Status = 'pending' | 'active' | 'inactive'

// ✅ Discriminated union 明確區分變體
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

## 泛型約束

- 泛型參數名要有語義（`TEntity` 優於 `T`，除非是通用工具函式）
- 約束要有意義，`T extends object` 不如 `T extends Record<string, unknown>`
- 避免過度泛化：若只有一種用法就直接用具體型別

```ts
// ✅ 有意義的約束
function findById<TEntity extends { id: string }>(
  items: TEntity[],
  id: string
): TEntity | undefined

// ❌ 無意義的泛型
function wrap<T>(value: T): { data: T }  // 直接寫 inline 即可
```

## 禁止清單

| 禁止 | 替代方案 |
|------|---------|
| `any` | `unknown` + type guard |
| `@ts-ignore` | `@ts-expect-error // reason` |
| `as SomeType`（強制轉型）| 型別守衛或 `satisfies` |
| `Function` 型別 | 明確的函式簽名 |
| `Object` / `{}` 型別 | `Record<string, unknown>` |
| `enum`（數值）| `const` object + `keyof typeof` |

## 常用 Utility Types

優先使用內建 utility 而非手動重寫：`Partial<T>`、`Required<T>`、`Pick<T, K>`、`Omit<T, K>`、`Readonly<T>`、`ReturnType<F>`、`Parameters<F>`。
