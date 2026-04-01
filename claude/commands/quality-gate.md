---
name: quality-gate
description: >
  上線前品質閘門，自動執行 build + types + lint + tests + security 全套檢查。
  Use when: "merge 前", "上線前", "quality check", "品質檢查", "pre-release".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Quality Gate

上線前五道關卡全自動執行，任一 FAIL 即阻塞發版。

## Gate 1 — Build

```bash
pnpm build 2>&1 | tail -5
```

確認無編譯錯誤、無 missing module。

## Gate 2 — Types

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

零 type error 才算 PASS，`@ts-ignore` 計為警告不阻塞。

## Gate 3 — Lint

```bash
pnpm lint 2>&1 | tail -10
```

Error 阻塞，Warning 記錄但不阻塞。

## Gate 4 — Tests

```bash
pnpm test --run 2>&1 | tail -15
```

覆蓋率 < 80% 視為 FAIL，snapshot 過期視為 FAIL。

## Gate 5 — Security

```bash
pnpm audit --audit-level=high 2>&1 | tail -10
```

CVSS ≥ 7.0（high/critical）阻塞，moderate 記錄警告。

## 輸出格式

```
QUALITY GATE REPORT
────────────────────────────────────────
Gate 1 Build    [PASS ✅ | FAIL ❌]
Gate 2 Types    [PASS ✅ | FAIL ❌]
Gate 3 Lint     [PASS ✅ | FAIL ❌]
Gate 4 Tests    [PASS ✅ | FAIL ❌]  coverage: XX%
Gate 5 Security [PASS ✅ | FAIL ❌]
────────────────────────────────────────
GATE: PASS ✅ | FAIL ❌

阻塞項目：
- [Gate N] <具體錯誤描述>
```

所有 5 道 PASS 才輸出 `GATE: PASS ✅`，否則列出全部阻塞項目後輸出 `GATE: FAIL ❌`。
