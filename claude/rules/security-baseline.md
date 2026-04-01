---
name: security-baseline
description: >
  通用安全基線規範：禁止的寫法、secrets 處理、輸入驗證、依賴安全。
matchWhen:
  always: true
---

# Security Baseline

所有專案的最低安全要求，與語言 / 框架無關。

## 絕對禁止

- **不把 secrets 寫進程式碼**：API key、密碼、token 只放環境變數或 secret manager
- **不在日誌輸出敏感資料**：密碼、信用卡號、身分證、token、完整 email
- **不用字串拼接構造 SQL / shell 命令**：必須用 prepared statement 或參數化
- **不在前端儲存敏感狀態**：localStorage / sessionStorage 不存 token（用 httpOnly cookie）
- **不直接信任用戶輸入**：所有外部輸入都要驗證型別、長度、格式

## Secrets 處理

```
✅ process.env.API_KEY
✅ os.environ['API_KEY']
✅ vault.get('api_key')

❌ const API_KEY = 'sk-abc123...'
❌ config = { password: 'mypassword' }
```

`.env` 一定要在 `.gitignore`，提供 `.env.example` 作為模板。

## 輸入驗證

- API 入口必須驗證所有欄位型別與長度
- 檔案上傳：驗證 MIME type（不只看副檔名）、限制大小、存放在 non-public 路徑
- Redirect URL：白名單驗證，禁止 open redirect
- HTML 輸出：依框架機制自動 escape（React JSX、Vue template 預設安全）

## 依賴安全

- 定期執行 `npm audit` / `pip-audit` / `bundle audit`
- CVSS ≥ 7.0 的漏洞 72 小時內處理
- 不使用已停止維護（unmaintained）的核心依賴
- 鎖定版本（lock file 提交到 repo）

## 錯誤訊息

```
✅ "無效的請求" （用戶看到）
✅ logger.error('DB query failed', { query, error }) （內部日誌）

❌ "SQL syntax error near 'WHERE user_id='" （暴露內部結構）
❌ stack trace 直接回傳給 API 呼叫者
```

## 認證 / 授權

- 每個 API 端點明確標記是否需要認證
- 授權檢查在 server 端，不依賴前端隱藏
- Session token 有過期時間，敏感操作要求重新驗證
- 密碼用 bcrypt / argon2 等自適應雜湊（不用 MD5 / SHA1）
