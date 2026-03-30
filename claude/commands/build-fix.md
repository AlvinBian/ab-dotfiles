---
name: build-fix
description: >
  構建錯誤自動診斷與修復。
  Use when: "build 壞了", "編譯失敗", "build error", "build fix", "構建失敗".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Build Fix

## Step 1 — 錯誤收集

```bash
# 依專案類型選擇
npm run build 2>&1 | tail -50
npx tsc --noEmit 2>&1 | head -30
```

## Step 2 — 錯誤分類

| 類型 | 處理 |
|------|------|
| 型別錯誤 | 修正 type annotation / 加 type assertion |
| Import 錯誤 | 修正路徑 / 安裝缺少套件 |
| 語法錯誤 | 修正語法 |
| 配置錯誤 | 修正 tsconfig / vite.config / nuxt.config |

## Step 3 — 逐一修復

1. 按錯誤數量排序，從影響最大的開始
2. 每修一個跑一次 build，確認錯誤數減少
3. 不做額外改動，只修 build 錯誤

## Step 4 — 驗證

```bash
npm run build && echo "✅ Build passed"
npx tsc --noEmit && echo "✅ Type check passed"
```
