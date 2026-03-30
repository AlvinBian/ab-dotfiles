/**
 * Gmail 5-Tier Filter Setup（通用化版本）
 *
 * Tier 0  github/noise   → 歸檔靜音 + 標籤（PR、CI、bot）
 * Tier 1  auto/skip      → 歸檔靜音 + 標籤（SaaS bot、促銷）
 * Tier 2  auto/info      → 留在收件匣 + 標籤，移除 IMPORTANT（公司公告、CC）
 * Tier 3  auto/meeting   → 留在收件匣 + 標籤（行事曆邀請）
 * Tier 4  action_required → 標 IMPORTANT + STARRED（HR、主管、財務審核）
 *
 * 函式：
 *   setupAllFilters()    — 建立 filter（只影響新郵件）
 *   applyToExisting()    — 對已有郵件套用分類（追溯）
 *   setupAndApply()      — 兩者都做（推薦）
 *   deleteAllFilters()   — 清除所有 filter（重來用）
 *   listFilters()        — Debug 列出現有 filter
 */

// ─────────────────────────────────────────
// 入口函式
// ─────────────────────────────────────────

/** 建立 filter + 追溯分類已有郵件（推薦） */
function setupAndApply() {
  setupAllFilters();
  applyToExisting();
}

/** 只建立 filter（只影響新郵件） */
function setupAllFilters() {
  var labelIds = createLabelsIfNeeded();
  var rules = buildRules(labelIds);

  var created = 0, failed = 0;
  rules.forEach(function(rule) {
    try {
      var res = Gmail.Users.Settings.Filters.create(buildFilter(rule.criteria, rule.action), "me");
      Logger.log("OK " + rule.desc + " → " + res.id);
      created++;
    } catch (e) {
      Logger.log("FAIL " + rule.desc + " → " + e.message);
      failed++;
    }
  });

  Logger.log("\n=== Filters: " + created + " created, " + failed + " failed ===");
}

/** 對已有郵件追溯套用分類 */
function applyToExisting() {
  var labelIds = createLabelsIfNeeded();
  var rules = buildRules(labelIds);
  var totalProcessed = 0;

  Logger.log("=== 開始追溯分類已有郵件 ===");

  rules.forEach(function(rule) {
    var query = buildSearchQuery(rule.criteria);
    if (!query) return;

    var processed = 0;
    var pageToken = null;

    do {
      var params = { q: query, maxResults: 100 };
      if (pageToken) params.pageToken = pageToken;

      var response = Gmail.Users.Messages.list("me", params);
      var messages = response.messages || [];

      if (messages.length === 0) break;

      // 批量修改（每次最多 100 封）
      var ids = messages.map(function(m) { return m.id; });
      var modifyRequest = { ids: ids };

      var addLabels = (rule.action.addLabelIds || []).filter(function(id) {
        return id && id !== "IMPORTANT" && id !== "STARRED";
      });
      var removeLabels = (rule.action.removeLabelIds || []).filter(Boolean);

      if (addLabels.length > 0 || removeLabels.length > 0) {
        modifyRequest.addLabelIds = addLabels;
        modifyRequest.removeLabelIds = removeLabels;
        Gmail.Users.Messages.batchModify(modifyRequest, "me");
      }

      // STARRED 需要單獨處理（batchModify 不支援 STARRED）
      if (rule.action.addLabelIds && rule.action.addLabelIds.indexOf("STARRED") !== -1) {
        ids.forEach(function(id) {
          try { Gmail.Users.Messages.modify({ addLabelIds: ["STARRED"] }, "me", id); } catch(e) {}
        });
      }

      processed += ids.length;
      pageToken = response.nextPageToken;
    } while (pageToken);

    if (processed > 0) {
      Logger.log("  " + rule.desc + " → " + processed + " 封已分類");
      totalProcessed += processed;
    }
  });

  Logger.log("=== 追溯完成：" + totalProcessed + " 封郵件已分類 ===");
}

