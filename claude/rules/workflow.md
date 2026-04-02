---
name: workflow
description: >
  工作流程規範：測試策略、效能、構建優化。
matchWhen:
  always: true
---

# Workflow

## 測試規範

| 面向 | 要求 |
|------|------|
| **命名** | 繁體中文描述：`it('當使用者未登入時應導向登入頁')` |
| **位置** | 檔旁命名 `*.test.*` / `*.spec.*` |
| **覆蓋** | ✅ 正向 / ❌ 反向 / 🔲 邊界（null, empty, 極值） |
| **覆蓋率** | API ≥ 90%，工具函數 ≥ 95%，整體 ≥ 80% |

**Mock 原則**：✅ Mock 外部 API、第三方套件、資料庫、時間；❌ 不 Mock 內部邏輯、純函式、計算邏輯

## 效能規範

| 場景 | 模型 | 理由 |
|------|------|------|
| 主開發 | Sonnet | 最佳編碼效能 |
| 輕量代理 | Haiku | 3x 成本節省 |
| 深度推理 | Opus | 複雜架構決策 |

**Context 管理**：避免 context window 最後 20%；大型重構用 Plan Mode；單檔案直接編輯

**構建優化**：Turbopack / SWC；動態 import 拆分 bundle；WebP + lazy loading；API 加快取 header

## Retry 與 Fallback

- 外部 API / DB：指數退避（1s, 2s, 4s），最多 3 次
- 冪等操作才能 retry（POST 建立資源通常不應 retry）
- 超過限制後記錄告警，不靜默失敗
