---
name: review-slack
description: >
  審查 Slack 訊息的 mrkdwn 格式合規性。
  Use when: "幫我檢查 Slack 訊息", "review Slack message", "格式對嗎",
  "Slack 審查", "check Slack format".
metadata:
  version: 1.0.0
matchWhen:
  targets: ["slack"]
---

# Review Slack Message

## Step 1 — 取得訊息

若用戶未貼上，請他提供訊息全文。

## Step 2 — 逐條審查

### 格式檢查

| 項目 | 錯誤 | 正確 |
|------|------|------|
| 粗體 | `**文字**` | `*文字*` |
| 連結 | `[文字](url)` | `<url\|文字>` |
| 分隔線 | `---` | 空行或 `────────` |
| 標題 | `## 標題` | `*標題*` 單獨一行 |
| 斜體 | `*文字*` | `_文字_` |
| 刪除線 | `~~文字~~` | `~文字~` |
| 符號空白 | `* 文字 *` | `*文字*` |

### 結構檢查

- [ ] 段落之間有空行
- [ ] 重點資訊有加粗
- [ ] 提及用 `<@USERID>` 非 `@名字`
- [ ] 超過 400 字？建議改用 Canvas

## Step 3 — 輸出結果

```
## 審查結果

### 發現問題（N 個）
1. **[問題類型]** 第 X 行
   原文：`有問題的內容`
   修正：`正確內容`

### 修正版本
（完整修正後訊息，可直接複製）
```

若完全合規：`✅ 格式審查通過，可直接發送。`

## Step 4 — 後續

詢問用戶：

> 1. 發送修正版到設定頻道
> 2. 指定其他頻道發送
> 3. 只複製，不發送

若選 1 或 2：讀取 `~/.claude/.env` 的 `SLACK_NOTIFY_CHANNEL` 作為預設 `channel_id`（未設定則請用戶提供）。

使用 `mcp__claude_ai_Slack__slack_send_message` 發送修正後訊息，成功後回報：`✅ 已發送`
