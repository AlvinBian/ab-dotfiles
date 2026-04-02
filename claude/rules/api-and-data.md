---
name: api-and-data
description: >
  API、資料庫、TypeScript 規範：條件式載入，只在相關路徑出現時載入。
matchWhen:
  paths:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.sql"
    - "**/migrations/**"
    - "**/api/**"
    - "**/routes/**"
    - "**/schema*"
---

# API & Data Conventions

## API 設計

**命名**：資源複數 kebab-case `/api/v1/user-profiles`；不用動詞；子資源表達關係

| 方法 | 用途 | 回應 |
|------|------|------|
| GET | 讀取 | 200 |
| POST | 建立 | 201 + Location |
| PUT | 完整替換 | 200 / 204 |
| PATCH | 部分更新 | 200 / 204 |
| DELETE | 刪除 | 204 |

**狀態碼**：200 讀/更新；201 建立；204 無內容；400 請求錯誤；401 未認證；403 無權限；404 不存在；409 衝突；422 語義錯誤；429 速率限制；500 伺服器錯誤

**統一回傳**：
```json
{ "error": { "code": "ERROR_CODE", "message": "說明", "details": [], "requestId": "req_id" } }
```

**時間**：ISO 8601 UTC；**金額**：整數分；**版本**：URL 路徑 `/api/v1/`；**分頁**：含 page, perPage, total, hasNext

## 資料庫規範

**Schema**：表名 snake_case 複數；每表必有 `id UUID PRIMARY KEY`、`created_at TIMESTAMPTZ`、`updated_at TIMESTAMPTZ`；軟刪除用 `deleted_at`；Boolean 用 `is_` 前綴

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','paid')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**索引**：順序為等值 → 範圍 → 排序；新增前用 `EXPLAIN ANALYZE`；偏好 partial index（如 `WHERE deleted_at IS NULL`）

**Migration 安全**：新增表、新增 nullable 欄、新增索引直接執行；新增 NOT NULL 分三步（nullable → 回填 → 約束）；重命名分五步；刪除先移除代碼後才刪；修改型別用觸發器同步

**N+1 防範**：批量用 `WHERE id = ANY($1)`；關聯資料預設 eager load；開發環境啟用 query logger；超 1000 筆強制分頁

## TypeScript 規範

**嚴格模式**：`"strict": true`；禁止裸 `any`；禁止 `@ts-ignore`；禁止非 null assertion `!`

**介面設計**：
- `interface`：可擴展物件、class 契約、API response
- `type`：union / intersection / mapped type
- **Discriminated union**：明確區分變體

**泛型**：參數名要語義（`TEntity` 優於 `T`）；約束要有意義；避免過度泛化

**禁止清單**：`any` → `unknown`；`@ts-ignore` → `@ts-expect-error`；強制轉型 → 型別守衛；`Function` → 明確簽名；`Object` / `{}` → `Record<string, unknown>`；數值 enum → `const` object

**內建 Utility**：`Partial<T>`、`Required<T>`、`Pick<T, K>`、`Omit<T, K>`、`Readonly<T>`、`ReturnType<F>`、`Parameters<F>`

## 可觀測性

**結構化日誌**（JSON）：含 timestamp、level、service、traceId、requestId、userId

禁止：`console.log` 在 production；日誌含密碼、token、信用卡

**RED 指標**：Rate `requests_total`；Errors `errors_total`；Duration `duration_seconds`

**分散式追蹤**：Span 名 `<verb> <resource>`；跨服務傳 `X-Trace-Id` header；Production 預設 10%，Error 100% 採樣

**告警設計**：基於 SLO（error rate > 1%）；每條告警附 runbook；5 分鐘內相同根因只觸發一次；分級 P1 / P2 / P3
