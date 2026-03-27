---
name: draft-slack
description: >
  生成格式化 Slack 訊息草稿。自動判斷場景，組裝適用的區塊。
  Use when: "幫我寫 Slack 訊息", "draft Slack message", "草稿 Slack",
  "寫 Slack 公告", "寫 Slack 告警", "寫 Slack 進度更新".
metadata:
  version: 2.0.0
---

# Draft Slack Message

## Step 1 — 判斷場景

根據用戶需求自動匹配場景，不需要問：

| 場景 | 觸發詞 | 核心結構 |
|------|--------|---------|
| 結論先行 | 回報、同步、說明 | 結論 → 背景 → 細節 |
| Q&A | 問題、回答、詢問 | 問題 → 答案 → 補充 |
| 決策通知 | 決定、方案、變更 | 決策 → 原因 → 影響 → 行動 |
| 進度更新 | 進度、狀態、weekly | 摘要 → 完成/進行/待辦 |
| 事件通報 | 故障、告警、incident | 狀態 → 影響 → 處理 → 後續 |
| 技術分享 | 分享、學到、TIL | 主題 → 重點 → 連結 |
| 請求協助 | 幫忙、請問、blocked | 問題 → 已試 → 需要 |
| 公告 | 公告、通知、提醒 | 標題 → 內容 → 時間/行動 |
| 自由格式 | 其他 | 按內容自行組裝 |

## Step 2 — 組裝訊息

### 核心原則

1. *結論先行* — 第一行就是重點，不要 context → conclusion 的順序
2. *可掃描* — 用粗體、bullet、emoji 讓人 3 秒抓到重點
3. *行動明確* — 需要對方做什麼，寫清楚
4. *長度適中* — 日常 3-8 行，重要事項不超過 400 字

### 區塊模組（按需組合，非全部使用）

*標題行*（必用）
```
{emoji} *{一句話結論或標題}*
```

*背景/原因*（選用，結論先行時放第二）
```
> {為什麼、背景脈絡}
```

*結構化內容*（選用）
```
• {要點 1}
• {要點 2}
• {要點 3}
```

*狀態標記*（進度/事件用）
```
✅ {已完成}
🔄 {進行中}
⏳ {待處理}
❌ {已取消/失敗}
```

*行動呼籲*（需要對方做事時）
```
*需要：* {具體要求} cc <@USERID>
*截止：* {日期}
```

*連結/參考*（選用）
```
<url|PR #1234> · <url|文件>
```

*嚴重度標記*（事件用）
```
🔴 P0 — 全站影響
🟡 P1 — 部分功能
🟢 P2 — 輕微
```

### 場景範例

*結論先行（最常用）*
```
*搜尋 API 延遲已從 2s 降到 200ms* :rocket:

> 原因是 Elasticsearch query 沒走 index，加了 composite aggregation 後解決。

改動：<https://github.com/org/repo/pull/456|PR #456>
已部署到 staging，明天上 prod。
```

*Q&A*
```
*Q: deploy 後 cache 要手動清嗎？*

不用。CI pipeline 最後一步會自動 purge CDN cache（約 30 秒）。

如果需要立即生效：
• Staging: `curl -X PURGE https://staging.example.com`
• Prod: 找 SRE，不要自己清
```

*決策通知*
```
*決定：會員 API 從 REST 遷移到 GraphQL* :memo:

> 舊 REST endpoint 會保留 6 個月（deprecated），新功能只在 GraphQL 上做。

*原因：*
• 前端要的欄位組合太多，REST 要開 20+ endpoint
• GraphQL 可以讓前端自己組合，後端不用改

*影響：*
• 前端：需要裝 `@apollo/client`，下週開始遷移
• 後端：本週完成 schema 設計

*需要：* 各組確認 timeline，週五前回覆 cc <!here>
```

*進度更新*
```
*📦 Sprint 14 進度*

✅ 登入流程重構（<https://jira.example.com/GT-1234|GT-1234>）
✅ 搜尋 API 效能優化
🔄 會員中心 redesign — 70%，預計週三完成
⏳ 多語系支援 — blocked on 翻譯交付

*風險：* 翻譯延遲可能影響下週 release
```

*事件通報*
```
🟡 *[P1] 付款頁面偶發 timeout*

*影響：* 約 3% 用戶結帳失敗（亞洲地區）
*開始：* 2026-03-27 14:30 UTC+8
*狀態：* 調查中

*目前發現：*
• Adyen webhook 回調延遲 > 10s
• 已聯繫 Adyen support（ticket #98765）

*處理人：* <@U12345678>
*下次更新：* 30 分鐘後或有進展時
```

*請求協助*
```
*Blocked: Nuxt 3 升級後 SSR hydration mismatch* :sos:

*問題：* `useAsyncData` 在 server 和 client 回傳不同結果，導致 hydration 失敗。

*已試：*
• 加了 `<ClientOnly>` — 解決但 SEO 沒了
• 設 `ssr: false` — 太暴力

*需要：* 有碰過 Nuxt 3 hydration 問題的同事幫看一下
`pages/product/[id].vue` 第 42 行

cc <@U12345678> <@U87654321>
```

## Step 3 — 格式檢查

自動驗證：
- [ ] 粗體用 `*文字*`（不是 `**`）
- [ ] 連結用 `<url|文字>`（不是 `[]()`）
- [ ] 沒有 `---` 分隔線
- [ ] 沒有 `## 標題`
- [ ] `*文字*` 前後無空白
- [ ] 提及用 `<@USERID>` 或 `<!here>`
- [ ] 第一行就是結論/重點

## Step 4 — 後續

1. 直接複製使用
2. 修改後再發
3. 透過 Slack MCP 發送（`slack_send_message`）

> ⚠️ 發送時用 `channel_id`（不是 `channel`）
