---
description: 維運手冊生成：部署步驟、回滾程序、監控指標、常見問題處理。
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Runbook — 維運手冊

## 何時需要 Runbook

| 情境 | 要不要寫 Runbook |
|------|----------------|
| 首次上線的新服務 | ✅ |
| 有複雜部署步驟的更新 | ✅ |
| 需要回滾能力的高風險變更 | ✅ |
| on-call 人員需要操作指引 | ✅ |
| 簡單的 config 更新 | ❌ |
| 全自動 CI/CD 無需人工介入 | ❌ |

---

## Runbook 標準結構

```markdown
# Runbook：{服務/功能名稱}

**版本**：{v1.0.0}
**最後更新**：{YYYY-MM-DD}
**負責人**：{名字/team}
**On-call 聯絡**：{Slack channel / PagerDuty}

---

## 1. 服務概述

| 項目 | 說明 |
|------|------|
| 服務名稱 | {名稱} |
| 用途 | {一句話說明用途} |
| 部署環境 | {staging / production} |
| 主要技術 | {Node.js / Python / Go / ...} |
| 依賴服務 | {DB / Cache / Queue / 外部 API} |
| SLA | {可用率目標，如 99.9%} |

**架構圖**（如有）：
```
{簡單文字圖或連結到 Figma/Confluence}
```

---

## 2. 部署步驟

### 前置條件

- [ ] {前置條件 1，如 DB migration 已執行}
- [ ] {前置條件 2，如 Feature flag 已關閉}
- [ ] {環境變數已設定}

### 部署流程

```bash
# Step 1：拉取最新代碼
git pull origin main

# Step 2：安裝依賴
pnpm install --frozen-lockfile

# Step 3：執行 DB migration（若有）
pnpm run migrate

# Step 4：部署
{具體部署指令，如：
  kubectl apply -f k8s/deployment.yaml
  或 pm2 reload ecosystem.config.js
  或 fly deploy
}

# Step 5：確認部署成功
curl -s https://{服務 URL}/health | jq .status
```

### 部署後驗證

```bash
# 確認服務健康
curl -I https://{服務 URL}/health

# 確認日誌無異常（最近 5 分鐘）
{kubectl logs / pm2 logs / heroku logs} --tail 100

# 確認關鍵指標正常
# {監控 Dashboard 連結}
```

---

## 3. 回滾程序

### 觸發條件

任一情況立即回滾，無需等待：
- 部署後 5 分鐘內錯誤率 > {閾值，如 1%}
- 核心功能無法正常使用
- DB migration 執行失敗

### 回滾步驟

```bash
# 方案 A：回滾到上一個版本（推薦）
{kubectl rollout undo deployment/{name}
 或 git revert HEAD && git push && {重新部署}}

# 方案 B：指定回滾到特定版本
{kubectl rollout undo deployment/{name} --to-revision={n}
 或 git checkout {commit-sha} && git push --force-with-lease origin {branch}}

# 方案 C：DB migration rollback（若有）
pnpm run migrate:down
# ⚠️ 確認是否有資料遺失風險
```

### 回滾後確認

```bash
# 確認服務已恢復
curl -s https://{服務 URL}/health

# 通知 Slack
# 在 #{incident-channel} 說明：已回滾，原因，預計修復時間
```

---

## 4. 監控指標

### 核心健康指標

| 指標 | 正常值 | 警告 | 嚴重 |
|------|--------|------|------|
| 錯誤率 | < 0.1% | > 1% | > 5% |
| P99 延遲 | < 500ms | > 1s | > 3s |
| CPU | < 60% | > 80% | > 95% |
| Memory | < 70% | > 85% | > 95% |
| DB 連線數 | < 80% pool | > 90% | 耗盡 |

### 監控工具與 Dashboard

| 工具 | 用途 | 連結 |
|------|------|------|
| {Datadog/Grafana} | APM + 指標 | {URL} |
| {Sentry} | 錯誤追蹤 | {URL} |
| {PagerDuty} | 告警 | {URL} |

### 關鍵日誌查詢

```bash
# 最近錯誤日誌
{指令}

# 慢查詢日誌
{指令}

# 特定用戶 / 請求追蹤
{指令 --filter "userId=xxx"}
```

---

## 5. 常見問題處理（FAQ）

### Q1：{常見問題 1，如「DB 連線耗盡」}

**症狀**：{怎麼確認這個問題}

```bash
# 診斷指令
{指令}
```

**解法**：
1. {步驟 1}
2. {步驟 2}

**預防**：{長期改進措施}

---

### Q2：{常見問題 2，如「記憶體洩漏」}

**症狀**：{怎麼確認}

```bash
# 診斷
{指令}
```

**緊急處理**：{重啟服務 / 擴容}

**根本修復**：{對應的 Ticket / PR}

---

### Q3：{常見問題 3}

{同上格式}

---

## 6. 聯絡與升級（Escalation）

| 級別 | 何時升級 | 聯絡誰 | 方式 |
|------|---------|--------|------|
| L1（on-call）| 問題發生時 | {名字} | Slack / PagerDuty |
| L2（Tech Lead）| 15 分鐘未解決 | {名字} | 電話 / Slack |
| L3（架構師/管理層）| P0 或影響 SLA | {名字} | 電話 |

**Incident Channel**：#{incident-channel}

---

## 附錄

### 環境變數說明

| 變數 | 說明 | 範例 |
|------|------|------|
| {VAR_NAME} | {用途} | {example_value} |

### 相關文件

- [架構設計](../adr/{相關 ADR})
- [API 文件]({URL})
- [Deployment Config]({URL})
```

---

## 使用流程

執行此 command 時，請先詢問用戶：

1. **服務/功能名稱是什麼？**
2. **部署平台**（k8s / PM2 / Railway / Fly.io / AWS ECS / ...）
3. **有無 DB migration？**
4. **監控工具**（Datadog / Grafana / Sentry / ...）
5. **最常見的問題是什麼？**（可選，協助生成 FAQ）

然後依據回答生成完整 Runbook，並提醒填寫 `{...}` 佔位符。
