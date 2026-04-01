---
name: verify
description: >
  快速驗證當前代碼狀態，確認修改沒有破壞現有功能。
  Use when: "驗證", "verify", "確認沒問題", "改完確認", "check".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Verify

修改後快速確認沒有 regression。支援四種模式：

| 模式 | 說明 | 指令 |
|------|------|------|
| `quick` | Build + Types，30 秒內完成 | `/verify quick` |
| `full` | Build + Types + Lint + Tests | `/verify full` |
| `pre-commit` | Types + Lint（跑 staged 範圍）| `/verify pre-commit` |
| `pre-pr` | 同 full + git diff summary | `/verify pre-pr` |

預設模式為 `full`。`$ARGUMENTS` 傳入模式名。

## 執行步驟

**Build check**

```bash
pnpm build --if-present 2>&1 | tail -5
```

**Type check**

```bash
pnpm tsc --noEmit 2>&1 | head -15
```

**Tests**（quick 模式跳過）

```bash
pnpm test --run 2>&1 | tail -10
```

**Git status**（pre-pr 模式額外執行）

```bash
git diff main...HEAD --stat
```

## 輸出格式

```
VERIFICATION: <mode>
──────────────────────────────
Build   [PASS ✅ | FAIL ❌]
Types   [PASS ✅ | FAIL ❌]
Lint    [PASS ✅ | FAIL ❌ | SKIP —]
Tests   [PASS ✅ | FAIL ❌ | SKIP —]
──────────────────────────────
VERIFICATION: PASS ✅ | FAIL ❌

失敗原因：
- <具體錯誤，附行號>
```

失敗時給出修復建議（不自動修復，除非用戶明確要求）。
