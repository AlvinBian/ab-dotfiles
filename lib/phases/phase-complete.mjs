/**
 * Phase: 完成 — 報告 + 引導 + 耗時 + session
 *
 * 安裝完成後的收尾階段，依序執行：
 *   1. 計算耗時並顯示安裝摘要
 *   2. 輸出快速上手引導訊息
 *   3. 建立第三方 ECC 描述快取
 *   4. 生成 HTML 安裝報告並詢問是否開啟瀏覽器
 *   5. 清除 session 進度並儲存最終 session
 */

import * as p from '@clack/prompts'
import fs from 'fs'
import path from 'path'
import { generateReport, saveReport, openInBrowser } from '../report.mjs'
import { BACKUP_MAX_COUNT } from '../core/constants.mjs'
import { BACKUP_DIR } from '../core/backup.mjs'
import { saveSession, clearSessionProgress } from '../core/session.mjs'
import { buildDescriptionCache } from '../config/descriptions.mjs'

/**
 * 執行安裝完成後的收尾工作
 *
 * @param {Object} plan - generateInstallPlan 產出的安裝計畫
 * @param {Object} opts
 * @param {string} opts.repoDir - ab-dotfiles 根目錄（用於報告相對路徑）
 * @param {Object} opts.installSelections - phaseExecute 回傳的安裝選項（commands/agents/rules/hooks/modules）
 * @param {Object|null} opts.syncResult - ECC 同步結果（buildSyncResult 產出）
 * @param {number} opts.startTime - 安裝開始時間戳（Date.now()）
 * @param {Object|null} opts.pipelineResult - runAnalysisPipeline 產出（用於報告中的技術棧與 reasoning）
 * @param {Array} opts.projectFolders - 專案文件夾映射（儲存到 session）
 * @returns {Promise<void>}
 */
