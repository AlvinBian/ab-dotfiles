---
name: api-design
description: >
  API 設計審查與生成：REST 規範、命名、版本策略、錯誤格式、OpenAPI。
  Use when: "設計 API", "api design", "review API", "REST 規範", "endpoint 命名", "OpenAPI", "swagger".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# API Design

## Step 1 — 確認設計目標

詢問（未提供則依上下文推斷）：
- API 類型：REST / GraphQL / gRPC？
- 消費者：前端 App / 第三方 / 內部服務？
- 是設計新 API 還是審查現有設計？

## Step 2 — REST 設計審查

### 命名規範

| 正確 | 錯誤 | 原則 |
|------|------|------|
| `GET /users` | `GET /getUsers` | 名詞，不用動詞 |
| `GET /users/{id}/orders` | `GET /getUserOrders?userId=` | 資源層次 |
| `POST /users/{id}/activate` | `PUT /activateUser` | 動作用子資源 |
| `GET /blog-posts` | `GET /blogPosts` 或 `/blog_posts` | kebab-case |

### HTTP 方法語義

| 方法 | 語義 | 冪等 | 回應 |
|------|------|------|------|
| GET | 讀取 | ✅ | 200 |
| POST | 建立 | ❌ | 201 + Location |
| PUT | 完整更新 | ✅ | 200 / 204 |
| PATCH | 部分更新 | ✅ | 200 / 204 |
| DELETE | 刪除 | ✅ | 204 |

### 版本策略

```
# 推薦：URL 路徑版本（明確、可快取）
/api/v1/users

# 次選：Header 版本（URL 乾淨，但較難測試）
Accept: application/vnd.api+json;version=1

# 避免：Query parameter（難以快取、不直觀）
/api/users?version=1
```

### 標準錯誤格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "用戶可讀的錯誤描述",
    "details": [
      {
        "field": "email",
        "message": "格式不正確"
      }
    ],
    "requestId": "req_abc123"
  }
}
```

### 分頁格式

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 243,
    "hasNext": true
  }
}
```

## Step 3 — 設計 Checklist

```
□ 資源命名用名詞複數 kebab-case
□ HTTP 方法語義正確
□ 狀態碼使用準確（不全用 200）
□ 錯誤回應格式一致，包含 code + message
□ 分頁支援（有 list 的 endpoint）
□ 版本策略確定
□ 敏感欄位不出現在 GET response（密碼、內部 ID）
□ 大量資料 endpoint 有速率限制說明
□ 冪等操作有說明（可安全 retry）
□ 時間格式統一 ISO 8601（2024-01-15T10:30:00Z）
```

## Step 4 — 產出 OpenAPI 片段

```yaml
paths:
  /api/v1/{resource}:
    get:
      summary: 列出{資源}
      tags: [{tag}]
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: perPage
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/{Resource}ListResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'
```
