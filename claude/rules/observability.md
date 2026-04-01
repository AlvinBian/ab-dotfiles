---
name: observability
description: >
  可觀測性規範：結構化日誌、指標命名、分散式追蹤、告警設計。
matchWhen:
  always: true
---

# Observability

## 結構化日誌

每條 log 必須包含以下欄位，使用 JSON 格式輸出：

| 欄位 | 說明 | 範例 |
|------|------|------|
| `timestamp` | ISO 8601 UTC | `2024-01-15T10:30:00.123Z` |
| `level` | debug / info / warn / error | `"error"` |
| `service` | 服務名稱 | `"order-service"` |
| `traceId` | 分散式追蹤 ID | `"abc123"` |
| `requestId` | 單次請求 ID | `"req_xyz"` |
| `userId` | 若有認證上下文 | `"usr_456"` |

**禁止**：`console.log` 出現在 production 代碼；日誌含密碼、token、信用卡號。

```ts
// ✅ 正確
logger.error('Order creation failed', { orderId, userId, error: err.message, traceId })

// ❌ 錯誤
console.log('error:', err)
logger.info('User logged in', { password })
```

## 指標命名（RED 方法）

| 類型 | 命名規範 | 範例 |
|------|---------|------|
| Rate（QPS）| `<service>_<operation>_requests_total` | `order_create_requests_total` |
| Errors | `<service>_<operation>_errors_total` | `order_create_errors_total` |
| Duration | `<service>_<operation>_duration_seconds` | `order_create_duration_seconds` |

Counter 只增不減；Gauge 可增可減（如 queue depth）；Histogram 用於延遲分佈（p50/p95/p99）。

## 分散式追蹤

- Span 命名：`<verb> <resource>`，如 `GET /orders/{id}`、`INSERT orders`
- 跨服務傳遞 `traceId` 與 `spanId`（HTTP header: `X-Trace-Id`）
- 採樣策略：Production 預設 10%，Error 請求 100% 採樣
- 外部 API call 必須建立子 span，記錄 target host 與 status code

## 告警設計

- 基於 SLO 而非指標絕對值（e.g. error rate > 1% 觸發，而非 error count > 100）
- 每條告警附 runbook 連結，說明排查步驟
- 避免告警疲勞：相同根因在 5 分鐘內只觸發一次
- 告警分級：P1（立即喚醒）/ P2（工作時間處理）/ P3（下次 sprint 追蹤）

```yaml
# ✅ SLO-based 告警範例
alert: HighErrorRate
expr: rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m]) > 0.01
for: 2m
annotations:
  runbook: https://wiki/runbooks/high-error-rate
```