export async function phaseComplete(plan, {
  repoDir, installSelections, syncResult, startTime, pipelineResult, projectFolders,
}) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const isManual = plan.mode === 'manual'
  const HOME = process.env.HOME
  const claudeDir = path.join(HOME, '.claude')
  const readDir = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : []

  // 從實際安裝目錄讀取已安裝項目
  const installed = {
    commands: installSelections.commands?.length ? installSelections.commands : readDir(path.join(claudeDir, 'commands')),
    agents: installSelections.agents?.length ? installSelections.agents : readDir(path.join(claudeDir, 'agents')),
    rules: installSelections.rules?.length ? installSelections.rules : readDir(path.join(claudeDir, 'rules')),
    hooks: installSelections.hooks?.length > 0 || fs.existsSync(path.join(claudeDir, 'hooks.json')),
    modules: installSelections.modules || [],
  }

  // 安裝摘要 — 詳細列出所有已安裝項目
  const instLines = []
  if (installed.commands.length) instLines.push(`  Commands（${installed.commands.length}）：${installed.commands.join('、')}`)
  if (installed.agents.length) instLines.push(`  Agents（${installed.agents.length}）：${installed.agents.join('、')}`)
  if (installed.rules.length) instLines.push(`  Rules（${installed.rules.length}）：${installed.rules.join('、')}`)
  if (installed.hooks) instLines.push('  Hooks：已啟用')
  if (installed.modules?.length) instLines.push(`  ZSH 模組（${installed.modules.length}）：${installed.modules.join('、')}`)
  if (plan.techStacks?.length) instLines.push(`  Stacks（${plan.techStacks.length}）：${plan.techStacks.join('、')}`)
  const claudeMdCount = plan.projects?.filter(proj => proj.localPath).length || 0
  if (claudeMdCount) instLines.push(`  CLAUDE.md（${claudeMdCount}）→ ~/.claude/projects/`)

  const summaryLines = [
    `耗時 ${elapsed}s · AI ~$${plan.aiCost?.total?.toFixed(2) ?? '?'}`,
    '',
    '已安裝：',
    ...instLines,
    '',
    '產出目錄  dist/',
    '  preview/   預覽檔案',
    '  release/   .plugin 檔案',
    ...(fs.existsSync(BACKUP_DIR) ? [`  backup/    備份（保留 ${BACKUP_MAX_COUNT} 次）`] : []),
    ...(isManual ? ['', '手動部署：', '  cp -r dist/preview/claude/* ~/.claude/', '  cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/'] : []),
    ...(fs.existsSync(BACKUP_DIR) ? ['', '還原：pnpm run restore'] : []),
  ]
  p.log.success(`安裝完成\n${summaryLines.join('\n')}`)

  // 安裝後引導
  p.log.info([
    '🎓 快速上手',
    '',
    '── Commands（/指令）──',
    '  開發流程：/code-review · /tdd · /build-fix · /pr-workflow · /changeset',
    '  AI 協作：  /plan · /multi-plan · /multi-execute · /multi-workflow',
    '  程式碼：  /simplify · /refactor-clean · /verify · /quality-gate',
    '  測試：    /test-gen · /test-coverage · /e2e',
    '  Slack：   /draft-slack · /review-slack · /slack-formatting',
    '  Session： /save-session · /resume-session · /sessions',
    '  工具：    /docs · /prompt-optimize · /context-budget · /aside',
    '',
    '── Agents（@代理）──',
    '  開發：  @coder · @planner · @architect · @debugger · @reviewer · @deployer',
    '  審查：  @code-reviewer · @typescript-reviewer · @security-reviewer',
    '  測試：  @tester · @tdd-guide · @e2e-runner',
    '  維運：  @chief-of-staff · @monitor · @migrator · @perf-analyzer',
    '',
    '── Rules（自動套用）──',
    '  code-style · git-workflow · testing · performance · slack-triage · project-conventions',
    '',
    '── ZSH 模組 ──',
    '  aliases · fzf · git · history · nvm · pnpm · tools',
    '',
    '── 整合設定 ──',
    '  📧 Gmail 分級過濾 → docs/gmail-filters.md',
    '  💬 Slack 通知頻道 → .env SLACK_NOTIFY_CHANNEL',
    '',
    '── 維護 ──',
    '  pnpm run status   — 配置管理中心（查看 + 互動管理）',
    '  pnpm run report   — 瀏覽器 HTML Dashboard',
    '  pnpm run doctor   — 環境診斷',
    '  pnpm run restore  — 還原上次備份',
    '',
    '  💡 進入 repo 目錄，Claude 自動載入專案配置',
  ].join('\n'))

  // 建立 ECC/第三方描述快取（下次 setup 顯示中文描述）
  const { count: descCount, newItems: descNewItems } = buildDescriptionCache(claudeDir, plan.techStacks || [])
  if (descNewItems.length > 0) {
    const names = descNewItems.map(k => k.includes('/') ? k.split('/')[1] : k)
    p.log.info(`已快取 ${descCount} 個配置描述（新增 ${descNewItems.length}）：\n${names.map(n => `  · ${n}`).join('\n')}`)
  } else if (descCount > 0) {
    p.log.info(`已快取 ${descCount} 個配置描述（無新增）`)
  }

  // 報告
  const { ghSync } = await import('../external/github.mjs')
  const reportData = {
    username: ghSync('user', '.login') || '',
    org: plan.repos[0]?.fullName?.split('/')[0] || '',
    repos: (plan.repos || []).map(r => r.fullName),
    techStacks: Object.fromEntries([...(pipelineResult?.categorizedTechs || new Map())].map(([k, v]) => [k, [...v.keys()]])),
    perRepoReasoning: pipelineResult?.perRepo instanceof Map ? Object.fromEntries([...pipelineResult.perRepo].map(([k, v]) => [k, { reasoning: v.reasoning, stacks: v.techStacks }])) : {},
    auditSummary: pipelineResult?.audit?.toSummary() || [],
    ecc: syncResult ? { sources: syncResult.results?.map(r => ({ name: r.source, repo: r.repo, version: r.version, cached: r.cached, added: r.added, skipped: r.skipped, hooks: r.hooks })) } : null,
    installed,
    stacks: plan.techStacks,
    projects: plan.projects || [],
    repoRoles: Object.fromEntries((plan.repos || []).map(r => [r.fullName, { role: r.role, localPath: r.localPath }])),
    backupDir: fs.existsSync(BACKUP_DIR) ? path.relative(repoDir, BACKUP_DIR) : null,
    mode: isManual ? 'manual' : 'auto',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
  }

  const html = generateReport(reportData)
  const reportPath = saveReport(html, path.join(repoDir, 'dist'))
  p.log.info(`報告 → ${path.relative(repoDir, reportPath)}`)
  try { await openInBrowser(reportPath) } catch { /* ignore */ }

  // Session
  clearSessionProgress()
  saveSession({
    targets: plan.targets || ['claude-dev', 'slack', 'zsh'],
    features: plan.features || ['claude', 'claudemd', 'ecc', 'slack', 'zsh'],
    mode: plan.mode,
    installMode: plan.installMode,
    org: [...new Set((plan.repos || []).map(r => r.fullName?.split('/')[0]).filter(Boolean))],
    repos: (plan.repos || []).map(r => r.fullName),
    roles: Object.fromEntries((plan.repos || []).map(r => [r.fullName, r.role])),
    localPaths: Object.fromEntries((plan.repos || []).filter(r => r.localPath).map(r => [r.fullName, r.localPath])),
    techStacks: plan.techStacks,
    projectFolders: projectFolders || [],
    eccSelections: (plan.ecc?.length ?? 0) > 0 ? { recommended: plan.ecc } : null,
    install: {
      commands: installSelections.commands || [],
      agents: installSelections.agents || [],
      rules: installSelections.rules || [],
      hooks: installSelections.hooks || [],
      modules: installSelections.modules || [],
    },
  })

}
