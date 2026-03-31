#!/usr/bin/env node
/**
 * ab-dotfiles v2.1 統一安裝 CLI
 *
 * 3 步流程：選 repos → 確認計畫 → 安裝
 */

import * as p from '@clack/prompts'
import fs from 'fs'
import { cloneDeep, countBy } from 'lodash-es'
import path from 'path'
import pc from 'picocolors'
import { BACK, handleCancel, smartSelect } from '../lib/cli/prompts.mjs'
import { phaseHeader } from '../lib/cli/task-runner.mjs'
import { detectLegacyInstallation, runUpgrade } from '../lib/config/upgrade.mjs'
import { cleanOldBackups } from '../lib/core/backup.mjs'
import { APP_VERSION } from '../lib/core/constants.mjs'
import { env } from '../lib/core/env.mjs'
import { getDirname } from '../lib/core/paths.mjs'
import { checkIncompleteSession, loadSession } from '../lib/core/session.mjs'
import { ensureEnvironment } from '../lib/detect/doctor.mjs'
import { interactiveRepoSelect } from '../lib/detect/repo-select.mjs'
import { warmupCli } from '../lib/external/claude-cli.mjs'
import { phaseAnalyze } from '../lib/phases/phase-analyze.mjs'
import { phaseComplete } from '../lib/phases/phase-complete.mjs'
import { phaseExecute } from '../lib/phases/phase-execute.mjs'
import { phasePlan } from '../lib/phases/phase-plan.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const PREVIEW_DIR = path.join(REPO, 'dist', 'preview')

function loadConfig() {
  const cfgPath = path.join(REPO, 'config.json')
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { targets: {} }
}

function loadProjectFolders(config, session) {
  // 優先用 config.json 的 projectFolders，再用 session 保存的
  return config.projectFolders || session?.projectFolders || []
}

function loadSources(configSources) {
  const eccEnv = env('ECC_SOURCES', '')
  if (!eccEnv) return configSources || []
  return eccEnv.split(',').map(entry => {
    const [name, repo, priority] = entry.trim().split('|')
    if (!name || !repo) return null
    return { name, repo, priority: parseInt(priority, 10) || 0, paths: { commands: 'commands', agents: 'agents', rules: 'rules/{lang}', rulesCommon: 'rules/common', hooks: 'hooks/hooks.json' } }
  }).filter(Boolean)
}

