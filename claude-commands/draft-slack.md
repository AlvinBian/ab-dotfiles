---
name: draft-slack
description: >
  Generate a formatted Slack message draft from a topic and message type.
  Triggers on "幫我寫 Slack 訊息", "draft a Slack message about", "草稿 Slack",
  "幫我寫一則 Slack", "generate Slack message", "寫 Slack 公告", "寫 Slack 告警",
  "寫 Slack 進度更新", or any request to compose a new Slack message from scratch.
metadata:
  version: "0.1.0"
---

# Draft Slack Message

## 執行流程

### Step 1：收集資訊

詢問（若未提供）：
1. 訊息主題 / 內容
2. 類型：`公告` / `進度更新` / `技術分享` / `緊急告警` / `自由格式`
3. 目標頻道或對象（選填）

### Step 2：生成草稿（格式規則 100% 遵守）

- 粗體 `*文字*`，不是 `**文字**`
- 連結 `<url|顯示文字>`，不加前綴標籤
- 禁止 `---`（改用空行）、禁止 `## 標題`（改用 `*粗體*`）
- 提及用 `<@USERID>`，無法確認時標記「需替換」
- 清單用 `•` 或 `-`，不支援巢狀

**模板：**

公告：`:loudspeaker: *【{標題}】*\n\n{內容}\n\n*時間：* {日期}\n*負責人：* <@USERID>`

進度：`*📦 {主題} 更新*\n\n• ✅ 已完成：{項目}\n• 🔄 進行中：{項目}\n• ⏳ 待處理：{項目}`

告警：`:rotating_light: *[{等級}] {問題}*\n\n*影響：* {說明}\n*狀態：* {調查中/已修復}\n\n處理人：<@USERID>`

技術分享：`:books: *【{標題}】*\n\n_{說明}_\n\n*重點*\n• {要點}\n\n<url|文件>`

### Step 3：提供選項

1. 直接使用（複製貼上）
2. 修改後再發
3. 透過 Slack MCP 發送（`slack_send_message` 或 `slack_schedule_message`）

> ⚠️ 發送時用 `channel_id`（不是 `channel`）。若 `slack_send_message` 失敗，改用 `slack_schedule_message` 設定 5 分鐘後。
