---
name: security
description: >
  安全基線規範：輸入驗證、secrets 處理、錯誤訊息、依賴安全。
matchWhen:
  always: true
---

# Security

## 絕對禁止

- **不寫 secrets 進程式碼**：環境變數或 secret manager；`.env` 在 `.gitignore`
- **不洩露敏感資料**：日誌不記密碼、token、信用卡、身分證；HTML 自動 escape
- **不用字串拼接 SQL / shell**：Prepared statement 或參數化
- **不在前端儲存敏感狀態**：Token 用 httpOnly cookie，不用 localStorage
- **不直接信任輸入**：所有外部輸入驗證型別、長度、格式

## 輸入驗證

- API 入口驗證所有欄位
- 檔案上傳：驗證 MIME（不只副檔名）、限制大小、存非 public 路徑
- Redirect URL：白名單驗證
- HTML 輸出：框架機制自動 escape（React / Vue 預設安全）

## 錯誤訊息

✅ 用戶看到「無效的請求」；✅ 日誌記錄完整 `{ query, error }`；
❌ 暴露內部結構；❌ 回傳 stack trace

## 認證 / 授權

- 密碼用 bcrypt / argon2（不用 MD5 / SHA1）
- Session token 有過期時間
- 敏感操作要求重新驗證
- 授權檢查在 server 端

## 依賴安全

- 定期執行 `npm audit` / `pip-audit` / `bundle audit`
- CVSS ≥ 7.0 的漏洞 72 小時內處理
- 不使用停止維護的核心依賴
- 鎖定版本提交 lock file

## 錯誤處理

| 類型 | 處理 | 範例 |
|------|------|------|
| 業務錯誤 | 回傳 4xx | 驗證失敗、資源不存在 |
| 外部失敗 | Retry + fallback | DB 連線失敗、第三方 API |
| 邏輯錯誤 | 回傳 500 + 日誌 | 空指針、型別錯誤 |
| 基礎設施 | 告警 + 快速失敗 | 磁碟滿、OOM |

**禁止**：空 `catch {}`；吞錯誤；忽略 Promise rejection
