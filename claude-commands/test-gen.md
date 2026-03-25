---
name: test-gen
description: >
  KKday 單元測試生成，自動選擇 Vitest/Jest，支援 Vue/TS/PHP。
  Use when: (1) "寫測試", "unit test", "test", "加測試",
  (2) "補測試", "測試覆蓋率", "test coverage".
metadata:
  author: Alvin Bian
  version: 3.0.0
---

# 測試生成

## 框架自動偵測

```bash
grep -q "vitest" package.json && echo "vitest" || echo "jest"
# kkday-b2c-web → Vitest + @nuxt/test-utils
# kkday-member-ci / kkday-mobile-member-ci → Jest 29 + @vue/test-utils
```

## 前端測試流程

1. 讀取目標原始碼，理解 exports / props / emits / composables / store actions
2. 產出三類測試：**正向**（happy path）+ **反向**（錯誤處理）+ **邊界**（null / empty / 極值）
3. 測試描述用繁體中文：`it('當使用者點擊時應發送事件')`
4. 檔案放原始碼旁：`Component.test.ts`

### Mock 原則

✅ Mock：API 呼叫、第三方套件、Nuxt imports（`useAsyncData`, `useFetch`）、Vuex store
❌ 不 Mock：內部邏輯、純函式、computed 計算

### Nuxt 3 mock 範本

```typescript
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))
mockNuxtImport('useAsyncData', () => mockFn)
```

### Vue 2.7 / Jest 範本

```typescript
jest.mock('@/store', () => ({ useStore: jest.fn() }))
```

## PHP 測試（PHPUnit）

```bash
./vendor/bin/phpunit tests/Unit/Services/YourServiceTest.php
```

- 繼承 `TestCase`，方法命名 `test_action_expected_result`
- Mock：`$this->createMock(DependencyClass::class)`

## 執行驗證

```bash
npx vitest run path/to/Component.test.ts          # Nuxt 3
npx jest path/to/Component.test.ts --no-coverage  # Vue 2.7
./vendor/bin/phpunit tests/Unit/...               # PHP
```
