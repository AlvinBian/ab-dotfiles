---
name: api-conventions
description: >
  API 設計規範：REST 命名、HTTP 方法、狀態碼、錯誤格式、分頁。
matchWhen:
  always: true
---

# API Conventions

## 命名

- 資源用名詞複數 kebab-case：`/api/v1/user-profiles`
- 不用動詞：`/getUser` ❌ → `/users/{id}` ✅
- 子資源表達關係：`/users/{id}/orders/{orderId}`
- 動作型操作用子資源：`POST /users/{id}/activate`

## HTTP 方法

| 方法 | 用途 | 成功回應 |
|------|------|---------|
| GET | 讀取，不改變狀態 | 200 |
| POST | 建立資源 | 201 + Location header |
| PUT | 完整替換 | 200 / 204 |
| PATCH | 部分更新 | 200 / 204 |
| DELETE | 刪除 | 204 |

## 狀態碼

- `200` 成功讀取 / 更新
- `201` 成功建立
- `204` 成功，無回應內容
- `400` 請求格式錯誤 / 驗證失敗
- `401` 未認證
- `403` 已認證但無權限
- `404` 資源不存在
- `409` 衝突（重複建立、樂觀鎖衝突）
- `422` 語義錯誤（格式對但業務邏輯不通過）
- `429` 超過速率限制
- `500` 伺服器錯誤（不應包含堆疊資訊）

## 錯誤格式（統一）

```json
{
  "error": {
    "code": "SNAKE_CASE_ERROR_CODE",
    "message": "人讀說明",
    "details": [{ "field": "email", "message": "格式不正確" }],
    "requestId": "req_xyz"
  }
}
```

## 分頁

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 100,
    "hasNext": true
  }
}
```

## 其他規範

- 時間格式：ISO 8601（`2024-01-15T10:30:00Z`），統一 UTC
- 金額：整數分（避免浮點精度問題）
- 版本：URL 路徑（`/api/v1/`）
- Response 永遠回傳 JSON，Content-Type 必須正確
- GET 請求不應有副作用