async function main() {
  try { cleanOldBackups() } catch { /* best-effort */ }
  const config = loadConfig()
  const targets = config.targets || {}
  const sources = loadSources(config.sources)
  const args = process.argv.slice(2)
  const flagAll = args.includes('--all')
  const flagManual = args.includes('--manual')
  const flagQuick = args.includes('--quick')
  const flagDryRun = args.includes('--dry-run')
  let prev = loadSession()
  let projectFolders = loadProjectFolders(config, prev)

  // 斷點續裝偵測
  const incomplete = checkIncompleteSession()
  if (incomplete.hasIncomplete && prev) {
    const pending = incomplete.pendingTargets?.join(', ') || ''
    p.log.warn(`上次安裝未完成（剩餘：${pending}）`)
  }

  // Splash
  console.log()
  if (prev) {
    p.intro(` ab-dotfiles v${APP_VERSION} — 上次：${prev.repos?.length ?? 0} repos · ${prev.techStacks?.length ?? 0} stacks · ${prev.timestamp?.slice(0, 10) || ''} `)
  } else {
    p.intro(` ab-dotfiles v${APP_VERSION} 安裝精靈 `)
  }

  // 舊版安裝偵測（延後到用戶選擇安裝/調整後再執行）
  async function runLegacyCheckIfNeeded() {
    const legacyInfo = detectLegacyInstallation()
    if (legacyInfo.hasLegacy) {
      const upgradeResult = await runUpgrade(legacyInfo)
      if (upgradeResult === 'cleaned') {
        prev = null
        projectFolders = []
      }
    }
  }

  // 共用：用上次 session 快速重裝（--quick 和 reinstall 共享邏輯）
  async function runQuickInstall({ prev: sessionPrev, flagManual: isManual, sources: srcs, targets: tgts, projectFolders: folders }) {
    if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

    // 首次使用：備份原始配置（~/.zshrc、~/.claude/ 等）
    const { ensureOriginalBackup } = await import('./backup-original.mjs')
    const origBackup = ensureOriginalBackup()
    if (origBackup && origBackup.length > 0) {
      p.log.success(`首次使用：已備份原始配置 → ~/.ab-dotfiles-original/\n${origBackup.map(r => `  ${r}`).join('\n')}\n還原指令：pnpm run restore-original`)
    }

    phaseHeader('環境檢查')
    await ensureEnvironment()
    warmupCli()

    // 用 session 重建 repo 物件
    if (!sessionPrev.roles) p.log.warn('上次 session 無角色資訊，全部預設為🔄臨時')
    const repoObjects = (sessionPrev.repos || []).map(r => ({
      fullName: r,
      commits: 10, // quick 模式假設都是主力
      pct: 0,
      _roleOverride: sessionPrev.roles?.[r] || 'temp',
    }))
    phaseHeader('快速分析')
    const plan = await phaseAnalyze({ repos: repoObjects, sources: srcs, baseDir: REPO, projectFolders: folders })

    // 應用 session 保存的角色
    const { getClaudeMdType } = await import('../lib/config/config-classifier.mjs')
    for (const r of plan.repos) {
      if (sessionPrev.roles?.[r.fullName]) r.role = sessionPrev.roles[r.fullName]
    }
    const rc = countBy(plan.repos, 'role')
    plan.mainCount = rc.main || 0
    plan.tempCount = rc.temp || 0
    plan.toolCount = rc.tool || 0
    plan.projects = plan.repos.filter(r => r.localPath).map(r => ({
      repo: r.fullName, role: r.role, localPath: r.localPath, claudeMdType: getClaudeMdType(r.role),
    }))

    if (isManual) plan.mode = 'manual'

    phaseHeader('安裝中')
    const { installSelections, syncResult, startTime } = await phaseExecute(plan, {
      repoDir: REPO, previewDir: PREVIEW_DIR, targets: tgts, prev: sessionPrev,
      pipelineResult: plan._pipelineResult || null, fetchedSources: plan._fetchedSources || null,
    })

    phaseHeader('完成', 3, 3)
    await phaseComplete(plan, { repoDir: REPO, installSelections, syncResult, startTime, pipelineResult: plan._pipelineResult || null, projectFolders: folders })
    p.outro('設定完成')
  }

  // --quick + --dry-run 衝突檢查
  if (flagQuick && flagDryRun) {
    p.log.warn('--quick 和 --dry-run 不能同時使用，已忽略 --dry-run')
  }

  // --quick：直接用上次 session 重裝，跳過所有互動
  if (flagQuick) {
    if (!prev) { p.log.error('無歷史記錄，無法 --quick。請先執行 pnpm setup。'); process.exit(1) }
    p.log.info(`Quick 模式：重放上次安裝（${prev.repos?.length} repos）`)
    await runQuickInstall({ prev, flagManual, sources, targets, projectFolders })
    return
  }

  // 重入
  if (prev && !flagAll && !flagQuick) {
    const action = handleCancel(await p.select({
      message: `上次安裝：${prev.repos?.length ?? 0} repos · ${prev.installMode || 'full'}`,
      options: [
        { value: 'reinstall', label: '重新安裝（用上次設定）', hint: 'Enter 直接裝' },
        { value: 'adjust', label: '調整設定' },
        { value: 'status', label: '查看/調整配置', hint: 'Claude / zsh / Slack 健康狀態' },
        { value: 'report', label: '查看上次報告' },
      ],
    }))
    if (action === BACK) { p.outro('已取消'); process.exit(0) }
    if (action === 'report') {
      const reportPath = path.join(REPO, 'dist', 'report.html')
      if (fs.existsSync(reportPath)) {
        const { openInBrowser } = await import('../lib/report.mjs')
        await openInBrowser(reportPath)
      } else {
        p.log.warn('找不到上次報告')
      }
      p.outro('已關閉')
      process.exit(0)
    }
    if (action === 'status') {
      // 展示完整配置狀態，並提供快速調整選項
      const { getConfigStatus } = await import('../lib/core/config-status.mjs')
      const {
        adjustClaude, adjustGlobalSettings, adjustSlack, adjustClaudeMd, adjustZsh,
      } = await import('../lib/phases/phase-adjust.mjs')

      const status = getConfigStatus()
      const { summary, claude, claudeMd, zsh, slack, env: envStatus } = status
      const HOME = process.env.HOME
      const claudeDir = path.join(HOME, '.claude')

      // ── 健康度 bar ──
      const bar = '█'.repeat(Math.round(summary.pct / 5)) + '░'.repeat(20 - Math.round(summary.pct / 5))
      const healthIcon = summary.pct >= 90 ? pc.green('✔') : summary.pct >= 70 ? pc.yellow('⚠') : pc.red('✘')

      // ── Claude 配置 ──
      const cmdOk = pc.green(claude.installedCommands.length)
      const agentOk = pc.green(claude.installedAgents.length)
      const ruleOk = pc.green(claude.installedRules.length)
      const hasHooks = fs.existsSync(path.join(claudeDir, 'hooks.json'))
      const hasSettings = fs.existsSync(path.join(claudeDir, 'settings.json'))

      const lines = [
        `${healthIcon}  [${bar}]  ${pc.bold(summary.pct + '%')}  (${summary.ok}/${summary.total})`,
        '',
        pc.bold('Claude 配置'),
        `  Commands   ${cmdOk} 個${claude.installedCommands.length > 0 ? pc.dim('  ' + claude.installedCommands.slice(0, 6).join(', ') + (claude.installedCommands.length > 6 ? '…' : '')) : ''}`,
        `  Agents     ${agentOk} 個${claude.installedAgents.length > 0 ? pc.dim('  ' + claude.installedAgents.slice(0, 6).join(', ') + (claude.installedAgents.length > 6 ? '…' : '')) : ''}`,
        `  Rules      ${ruleOk} 個${claude.installedRules.length > 0 ? pc.dim('  ' + claude.installedRules.join(', ')) : ''}`,
        `  Hooks      ${hasHooks ? pc.green('已啟用') : pc.dim('未安裝')}`,
        `  Settings   ${hasSettings ? pc.green('已配置') : pc.dim('未安裝')}`,
        `  CLAUDE.md  ${pc.cyan(claudeMd.count)} 個 repo`,
      ]

      if (claude.missing.length > 0) {
        lines.push(pc.red(`  缺少 ${claude.missing.length} 個：${claude.missing.slice(0, 5).join(', ')}${claude.missing.length > 5 ? '…' : ''}`))
      }
      if (claude.extra.length > 0) {
        lines.push(pc.dim(`  額外 ${claude.extra.length} 個（非 ab-dotfiles 管理）`))
      }

      // ── ZSH 環境模組 ──
      lines.push('', pc.bold('ZSH 環境模組'))
      lines.push(`  已安裝  ${pc.green(zsh.installed.length)}/${zsh.expected.length}  ${pc.dim(zsh.installed.join(', ') || '無')}`)
      if (zsh.missing.length > 0) {
        lines.push(pc.red(`  缺少：${zsh.missing.join(', ')}`))
      }

      // ── Slack ──
      lines.push('', pc.bold('Slack 通知'))
      if (slack.mode && slack.mode !== 'off') {
        const label = slack.mode === 'dm' ? 'DM（私訊自己）' : `頻道 ${slack.channel || ''}`
        lines.push(`  模式  ${pc.cyan(label)}`)
      } else {
        lines.push(`  ${pc.dim('未設定')}`)
      }

      // ── AI ──
      if (envStatus.aiModel) {
        lines.push('', pc.bold('AI 設定'))
        lines.push(`  模型  ${pc.cyan(envStatus.aiModel)}`)
      }

      p.log.info(lines.join('\n'))

      const adjustAction = handleCancel(await p.select({
        message: '選擇要調整的項目',
        options: [
          { value: 'claude',    label: '重新安裝 Claude 配置', hint: `commands ${claude.installedCommands.length} · agents ${claude.installedAgents.length} · rules ${claude.installedRules.length}` },
          { value: 'settings',  label: '重新套用全局設定', hint: `settings ${hasSettings ? '✔' : '✘'}` },
          { value: 'claudemd',  label: '重新生成 CLAUDE.md', hint: `${claudeMd.count} 個 repo · 需 AI` },
          { value: 'zsh',       label: '重新安裝 ZSH 環境模組', hint: `${zsh.installed.length}/${zsh.expected.length} 已安裝` },
          { value: 'slack',     label: '重新設定 Slack 通知', hint: slack.mode ? `${slack.mode}` : '未設定' },
          { value: 'back',      label: '← 返回' },
        ],
      }))
      if (adjustAction === BACK || adjustAction === 'back') { p.outro('已取消'); process.exit(0) }
      const adjustMap = {
        claude:   () => adjustClaude({ flagAll }),
        settings: () => adjustGlobalSettings(),
        claudemd: () => adjustClaudeMd(),
        zsh:      () => adjustZsh({ flagAll }),
        slack:    () => adjustSlack(),
      }
      if (adjustMap[adjustAction]) await adjustMap[adjustAction]()
      p.outro('調整完成')
      process.exit(0)
    }
    // 「調整設定」：不自動跳過組織選擇，讓用戶重選一切
    if (action === 'adjust') {
      await runLegacyCheckIfNeeded()
      prev = { ...prev, org: null } // 清除 org 讓 interactiveRepoSelect 重新問
    }
    if (action === 'reinstall') {
      await runLegacyCheckIfNeeded()
      // 等同 --quick
      await runQuickInstall({ prev, flagManual, sources, targets, projectFolders })
      return
    }
  }

  if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

  // 舊配置偵測（新安裝流程入口）
  await runLegacyCheckIfNeeded()

  // 首次使用：備份原始配置（~/.zshrc、~/.claude/ 等）
  const { ensureOriginalBackup } = await import('./backup-original.mjs')
  const origBackup = ensureOriginalBackup()
  if (origBackup && origBackup.length > 0) {
    p.log.success(`首次使用：已備份原始配置 → ~/.ab-dotfiles-original/\n${origBackup.map(r => `  ${r}`).join('\n')}\n還原指令：pnpm run restore-original`)
  }

  // 環境檢查
  phaseHeader('環境檢查')
  await ensureEnvironment()
  warmupCli()

  // ── 功能選擇 ──
  const featureChoices = [
    { value: 'claude', label: 'Claude Code 開發配置', hint: 'commands · agents · rules · hooks · settings' },
    { value: 'project', label: '專案配置（repos + AI）', hint: 'CLAUDE.md + ECC + 技術棧 · 需選 repos' },
    { value: 'zsh', label: 'ZSH 環境模組', hint: 'aliases · fzf · git · tools · history' },
    { value: 'slack', label: 'Slack 通知', hint: 'P0/P1/P2 分級 + Channel/DM' },
  ]
  // 首次安裝只預選核心 claude，避免誤覆蓋用戶現有 zsh/Slack 配置
  const prevFeatures = prev?.features || ['claude']
  const features = handleCancel(await p.multiselect({
    message: '選擇安裝項目（Space 切換，Enter 確認）',
    options: featureChoices,
    initialValues: prevFeatures,
    required: true,
  }))
  if (features === BACK) { p.outro('已取消'); return }

  const has = (f) => features.includes(f)
  // project = claudemd + ecc 合併，向下兼容
  const hasProject = has('project') || has('claudemd') || has('ecc')
  const needsRepos = hasProject

  // ── 外部服務設定 ──
  const setupResults = []

  // Slack 通知設定
  if (has('slack') && !prev?.slackChannel) {
    p.log.step(pc.bold('Slack 通知設定'))
    const { setupSlackNotify } = await import('../lib/slack/slack-setup.mjs')
    const slackResult = await setupSlackNotify(prev)
    if (slackResult) {
      const envPath = path.join(REPO, '.env')
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
      envContent = envContent.replace(/^SLACK_NOTIFY_CHANNEL=.*/m, '').replace(/^SLACK_NOTIFY_MODE=.*/m, '').trim()
      envContent += `\nSLACK_NOTIFY_CHANNEL=${slackResult.channelId}\nSLACK_NOTIFY_MODE=${slackResult.mode}\n`
      fs.writeFileSync(envPath, envContent)
      if (!prev) prev = {}
      prev.slackChannel = slackResult.channelId
      prev.slackMode = slackResult.mode
      setupResults.push(`Slack ${pc.green('✔')} ${slackResult.mode === 'dm' ? 'DM' : `#${slackResult.channelId}`}`)
    } else {
      setupResults.push(`Slack ${pc.dim('跳過')}`)
    }
  }

  // 外部服務設定摘要
  if (setupResults.length > 0) {
    p.log.success(`外部服務設定完成\n${setupResults.map(r => `  ${r}`).join('\n\n')}`)
  }

  // ── Phase loop（支持 BACK）──
  let analyzeCache = null

  while (true) {
    // Step 1：選 repos（只有需要 repos 的功能才問）
    let repos = []
    if (needsRepos) {
      phaseHeader('選擇倉庫', 1, 3)
      repos = await interactiveRepoSelect(prev)
      if (repos === BACK) { p.outro('已取消'); return }
    }

    // 角色分類（只有選了 repos 的功能才需要）
    const roles = {}
    if (needsRepos && repos.length > 0) {
    const { determineRole } = await import('../lib/config/config-classifier.mjs')
    for (const r of repos) {
      roles[r.fullName] = prev?.roles?.[r.fullName] || determineRole(r)
    }

    let roleConfirmed = false
    while (!roleConfirmed) {
      const roleCounts = countBy(Object.values(roles))
      const mc = roleCounts.main || 0
      const tc = roleCounts.temp || 0
      const toolc = roleCounts.tool || 0

      // 顯示當前分配（⭐主力 → 🔄臨時 → 🔧工具）
      const ROLE_ORDER = { main: 0, temp: 1, tool: 2 }
      const sortedRepos = [...repos].sort((a, b) => (ROLE_ORDER[roles[a.fullName]] ?? 9) - (ROLE_ORDER[roles[b.fullName]] ?? 9))
      const summary = sortedRepos.map(r => {
        const icon = roles[r.fullName] === 'main' ? '⭐' : roles[r.fullName] === 'tool' ? '🔧' : '🔄'
        return `  ${icon} ${r.fullName.split('/')[1]}`
      }).join('\n')
      p.log.info(`角色分配（${mc} ⭐主力 · ${tc} 🔄臨時${toolc ? ` · ${toolc} 🔧工具` : ''}）\n${summary}`)

      const action = handleCancel(await p.select({
        message: '角色分配',
        options: [
          { value: 'confirm', label: '確認', hint: '繼續安裝' },
          { value: 'main', label: '調整 ⭐主力', hint: '完整 CLAUDE.md + AI 生成' },
          { value: 'temp', label: '調整 🔄臨時', hint: '精簡 CLAUDE.md' },
          { value: 'tool', label: '調整 🔧工具', hint: '最小配置' },
          { value: 'back', label: '← 上一步' },
        ],
      }))

      if (action === BACK || action === 'back') { roleConfirmed = null; break }

      if (action === 'confirm') {
        roleConfirmed = true
        break
      }

      // 調整某個角色：選中 = 歸入該角色，未選 = 保持原角色
      const targetRole = action
      const items = repos.map(r => ({
        value: r.fullName,
        label: r.fullName.split('/')[1],
        hint: r.commits > 0 ? `${r.commits} commits` : '',
      }))
      const currentInRole = repos.filter(r => roles[r.fullName] === targetRole).map(r => r.fullName)
      const icon = targetRole === 'main' ? '⭐' : targetRole === 'tool' ? '🔧' : '🔄'
      const label = targetRole === 'main' ? '主力' : targetRole === 'tool' ? '工具' : '臨時'

      const selected = await smartSelect({
        title: `${icon} ${label} repos`,
        items,
        preselected: currentInRole,
        autoSelectThreshold: 0,
      })
      if (selected === BACK) continue

      // 選中的歸入 targetRole，從該角色移除的降級
      const selectedSet = new Set(selected)
      // 降級映射：從 main 移除 → temp，從 temp 移除 → tool，從 tool 移除 → temp
      const demoteMap = { main: 'temp', temp: 'tool', tool: 'temp' }
      for (const r of repos) {
        if (selectedSet.has(r.fullName)) {
          roles[r.fullName] = targetRole
        } else if (roles[r.fullName] === targetRole) {
          // 用戶明確移除，降級而不是重新自動判定
          roles[r.fullName] = demoteMap[targetRole]
        }
      }
    }

    if (roleConfirmed === null) continue // BACK

    // 寫入角色到 repos
    for (const r of repos) {
      r._roleOverride = roles[r.fullName]
    }

    // 自動分析（快取：repos + 角色沒變就不重跑）
    const reposKey = repos.map(r => `${r.fullName}:${r._roleOverride}`).sort().join(',')
    if (!analyzeCache || analyzeCache.key !== reposKey) {
      phaseHeader('自動分析')
      analyzeCache = {
        key: reposKey,
        plan: await phaseAnalyze({ repos, sources, baseDir: REPO, projectFolders }),
      }
      // 應用用戶角色覆蓋
      for (const r of analyzeCache.plan.repos) {
        const src = repos.find(s => s.fullName === r.fullName)
        if (src?._roleOverride) r.role = src._roleOverride
      }
      // 重算計數
      const roleCounts2 = countBy(analyzeCache.plan.repos, 'role')
      analyzeCache.plan.mainCount = roleCounts2.main || 0
      analyzeCache.plan.tempCount = roleCounts2.temp || 0
      analyzeCache.plan.toolCount = roleCounts2.tool || 0
      // 更新 projects（只有找到 localPath 的才生成 CLAUDE.md）
      const { getClaudeMdType } = await import('../lib/config/config-classifier.mjs')
      analyzeCache.plan.projects = analyzeCache.plan.repos
        .filter(r => r.localPath)
        .map(r => ({ repo: r.fullName, role: r.role, localPath: r.localPath, claudeMdType: getClaudeMdType(r.role) }))
    }
    } // end if (needsRepos)

    // 不需要 repos，或 repos 為空（GitHub 無倉庫）時建最小 plan
    if (!analyzeCache) {
      const { generateInstallPlan } = await import('../lib/config/auto-plan.mjs')
      analyzeCache = {
        key: 'no-repos',
        plan: generateInstallPlan({ repos: [], pipelineResult: null, eccResult: { recommended: [] }, localPaths: {}, roleOverrides: {}, profile: null }),
      }
    }

    // 根據功能選擇裁剪 plan（用 cloneDeep 避免破壞 cache 原始資料）
    let planForReview = analyzeCache?.plan
    if (planForReview) {
      planForReview = cloneDeep(planForReview)
      if (!hasProject) { planForReview.ecc = []; planForReview.projects = [] }
      if (!has('zsh')) planForReview.zshModules = []
      // 展開 project → claudemd + ecc 給下游
      const expandedFeatures = [...features]
      if (hasProject && !expandedFeatures.includes('claudemd')) expandedFeatures.push('claudemd')
      if (hasProject && !expandedFeatures.includes('ecc')) expandedFeatures.push('ecc')
      planForReview.features = expandedFeatures
    }

    // Step 2：確認計畫
    phaseHeader('確認安裝計畫', 2, 3)
    const confirmedPlan = await phasePlan(planForReview)
    if (confirmedPlan === BACK) continue // 回到 Step 1
    if (!confirmedPlan) break

    // --dry-run
    if (flagDryRun) {
      p.log.success(pc.yellow('Dry Run 完成 — 未寫入任何檔案'))
      p.outro('Dry Run 結束')
      return
    }

    // --manual
    if (flagManual) confirmedPlan.mode = 'manual'

    // 安裝
    phaseHeader('安裝中')
    const { installSelections, syncResult, startTime } = await phaseExecute(confirmedPlan, {
      repoDir: REPO,
      previewDir: PREVIEW_DIR,
      targets,
      prev,
      pipelineResult: confirmedPlan._pipelineResult || null,
      fetchedSources: confirmedPlan._fetchedSources || null,
    })

    // Step 3：完成
    phaseHeader('完成', 3, 3)
    await phaseComplete(confirmedPlan, {
      repoDir: REPO,
      installSelections,
      syncResult,
      startTime,
      pipelineResult: confirmedPlan._pipelineResult || null,
      projectFolders,
    })

    break
  }

  p.outro('設定完成')
}

main().catch(e => { p.log.error(e?.message ?? String(e)); process.exit(1) })
