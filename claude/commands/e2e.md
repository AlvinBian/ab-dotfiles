---
name: e2e
description: >
  End-to-End 測試生成與執行（Playwright）。
  Use when: "e2e", "端對端", "playwright", "整合測試", "E2E test".
metadata:
  version: 1.0.0
matchWhen:
  skills: ["playwright", "cypress", "nuxt", "next", "vue", "react"]
---

# E2E Testing

## Step 1 — 環境確認

```bash
npx playwright --version 2>/dev/null || echo "需要安裝: npm i -D @playwright/test"
```

## Step 2 — 生成測試

針對關鍵用戶旅程（critical user journeys）生成：
- 登入/登出流程
- 核心業務操作（CRUD）
- 表單提交 + 驗證
- 導航 + 頁面切換
- 錯誤狀態處理

### 測試結構

```typescript
test.describe('用戶旅程：{功能}', () => {
  test('正常流程', async ({ page }) => { ... })
  test('錯誤處理', async ({ page }) => { ... })
  test('邊界條件', async ({ page }) => { ... })
})
```

## Step 3 — 執行

```bash
npx playwright test --reporter=html
npx playwright show-report
```

截圖和 trace 保存到 `test-results/`。
