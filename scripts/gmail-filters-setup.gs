/**
 * Gmail 5-Tier Filter Setup（通用化版本）
 *
 * Tier 0  github/noise   → 歸檔靜音（PR、CI、bot）
 * Tier 1  auto/skip      → 歸檔靜音（SaaS bot、促銷）
 * Tier 2  auto/info      → 留在收件匣但不標重要（公司公告、CC）
 * Tier 3  auto/meeting   → 留在收件匣（行事曆邀請）
 * Tier 4  action_required → 標 IMPORTANT + STARRED（HR、主管、財務審核）
 *
 * 使用方式：
 *   1. 在 Apps Script 編輯器執行 setupAllFilters
 *   2. 自訂 Tier 2 / Tier 4 — 在下方標有「自訂」區段加入你的公司網域和寄件人
 */

// ─────────────────────────────────────────
// 入口：執行這個函式
// ─────────────────────────────────────────
function setupAllFilters() {
  var labelIds = createLabelsIfNeeded();

  const rules = [

    // ══════════════════════════════════════
    // TIER 0 — GitHub noise（最優先）
    // ══════════════════════════════════════
    {
      desc: "GitHub PR / CI / bot — all noise",
      criteria: { from: "notifications@github.com OR noreply@github.com" },
      action: {
        removeLabelIds: ["INBOX", "IMPORTANT"],
        addLabelIds: [labelIds["github/noise"]],
      }
    },
    {
      desc: "Dependabot / Renovate",
      criteria: { from: "dependabot[bot] OR renovate-bot OR renovateapp.com" },
      action: {
        removeLabelIds: ["INBOX", "IMPORTANT"],
        addLabelIds: [labelIds["github/noise"]],
      }
    },
    {
      desc: "GitLab / Bitbucket",
      criteria: { from: "gitlab.com OR bitbucket.org" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },
    {
      desc: "CI/CD services (CircleCI, Travis, Buildkite)",
      criteria: { from: "circleci.com OR travis-ci.com OR buildkite.com OR semaphoreci.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },

    // ══════════════════════════════════════
    // TIER 1 — skip（SaaS bot、促銷）
    // ══════════════════════════════════════
    {
      desc: "Jira / Confluence bot",
      criteria: { from: "jira@ OR confluence@ OR atlassian.net" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },
    {
      desc: "Slack email notifications",
      criteria: { from: "slack.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },
    {
      desc: "Notion / Linear / Figma / Sentry bot",
      criteria: { from: "notion.so OR linear.app OR figma.com OR sentry.io" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },
    {
      desc: "Datadog / PagerDuty / OpsGenie alerts",
      criteria: { from: "datadoghq.com OR pagerduty.com OR opsgenie.com" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },
    {
      desc: "npm / package registry notifications",
      criteria: { from: "npmjs.com OR pypi.org" },
      action: { removeLabelIds: ["INBOX", "IMPORTANT"], markRead: true }
    },

    // ══════════════════════════════════════
    // TIER 2 — info_only（公司公告、全員信）
    // 留收件匣，但移除 IMPORTANT
    //
    // 自訂：加入你的公司 noreply / it 信箱，例如：
    //   { desc: "IT system notice",
    //     criteria: { from: "it@yourcompany.com OR noreply@yourcompany.com" },
    //     action: { removeLabelIds: ["IMPORTANT"], addLabelIds: [] } },
    // ══════════════════════════════════════
    {
      desc: "Company-wide announcement subjects (通用關鍵字)",
      criteria: { subject: "[全員公告] OR [All Staff] OR [公司公告] OR [Company Notice] OR [Company Update]" },
      action: { removeLabelIds: ["IMPORTANT"], addLabelIds: [] }
    },
    {
      desc: "Receipt / invoice / billing",
      criteria: { subject: "receipt OR invoice OR billing OR 收據 OR 發票 OR 帳單" },
      action: { removeLabelIds: ["IMPORTANT"], addLabelIds: [] }
    },

    // ══════════════════════════════════════
    // TIER 4 — action_required（最後設定，覆蓋前面規則）
    // 加 IMPORTANT + STARRED
    //
    // 自訂：加入你的 HR / 主管 / 財務信箱，例如：
    //   { desc: "HR team",
    //     criteria: { from: "hr@yourcompany.com OR people@yourcompany.com" },
    //     action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] } },
    // ══════════════════════════════════════
    {
      desc: "HR subject keywords",
      criteria: {
        subject: "薪資 OR 考績 OR 績效 OR 調薪 OR offer OR 合約 OR 請假 OR 假單 OR onboarding OR offboarding OR 離職 OR performance review OR salary"
      },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] }
    },
    {
      desc: "Finance / expense approval",
      criteria: { subject: "報帳 OR 費用申請 OR 核銷 OR expense OR reimbursement OR 審核通過 OR 請款" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] }
    },
    {
      desc: "Legal / compliance",
      criteria: { subject: "合約 OR contract OR NDA OR legal OR 法務 OR 合規 OR compliance" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] }
    },
    {
      desc: "Urgent escalation keywords",
      criteria: { subject: "URGENT OR 緊急 OR ACTION REQUIRED OR 請盡快 OR 立即處理" },
      action: { addLabelIds: ["IMPORTANT", "STARRED"], removeLabelIds: [] }
    },
  ];

  let created = 0;
  let failed  = 0;

  rules.forEach(rule => {
    try {
      const res = Gmail.Users.Settings.Filters.create(
        buildFilter(rule.criteria, rule.action),
        "me"
      );
      Logger.log("OK " + rule.desc + " → " + res.id);
      created++;
    } catch (e) {
      Logger.log("FAIL " + rule.desc + " → " + e.message);
      failed++;
    }
  });

  Logger.log("\n=== Done: " + created + " created, " + failed + " failed ===");
  Logger.log("Refresh Gmail Settings > Filters to verify.");
}

// ─────────────────────────────────────────
// 建立所需 labels（冪等，已存在就跳過）
// ─────────────────────────────────────────
function createLabelsIfNeeded() {
  const wanted = [
    { name: "github/noise",  color: { backgroundColor: "#cccccc", textColor: "#434343" } },
    { name: "auto/skip",     color: { backgroundColor: "#efefef", textColor: "#434343" } },
    { name: "auto/info",     color: { backgroundColor: "#c9daf8", textColor: "#1c4587" } },
    { name: "auto/meeting",  color: { backgroundColor: "#d9ead3", textColor: "#274e13" } },
  ];

  const existing = Gmail.Users.Labels.list("me").labels || [];
  const existingMap = {};
  existing.forEach(l => { existingMap[l.name] = l.id; });

  var labelIds = {};
  wanted.forEach(w => {
    if (existingMap[w.name]) {
      labelIds[w.name] = existingMap[w.name];
      Logger.log("exists: " + w.name + " → " + existingMap[w.name]);
    } else {
      var created = Gmail.Users.Labels.create({
        name: w.name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
        color: w.color,
      }, "me");
      labelIds[w.name] = created.id;
      Logger.log("created: " + w.name + " → " + created.id);
    }
  });
  return labelIds;
}

// ─────────────────────────────────────────
// Helper
// ─────────────────────────────────────────
function buildFilter(criteria, action) {
  const f = { criteria: {}, action: {} };
  if (criteria.from)    f.criteria.from    = criteria.from;
  if (criteria.to)      f.criteria.to      = criteria.to;
  if (criteria.subject) f.criteria.subject = criteria.subject;
  if (criteria.query)   f.criteria.query   = criteria.query;
  f.action.addLabelIds    = (action.addLabelIds || []).filter(Boolean);
  f.action.removeLabelIds = action.removeLabelIds || [];
  return f;
}

// ─────────────────────────────────────────
// Debug：列出所有現有 filter
// ─────────────────────────────────────────
function listFilters() {
  const list = Gmail.Users.Settings.Filters.list("me").filter || [];
  list.forEach(f => Logger.log(JSON.stringify(f, null, 2)));
  Logger.log("Total: " + list.length);
}

// ─────────────────────────────────────────
// 清除所有 filter（重來用）
// ─────────────────────────────────────────
function deleteAllFilters() {
  const list = Gmail.Users.Settings.Filters.list("me").filter || [];
  list.forEach(f => {
    Gmail.Users.Settings.Filters.remove("me", f.id);
    Logger.log("deleted: " + f.id);
  });
}
