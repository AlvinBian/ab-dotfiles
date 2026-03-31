---
name: db-migration
description: >
  資料庫遷移全流程：Schema 設計 → Migration 生成 → 風險評估 → Rollback 計畫。
  Use when: "db migration", "資料庫遷移", "schema 變更", "加欄位", "改表結構", "migrate".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# DB Migration 流程

## Step 1 — 需求確認

收集以下資訊（未提供則詢問）：

- 要做什麼變更？（加欄位 / 改型別 / 建表 / 刪表 / 加索引）
- 資料表現有大小（大概幾百萬 / 幾千萬行）？
- 是否有 zero-downtime 要求？
- 使用什麼 ORM / Migration 工具？（Prisma / TypeORM / Alembic / Rails / Flyway / 手寫 SQL）

## Step 2 — 風險評估

| 操作 | 風險 | 說明 |
|------|------|------|
| ADD COLUMN（有 DEFAULT） | 🔴 高 | 大表全表鎖，建議分批或用 pt-online-schema-change |
| ADD COLUMN（無 DEFAULT, nullable） | 🟢 低 | 大多數 DB 可瞬間完成 |
| ADD INDEX | 🟡 中 | CONCURRENTLY 可避免鎖表 |
| DROP COLUMN | 🟡 中 | 確認應用已不讀取此欄位 |
| ALTER COLUMN TYPE | 🔴 高 | 幾乎必然鎖表，需要特殊處理 |
| RENAME TABLE/COLUMN | 🔴 高 | 應用層需同步修改 |
| ADD FOREIGN KEY | 🟡 中 | 需驗證資料一致性 |

**大表（> 100 萬行）高風險操作**，建議：
1. 先在 staging 測試執行時間
2. 使用 `pt-online-schema-change` 或 `gh-ost`（MySQL）
3. 或使用 PostgreSQL `ALTER TABLE ... CONCURRENTLY`

## Step 3 — 生成 Migration

根據框架產出對應格式：

### 標準 SQL
```sql
-- Migration: {描述}
-- Created: {日期}
-- Risk: 🟢/🟡/🔴

-- UP
BEGIN;

{變更 SQL}

-- 驗證
-- SELECT COUNT(*) FROM {table} WHERE {condition};

COMMIT;

-- DOWN (Rollback)
BEGIN;
{回滾 SQL}
COMMIT;
```

### Prisma
```prisma
// schema.prisma 變更
model {ModelName} {
  // 新增欄位
  {field} {type} {attributes}
}
```
```bash
npx prisma migrate dev --name {migration_name}
```

### 雙寫策略（不中斷服務的欄位重命名）

```
階段 1：新增新欄位，應用層寫入新舊兩個欄位
階段 2：回填舊資料到新欄位
階段 3：應用層改讀新欄位
階段 4：確認無流量讀舊欄位後，DROP 舊欄位
```

## Step 4 — Rollback 計畫

每個 Migration 必須包含：

```markdown
## Rollback 計畫

### 自動 Rollback（Migration 工具）
{rollback 指令}

### 手動 Rollback SQL
{還原 SQL}

### Rollback 判斷條件
- 執行超過 {X} 分鐘 → 中止
- 錯誤率超過 {X}% → 中止
- 回滾後需要 {說明後續步驟}
```

## Step 5 — 上線 Checklist

```
□ staging 環境測試通過，記錄執行時間
□ 確認 rollback 腳本可用
□ 通知相關團隊維護窗口
□ 準備監控面板（錯誤率、延遲）
□ 生產環境執行前備份或確認 PITR 可用
□ 執行期間有人監控
□ 執行後驗證資料正確性
```