// ─────────────────────────────────────────
// 規則定義（共用）
// ─────────────────────────────────────────
function buildRules(labelIds) {
  return [
    // TIER 0 — GitHub noise
    { desc: "GitHub PR / CI / bot", criteria: { from: "notifications@github.com OR noreply@github.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["github/noise"]] } },
    { desc: "Dependabot / Renovate", criteria: { from: "dependabot[bot] OR renovate-bot OR renovateapp.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["github/noise"]] } },
    { desc: "GitLab / Bitbucket", criteria: { from: "gitlab.com OR bitbucket.org" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["github/noise"]] } },
    { desc: "CI/CD services", criteria: { from: "circleci.com OR travis-ci.com OR buildkite.com OR semaphoreci.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["github/noise"]] } },

    // TIER 1 — skip
    { desc: "Jira / Confluence", criteria: { from: "jira@ OR confluence@ OR atlassian.net" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["auto/skip"]] } },
    { desc: "Slack notifications", criteria: { from: "slack.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["auto/skip"]] } },
    { desc: "Notion / Linear / Figma / Sentry", criteria: { from: "notion.so OR linear.app OR figma.com OR sentry.io" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["auto/skip"]] } },
    { desc: "Datadog / PagerDuty / OpsGenie", criteria: { from: "datadoghq.com OR pagerduty.com OR opsgenie.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["auto/skip"]] } },
    { desc: "npm / package registry", criteria: { from: "npmjs.com OR pypi.org" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], addLabelIds: [labelIds["auto/skip"]] } },

    // TIER 2 — info_only
    // 自訂：加入你的公司 noreply / it 信箱
    { desc: "Company announcements", criteria: { subject: "[全員公告] OR [All Staff] OR [公司公告] OR [Company Notice] OR [Company Update]" },
      action: { removeLabelIds: ["IMPORTANT"], addLabelIds: [labelIds["auto/info"]] } },
    { desc: "Receipt / invoice", criteria: { subject: "receipt OR invoice OR billing OR 收據 OR 發票 OR 帳單" },
      action: { removeLabelIds: ["IMPORTANT"], addLabelIds: [labelIds["auto/info"]] } },

    // TIER 3 — meeting
    { desc: "Calendar invites", criteria: { query: "filename:invite.ics OR filename:*.ics" },
      action: { addLabelIds: [labelIds["auto/meeting"]], removeLabelIds: [] } },

    // TIER 4 — action_required
    // 自訂：加入你的 HR / 主管 / 財務信箱
    { desc: "HR keywords", criteria: { subject: "薪資 OR 考績 OR 績效 OR 調薪 OR offer OR 合約 OR 請假 OR 假單 OR onboarding OR offboarding OR 離職 OR performance review OR salary" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] } },
    { desc: "Finance / expense", criteria: { subject: "報帳 OR 費用申請 OR 核銷 OR expense OR reimbursement OR 審核通過 OR 請款" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] } },
    { desc: "Legal / compliance", criteria: { subject: "合約 OR contract OR NDA OR legal OR 法務 OR 合規 OR compliance" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] } },
    { desc: "Urgent escalation", criteria: { subject: "URGENT OR 緊急 OR ACTION REQUIRED OR 請盡快 OR 立即處理" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] } },
  ];
}

// ─────────────────────────────────────────
// Labels（冪等）
// ─────────────────────────────────────────
function createLabelsIfNeeded() {
  var wanted = [
    { name: "github/noise",  color: { backgroundColor: "#cccccc", textColor: "#434343" } },
    { name: "auto/skip",     color: { backgroundColor: "#efefef", textColor: "#434343" } },
    { name: "auto/info",     color: { backgroundColor: "#c9daf8", textColor: "#1c4587" } },
    { name: "auto/meeting",  color: { backgroundColor: "#d9ead3", textColor: "#274e13" } },
  ];

  var existing = Gmail.Users.Labels.list("me").labels || [];
  var existingMap = {};
  existing.forEach(function(l) { existingMap[l.name] = l.id; });

  var labelIds = {};
  wanted.forEach(function(w) {
    if (existingMap[w.name]) {
      labelIds[w.name] = existingMap[w.name];
      Logger.log("exists: " + w.name + " → " + existingMap[w.name]);
    } else {
      var created = Gmail.Users.Labels.create({
        name: w.name, labelListVisibility: "labelShow", messageListVisibility: "show", color: w.color,
      }, "me");
      labelIds[w.name] = created.id;
      Logger.log("created: " + w.name + " → " + created.id);
    }
  });
  return labelIds;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

/** 建構 Gmail Filter API 物件 */
function buildFilter(criteria, action) {
  var f = { criteria: {}, action: {} };
  if (criteria.from)    f.criteria.from    = criteria.from;
  if (criteria.to)      f.criteria.to      = criteria.to;
  if (criteria.subject) f.criteria.subject = criteria.subject;
  if (criteria.query)   f.criteria.query   = criteria.query;
  f.action.addLabelIds    = (action.addLabelIds || []).filter(Boolean);
  f.action.removeLabelIds = action.removeLabelIds || [];
  return f;
}

/** 將 rule criteria 轉為 Gmail 搜尋語法 */
function buildSearchQuery(criteria) {
  var parts = [];
  if (criteria.from) {
    // "a@x.com OR b@y.com" → "from:(a@x.com OR b@y.com)"
    parts.push("from:(" + criteria.from + ")");
  }
  if (criteria.to) {
    parts.push("to:(" + criteria.to + ")");
  }
  if (criteria.subject) {
    // "word1 OR word2" → "subject:(word1 OR word2)"
    parts.push("subject:(" + criteria.subject + ")");
  }
  if (criteria.query) {
    parts.push(criteria.query);
  }
  return parts.join(" ");
}

// ─────────────────────────────────────────
// Debug / 管理
// ─────────────────────────────────────────

/** 列出所有現有 filter */
function listFilters() {
  var list = Gmail.Users.Settings.Filters.list("me").filter || [];
  list.forEach(function(f) { Logger.log(JSON.stringify(f, null, 2)); });
  Logger.log("Total: " + list.length);
}

/** 清除所有 filter（重來用） */
function deleteAllFilters() {
  var list = Gmail.Users.Settings.Filters.list("me").filter || [];
  list.forEach(function(f) {
    Gmail.Users.Settings.Filters.remove("me", f.id);
    Logger.log("deleted: " + f.id);
  });
  Logger.log("Deleted: " + list.length + " filters");
}
