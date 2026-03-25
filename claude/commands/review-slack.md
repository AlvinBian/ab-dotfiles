---
name: review-slack
description: >
  Review and correct a Slack message for mrkdwn formatting compliance.
  Triggers on "幫我檢查這則 Slack 訊息", "review my Slack message", "這訊息格式對嗎",
  "Slack 訊息審查", "check Slack format", "格式有沒有問題", "幫我看這則訊息".
metadata:
  version: "0.1.0"
---

# Review Slack Message

## 執行流程

### Step 1：取得訊息

若用戶未貼上，請他提供訊息全文。

### Step 2：逐條審查

| 檢查項目 | 錯誤情況 | 正確格式 |
|----------|----------|----------|
| 粗體 | `**文字**` | `*文字*` |
| 連結 | `[文字](url)` | `<url\|文字>` |
| 分隔線 | `---` | 空行或 `────────` |
| 標題 | `## 標題` | `*標題*` 單獨一行 |
| 斜體 | `*文字*` | `_文字_` |
| 刪除線 | `~~文字~~` | `~文字~` |
| 格式空白 | `* 文字 *` | `*文字*` |

**結構品質：**
- 段落之間有空行？重點資訊有加粗？
- 提及用 `<@USERID>` 而非 `@名字`？
- 超過 400 字？建議改用 Canvas

### Step 3：輸出審查結果

```
## 審查結果

### 發現問題（N 個）
1. **[問題類型]** 第 X 行
   - 原文：`有問題的內容`
   - 問題：說明原因
   - 修正：`正確內容`

### 修正版本
（完整修正後訊息，可直接複製）
```

若完全符合規格：`✅ 格式審查通過！可以直接發送。`

### Step 4：後續選項

1. 使用修正版
2. 進一步調整語氣 / 內容
3. 透過 Slack MCP 發送（`slack_send_message` 或 `slack_schedule_message`）
