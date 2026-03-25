---
name: slack-formatting
description: >
  This skill should be used when the user asks to "draft a Slack message",
  "send a Slack message", "format a Slack message", "write a Slack announcement",
  or any time a Slack message needs to be composed or reviewed for formatting.
  Also triggers on "mrkdwn", "Slack format", or "check my Slack message".
metadata:
  version: "0.3.0"
---

# Slack 訊息格式指南（mrkdwn）

## 支援的語法

| 效果 | 語法 | 注意 |
|------|------|------|
| 粗體 | `*文字*` | 不是 `**文字**` |
| 斜體 | `_文字_` | 底線包圍 |
| 刪除線 | `~文字~` | 單個波浪號 |
| 行內程式碼 | `` `文字` `` | 內部 mrkdwn 失效 |

> ⚠️ 格式符號前後不可有空白：`* 文字 *` 不會生效

### 連結

- 帶顯示文字：`<https://url|顯示文字>`
- 只顯示 URL：`<https://url>`

### 提及

| 目標 | 語法 |
|------|------|
| 特定用戶 | `<@USERID>` |
| 頻道在線成員 | `<!here>` |
| 頻道所有成員 | `<!channel>` |

## Slack 不支援的語法

| 不支援 | 應改用 |
|--------|--------|
| `---` 分隔線 | 空行，或 `────────` |
| `## 標題` | `*粗體文字*` 單獨一行 |
| `**粗體**` | `*粗體*` |
| `[文字](url)` | `<url\|文字>` |
| 表格 | 改用對齊純文字或 Canvas |

## 常用模板

**公告：** `:loudspeaker: *【標題】*\n\n說明\n\n*時間：* ...\n*負責人：* <@USERID>`

**進度更新：** `*📦 本週更新*\n\n• ✅ 已完成：...\n• 🔄 進行中：...\n• ⏳ 待處理：...`

**緊急告警：** `:rotating_light: *[P1] 問題描述*\n\n*影響範圍：* ...\n*狀態：* 調查中`

## 發送前檢查

- [ ] 粗體用 `*文字*`，連結用 `<url|文字>`
- [ ] 無 `---`、無 `## 標題`
- [ ] 提及用 `<@USERID>`，不是 `@名字`
- [ ] 段落之間有空行，程式碼用反引號
