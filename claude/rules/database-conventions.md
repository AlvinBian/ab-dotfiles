---
name: database-conventions
description: >
  資料庫設計規範：Schema 設計、索引策略、Migration 安全、ORM 使用。
matchWhen:
  paths:
    - "**/*.sql"
    - "**/migrations/**"
    - "**/schema*"
---

# Database Conventions

## Schema 設計

- 表名與欄位名一律 `snake_case`，表名用複數（`user_profiles`）
- 每張表必備欄位：`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`、`created_at TIMESTAMPTZ NOT NULL DEFAULT now()`、`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- 軟刪除用 `deleted_at TIMESTAMPTZ`，查詢預設加 `WHERE deleted_at IS NULL`
- 外鍵必須建索引，Boolean 欄位用 `is_` 前綴（`is_active`）

```sql
-- ✅ 標準表結構
CREATE TABLE orders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id),
  status      TEXT        NOT NULL CHECK (status IN ('pending','paid','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

## 索引策略

- 複合索引欄位順序：等值查詢欄位 → 範圍查詢欄位 → 排序欄位
- 每次新增索引前必須 `EXPLAIN ANALYZE` 驗證效益
- 避免過度索引：寫入頻繁的表每增一個索引都有代價
- Partial index 優先於全表索引（如 `WHERE deleted_at IS NULL`）

```sql
-- ✅ 複合索引正確順序
CREATE INDEX idx_orders_user_status ON orders(user_id, status)
  WHERE deleted_at IS NULL;
```

## Migration 安全（零停機 checklist）

**安全操作**（可直接執行）：新增表、新增 nullable 欄位、新增索引（CONCURRENTLY）、新增外鍵（NOT VALID 先加後 VALIDATE）

**危險操作**（需分多步）：

| 操作 | 風險 | 安全做法 |
|------|------|---------|
| 新增 NOT NULL 欄位 | 全表鎖 | 先加 nullable → 回填 → 加約束 |
| 重命名欄位 | 破壞現有查詢 | 新欄位 → 雙寫 → 切換讀取 → 刪舊欄位 |
| 刪除欄位 | 不可逆 | 先在代碼移除引用 → deploy → 再刪欄位 |
| 修改欄位型別 | 可能全表重寫 | 新欄位 + 觸發器同步 → 切換 |

每個 migration 必須有對應的 **rollback** 腳本，且在 staging 環境驗證過。

## N+1 防範與 ORM 規範

- 批量查詢用 `WHERE id = ANY($1)` 或 ORM `findMany({ where: { id: { in: ids } } })`
- 關聯資料預設 eager load，禁止在迴圈內執行查詢
- 開發環境啟用 query logger，PR review 前確認無 N+1
- 單次查詢結果超過 1000 筆必須分頁，禁止 `LIMIT` 缺失

```ts
// ❌ N+1
const orders = await db.orders.findMany()
for (const o of orders) {
  o.user = await db.users.findById(o.userId)  // N 次查詢
}

// ✅ 批量查詢
const orders = await db.orders.findMany({ include: { user: true } })
```
