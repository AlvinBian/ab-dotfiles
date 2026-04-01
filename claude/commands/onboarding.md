---
name: onboarding
description: >
  新人 / 新 session 專案快速上手：掃描架構 → 產出理解路徑 → 生成提問清單。
  Use when: "幫我了解這個專案", "onboarding", "專案說明", "從哪開始看", "架構導覽", "新人引導".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Onboarding — 專案快速上手

## Step 1 — 自動掃描

```bash
# 專案概覽
cat README.md 2>/dev/null | head -80
cat CLAUDE.md 2>/dev/null

# 技術棧偵測
cat package.json 2>/dev/null | jq '{name, version, dependencies: (.dependencies | keys), devDependencies: (.devDependencies | keys)}'
cat go.mod 2>/dev/null | head -20
cat requirements.txt 2>/dev/null | head -20
cat composer.json 2>/dev/null | jq '.require | keys'

# 目錄結構（深度 2）
ls -la
find . -maxdepth 2 -type d | grep -v node_modules | grep -v '.git' | sort

# 最近活躍區域
git log --oneline -20
git log --oneline --since="30 days ago" --format="%f" | sed 's/-[0-9a-f]*$//' | sort | uniq -c | sort -rn | head -10

# 入口點
cat docker-compose.yml 2>/dev/null | head -40
cat Makefile 2>/dev/null | head -30
```

## Step 2 — 產出架構導覽

```markdown
## 專案概覽：{專案名}

### 一句話說明
{專案是什麼，解決什麼問題}

### 技術棧
- 語言：{語言 + 版本}
- 框架：{框架}
- 資料庫：{DB}
- 基礎設施：{部署平台}

### 目錄結構
```
{重要目錄及其用途}
```

### 核心模組
| 模組 | 位置 | 職責 |
|------|------|------|
| {模組} | {路徑} | {做什麼} |

### 資料流
{用戶請求 → 入口 → 核心邏輯 → 資料層，簡要說明}

### 快速啟動
```bash
{啟動指令}
```

### 閱讀建議路徑
1. 先看 {檔案}，理解 {概念}
2. 再看 {檔案}，理解 {概念}
3. 然後看 {檔案}，理解 {概念}
```

## Step 3 — 產出提問清單

根據掃描結果，生成需要向團隊確認的問題：

```markdown
## 待釐清問題

### 架構決策
- [ ] {問題}（影響：{說明}）

### 開發流程
- [ ] 分支策略是什麼？PR review 流程？
- [ ] 如何跑測試？有哪些環境？
- [ ] feature flag / 環境變數在哪裡管理？

### 業務邏輯
- [ ] {看到但不確定的業務邏輯}

### 已知技術債
- [ ] {掃描到的 TODO / FIXME / HACK}
```

## Step 4 — 後續

詢問用戶：
1. 是否要深入某個模組？
2. 是否有特定任務需要立即開始？
3. 是否要生成 CLAUDE.md（如果不存在）？
