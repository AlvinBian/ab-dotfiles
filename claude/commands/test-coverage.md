---
name: test-coverage
description: >
  測試覆蓋率分析，找出低覆蓋區域並補測試。
  Use when: "coverage", "覆蓋率", "測試覆蓋", "哪裡沒測", "test coverage".
metadata:
  version: 1.0.0
matchWhen:
  skills: ["vitest", "jest", "phpunit", "pytest", "go"]
---

# Test Coverage

## Step 1 — 產生覆蓋率報告

```bash
# Vitest
npx vitest --coverage --reporter=json
# Jest
npx jest --coverage --json
```

## Step 2 — 分析低覆蓋

找出覆蓋率 < 80% 的檔案，按業務重要性排序：
1. API 路由 / 控制器
2. 業務邏輯 / 服務層
3. 工具函數
4. UI 組件

## Step 3 — 補測試

針對低覆蓋的函式，按 TDD 原則補測試：
- 正向：happy path
- 反向：error handling、invalid input
- 邊界：null、empty、極值
