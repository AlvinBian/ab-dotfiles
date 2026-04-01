---
name: error-handling
description: >
  錯誤處理規範：分層處理、日誌記錄、用戶訊息、不吞錯誤。
matchWhen:
  always: true
---

# Error Handling

## 核心原則

- **不吞錯誤**：空的 `catch {}` 是 bug，不是處理
- **分層處理**：在正確的層處理，不重複處理
- **區分用戶訊息與內部日誌**：用戶看到可讀說明，日誌記錄完整上下文
- **Fail fast**：越早暴露問題越好，不要靜默繼續執行

## 錯誤分類

| 類型 | 處理方式 | 範例 |
|------|---------|------|
| 可預期業務錯誤 | 回傳 4xx，告知用戶 | 驗證失敗、資源不存在 |
| 外部依賴失敗 | Retry + fallback，記錄 | DB 連線失敗、第三方 API |
| 程式邏輯錯誤 | 回傳 500，記錄完整 stack | 空指針、型別錯誤 |
| 基礎設施錯誤 | 告警，快速失敗 | 磁碟滿、OOM |

## 日誌規範

```
# 錯誤日誌必須包含
logger.error('訂單建立失敗', {
  error: err.message,
  stack: err.stack,        // 內部日誌才記錄
  userId: user.id,         // 關鍵上下文
  orderId: order.id,
  requestId: ctx.requestId // 可追蹤
})

# 不要只記字串
logger.error('something went wrong')  ❌
```

## 禁止寫法

```javascript
// ❌ 吞錯誤
try { doSomething() } catch (e) {}

// ❌ 把 stack trace 回傳給用戶
res.json({ error: err.stack })

// ❌ 用 console.log 記錄錯誤
console.log('error:', err)

// ❌ 忽略 Promise rejection
fetchData().then(process)  // 沒有 .catch()
```

## 正確寫法

```javascript
// ✅ 明確處理，記錄上下文
try {
  await db.save(order)
} catch (err) {
  logger.error('Order save failed', { orderId: order.id, err })
  throw new DatabaseError('訂單儲存失敗', { cause: err })
}

// ✅ 全域 handler 處理未捕獲錯誤
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason })
})
```

## Retry 策略

- 外部 API / DB：指數退避（1s, 2s, 4s），最多 3 次
- 冪等操作才能 retry（POST 建立資源通常不應 retry）
- 超過 retry 上限後記錄告警，不靜默失敗
