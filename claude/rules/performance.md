---
name: performance
description: >
  效能規範：AI 模型選擇、Context 管理、構建優化。
matchWhen:
  always: true
---

## AI 模型選擇

| 場景 | 模型 | 理由 |
|------|------|------|
| 主開發 | Sonnet | 最佳編碼模型 |
| 輕量代理 | Haiku | 3x 成本節省 |
| 深度推理 | Opus | 複雜架構決策 |

## Context 管理

- 避免 context window 最後 20%
- 大型重構用 Plan Mode
- 單檔案編輯直接操作

## 構建優化

- 使用 Turbopack / SWC 替代 webpack
- 動態 import 拆分 bundle
- 圖片用 WebP + lazy loading
- API 回應加快取 header
