---
name: slack-formatting
description: >
  Slack mrkdwn 格式指南與即時格式化。
  Use when: "Slack format", "mrkdwn", "Slack 格式", "format Slack message",
  "draft Slack message", "send Slack message".
metadata:
  version: 1.0.0
matchWhen:
  targets: ["slack"]
---

# Slack mrkdwn 格式指南

## 支援語法

| 效果 | 語法 | 注意 |
|------|------|------|
| 粗體 | `*文字*` | 非 `**文字**` |
| 斜體 | `_文字_` | 底線包圍 |
| 刪除線 | `~文字~` | 單個波浪號 |
| 行內程式碼 | `` `文字` `` | 內部 mrkdwn 失效 |

> ⚠️ 格式符號前後不可有空白：`* 文字 *` 不會生效

## 連結

| 用法 | 語法 |
|------|------|
| 帶顯示文字 | `<https://url\|顯示文字>` |
| 只顯示 URL | `<https://url>` |

## 提及

| 目標 | 語法 |
|------|------|
| 特定用戶 | `<@USERID>` |
| 頻道在線 | `<!here>` |
| 頻道全員 | `<!channel>` |

## 不支援語法

| 不支援 | 應改用 |
|--------|--------|
| `---` 分隔線 | 空行或 `────────` |
| `## 標題` | `*粗體*` 單獨一行 |
| `**粗體**` | `*粗體*` |
| `[文字](url)` | `<url\|文字>` |
| 表格 | 對齊純文字或 Canvas |

## 常用模板

**公告** — `:loudspeaker: *【標題】*\n\n說明\n\n*時間：* ...\n*負責人：* <@USERID>`

**進度** — `*📦 本週更新*\n\n• ✅ 已完成\n• 🔄 進行中\n• ⏳ 待處理`

**告警** — `:rotating_light: *[P1] 問題*\n\n*影響：* ...\n*狀態：* 調查中`

## 發送前 Checklist

- [ ] 粗體 `*文字*`，連結 `<url|文字>`
- [ ] 無 `---`、無 `## 標題`
- [ ] 提及用 `<@USERID>`
- [ ] 段落之間有空行
