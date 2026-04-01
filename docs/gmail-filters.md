# Gmail 5-Tier 分級過濾指南

## 什麼是 Gmail 5-Tier 分級？

5-Tier 分級是一套 Gmail 郵件自動分類系統，讓收件匣維持清晰可讀。核心概念：

- **所有郵件留在收件匣**（不歸檔），避免遺漏
- 用 **Gmail Label** 區分優先度，而不是搬移郵件
- 重要郵件（Tier 4）自動標星 + 標記重要，讓你第一眼抓到

匯入 `scripts/gmail-filters/gmail-filters.xml` 後，Gmail 會自動建立 5 組篩選規則，對應以下 Tier：

---

## 5 個 Tier 說明

| Tier | Label | 匹配對象 | 動作 |
|------|-------|----------|------|
| **0** | `github/noise` | GitHub 通知、Dependabot、GitLab、Bitbucket、CircleCI、Travis CI、Buildkite | 加標籤、移除重要標記 |
| **1** | `auto/skip` | Jira、Confluence、Atlassian、Slack、Notion、Linear、Sentry、Datadog、PagerDuty、npm | 加標籤、移除重要標記 |
| **2** | `auto/info` | 主旨含「全員公告」「All Staff」「receipt」「invoice」 | 加標籤 |
| **3** | `auto/meeting` | 含 `.ics` 附件的行事曆邀請 | 加標籤 |
| **4** | `action/required` | 主旨含「薪資」「考績」「offer」「salary」「expense」 | 加標籤、**標星**、**標記重要** |

> 所有 Tier 均設定 `shouldNeverSpam=true`（防止誤判為垃圾郵件）與 `shouldArchive=false`（留在收件匣）。

---

## 匯入步驟

### 1. 開啟 Gmail 設定

前往 [Gmail](https://mail.google.com) → 右上角齒輪圖示 ⚙️ → **查看所有設定**

### 2. 進入篩選器頁面

點選上方頁籤「**篩選器和封鎖的地址**」

### 3. 匯入篩選器

捲動到頁面底部，點選「**匯入篩選器**」連結。

### 4. 選擇 XML 檔案

點「選擇檔案」，選取本專案的：

```
scripts/gmail-filters/gmail-filters.xml
```

然後點「**開啟檔案**」。

### 5. 套用到現有郵件（建議勾選）

預覽畫面出現後，勾選「**套用篩選器至符合的對話**」，讓已有郵件也能被分類。

### 6. 建立篩選器

點「**建立篩選器**」完成匯入。Gmail 會顯示建立了幾條篩選規則（共 6 條）。

---

## 建立 Gmail Label

Gmail 篩選器匯入後，如果對應的 Label 不存在，Gmail 會自動建立以下巢狀標籤：

- `github` → `github/noise`
- `auto` → `auto/skip`、`auto/info`、`auto/meeting`
- `action` → `action/required`

若想預先手動建立，前往 Gmail 左側欄 → 底部「管理標籤」→「建立新標籤」。

---

## 自訂說明：新增公司特定規則

直接編輯 `scripts/gmail-filters/gmail-filters.xml`，在 `</feed>` 標籤前新增 `<entry>` 區塊。

### 範例：新增公司 HR 系統通知到 auto/info

```xml
<entry>
  <category term='filter'/>
  <apps:property name='from' value='hr@your-company.com OR payroll@your-company.com'/>
  <apps:property name='label' value='auto/info'/>
  <apps:property name='shouldArchive' value='false'/>
  <apps:property name='shouldNeverSpam' value='true'/>
</entry>
```

### 範例：新增 Tier 4 關鍵字（緊急事項）

```xml
<entry>
  <category term='filter'/>
  <apps:property name='subject' value='urgent OR 緊急 OR P0 OR incident'/>
  <apps:property name='label' value='action/required'/>
  <apps:property name='shouldArchive' value='false'/>
  <apps:property name='shouldNeverSpam' value='true'/>
  <apps:property name='shouldStar' value='true'/>
  <apps:property name='shouldMarkAsImportant' value='true'/>
</entry>
```

修改後，重新執行「匯入篩選器」流程（步驟 3–6），Gmail 會新增差異規則，不會影響已有的篩選器。

### 可用的 apps:property 欄位

| 屬性名稱 | 說明 | 範例值 |
|----------|------|--------|
| `from` | 寄件者（支援 OR） | `noreply@example.com OR bot@example.com` |
| `to` | 收件者 | `me@gmail.com` |
| `subject` | 主旨關鍵字（支援 OR） | `invoice OR receipt` |
| `hasAttachment` | 是否有附件 | `true` |
| `label` | 套用的 Label 名稱 | `action/required` |
| `shouldArchive` | 是否歸檔（移出收件匣） | `false` |
| `shouldNeverSpam` | 永不標記為垃圾郵件 | `true` |
| `shouldStar` | 是否標星 | `true` |
| `shouldMarkAsImportant` | 是否標記重要 | `true` |
| `shouldNeverMarkAsImportant` | 是否移除重要標記 | `true` |

---

## 還原方式：刪除所有篩選器

### 方法一：逐一刪除（小量）

Gmail → ⚙️ → 查看所有設定 → 篩選器和封鎖的地址 → 每條規則後面點「刪除」

### 方法二：全選刪除（推薦）

1. Gmail → ⚙️ → 查看所有設定 → 篩選器和封鎖的地址
2. 勾選最上方的核取方塊（全選所有篩選器）
3. 點「刪除」，確認刪除

> 注意：刪除篩選器不會影響已有 Label 或已被分類的郵件，Label 本身需另行手動刪除。

### 刪除 Label

Gmail 左側欄 → 找到要刪除的 Label（如 `action`）→ 右鍵 → 「移除標籤」

巢狀 Label 需先刪除子標籤（如 `action/required`），再刪除父標籤（`action`）。
