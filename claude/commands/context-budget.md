---
name: context-budget
description: >
  分析 context 用量，找出 token 浪費來源，給出優化建議。
  Use when: "context 快滿了", "token 用太多", "context-budget", "優化 context".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Context Budget

分析 `~/.claude/` 下所有載入的 rules / commands / agents，找出 token 熱點並給出精簡建議。

## 掃描範圍

```bash
wc -w ~/.claude/rules/*.md ~/.claude/agents/*.md \
       ~/.claude/commands/*.md 2>/dev/null | sort -rn | head -20
```

## 分析維度

1. **總量估算** — 字數 × 1.3 ≈ token 數，對照 context window 百分比
2. **Top 3 佔用源** — 列出最大的三個檔案，標明可壓縮空間
3. **重複內容偵測** — 跨檔案出現相同段落（如安全規範、命名規則）
4. **載入必要性** — `matchWhen: always: true` 的檔案是否真的需要全局載入

## 輸出格式

```
CONTEXT BUDGET REPORT
────────────────────────────────────────────
分類        檔案數    估算 tokens    佔比
rules          12        4,200       42%
commands       18        3,800       38%
agents          8        2,000       20%
────────────────────────────────────────────
總計                    10,000      100%

TOP 3 TOKEN 消費源：
1. rules/tool-selection.md    ~1,800 tokens   ← 可拆分或按需載入
2. rules/agent-orchestration.md ~900 tokens
3. commands/onboarding.md       ~700 tokens

優化建議：
- [ ] <檔案> 第 N-M 行重複於 <另一檔案>，可合併
- [ ] <檔案> matchWhen: always，但僅 N 個指令觸發，改為 paths 條件
- [ ] <檔案> 表格/範例過多，可移至外部文件按需引用

預估節省：~X,XXX tokens（節省 XX%）
```

建議精簡後的用量應 < context window 的 15%（rules + commands + agents 合計）。
