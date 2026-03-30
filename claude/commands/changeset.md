---
name: changeset
description: >
  自動分析 git diff 生成 changeset 檔案。
  Use when: "changeset", "版本", "changelog", "新增 changeset".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Auto Changeset

根據當前 git 變更自動生成 changeset 檔案。

## Step 1 — 分析變更

```bash
# 查看未提交的改動
git diff --staged --stat
git diff --stat
# 查看最近的 commit（如果沒有未提交的）
git log --oneline -5
```

## Step 2 — 判斷變更類型

| 類型 | 條件 | 版本升級 |
|------|------|---------|
| `major` | 破壞性變更（API 變更、移除功能） | 1.0.0 → 2.0.0 |
| `minor` | 新功能、新模組 | 1.0.0 → 1.1.0 |
| `patch` | Bug 修復、小改善、文件更新 | 1.0.0 → 1.0.1 |

判斷依據：
- 新增 `lib/pipeline/*.mjs` 或 `claude/agents/*.md` → `minor`
- 修改 prompt / UI 邏輯 / 修 bug → `patch`
- 修改 `package.json` exports 或移除功能 → `major`

## Step 3 — 生成 changeset 檔案

```bash
# 生成隨機 ID
ID=$(node -e "console.log(Math.random().toString(36).slice(2,10))")
```

寫入 `.changeset/{ID}.md`：

```markdown
---
"ab-dotfiles": {type}
---

{一句話摘要}

{詳細描述（bullet list）}
```

範例：
```markdown
---
"ab-dotfiles": minor
---

新增 ECC 繁體中文翻譯 + AI 推薦優化

- 97 個 ECC 項目完整繁體中文翻譯（ecc/translations.json）
- AI 推薦 prompt 放寬至 10-20 個
- ECC 選擇 UI 優先顯示中文描述
```

## Step 4 — 確認

顯示生成的 changeset 內容，詢問用戶確認後寫入檔案。

提示後續操作：
- `pnpm run version` — 更新版本號 + 生成 CHANGELOG.md
- `pnpm run release` — version + tag + push
