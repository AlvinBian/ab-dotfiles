#!/usr/bin/env node
/**
 * pnpm run status — 配置管理中心
 *
 * 終端模式：互動式查看 + 管理所有配置
 * --report：生成 HTML Dashboard 在瀏覽器中查看
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { collectFullStatus, formatBytes, humanizeProjectPath } from '../lib/core/usage-scanner.mjs'
import { getDirname } from '../lib/core/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const HOME = process.env.HOME
const CLAUDE_DIR = path.join(HOME, '.claude')
const isReport = process.argv.includes('--report')

async function main() {
  p.intro(pc.bold('ab-dotfiles 配置管理中心'))
  const spinner = p.spinner()
  spinner.start('掃描使用數據（首次可能需要 10-30 秒）…')
  const data = await collectFullStatus()
  spinner.stop('掃描完成')

  if (isReport) {
    await generateHtmlReport(data)
    return
  }

  await terminalMode(data)
}

// ═══════════════════════════════════════════════════════════════
// 終端互動模式
// ═══════════════════════════════════════════════════════════════

async function terminalMode(data) {
  let currentData = data
  showOverview(currentData)

  while (true) {
    const action = await p.select({
      message: '要做什麼？',
      options: [
        { value: 'detail', label: '📋 查看詳情', hint: '展開某個分類' },
        { value: 'manage', label: '⚙️  管理配置', hint: '增/刪/啟用/關閉' },
        { value: 'report', label: '📊 生成 HTML 報告', hint: '在瀏覽器中查看完整 Dashboard' },
        { value: 'refresh', label: '🔄 重新掃描', hint: '更新使用數據' },
        { value: 'exit', label: '👋 退出' },
      ],
    })
    if (p.isCancel(action) || action === 'exit') break
    if (action === 'detail') {
      while (true) {
        const cont = await showDetail(currentData)
        if (!cont) break
      }
    }
    if (action === 'manage') {
      const changed = await manageConfig(currentData)
      if (changed) {
        const spinner = p.spinner()
        spinner.start('重新掃描…')
        currentData = await collectFullStatus()
        spinner.stop('已更新')
        showOverview(currentData)
      }
    }
    if (action === 'report') await generateHtmlReport(currentData)
    if (action === 'refresh') {
      const spinner = p.spinner()
      spinner.start('重新掃描…')
      currentData = await collectFullStatus()
      spinner.stop('已更新')
      showOverview(currentData)
    }
  }
  p.outro(pc.dim('再見'))
}

function showOverview(data) {
  const { overview, commands, agents, rules, hooks, zsh, slack, ai } = data
  const bar = '█'.repeat(Math.round(overview.healthPct / 5)) + '░'.repeat(20 - Math.round(overview.healthPct / 5))
  const icon = overview.healthPct >= 90 ? pc.green('✔') : overview.healthPct >= 70 ? pc.yellow('⚠') : pc.red('✘')

  console.log()
  console.log(`  ${icon}  [${bar}]  ${pc.bold(overview.healthPct + '%')}`)
  console.log()
  console.log(`  ⌨️  Commands   ${pc.green(commands.length)} 個  ${pc.dim(`使用率 ${overview.commandUsageRate}%`)}`)
  console.log(`  🤖 Agents     ${pc.green(agents.length)} 個  ${pc.dim(`使用率 ${overview.agentUsageRate}%`)}`)
  console.log(`  📐 Rules      ${pc.green(rules.filter(r => r.enabled).length)} 個${rules.filter(r => !r.enabled).length > 0 ? pc.yellow(` （${rules.filter(r => !r.enabled).length} 已停用）`) : ''}`)
  console.log(`  🪝 Hooks      ${hooks.reduce((s, h) => s + h.subHooks, 0)} 個子 hook（${hooks.length} 事件）`)
  console.log(`  🐚 ZSH        ${pc.green(zsh.installed.length)}/${zsh.available.length} 模組`)
  console.log(`  💬 Slack      ${slack.mode === 'off' ? pc.dim('未啟用') : pc.cyan(slack.mode + (slack.channelName ? ` #${slack.channelName}` : ''))}`)
  console.log(`  🧠 AI         ${pc.cyan(ai.model)} / ${ai.effort}`)
  console.log(`  📝 CLAUDE.md  ${pc.cyan(data.claudeMd.length)} 個項目`)
  console.log(`  📦 Plugins    ${pc.cyan(data.plugins.length)} 個`)
  console.log(`  💾 備份       ${pc.cyan(data.backups.length)} 份  ${pc.dim(`磁碟 ${formatBytes(data.diskUsage.cache + data.diskUsage.dist)}`)}`)
  console.log()
}

async function showDetail(data) {
  const category = await p.select({
    message: '查看哪個分類？',
    options: [
      { value: 'commands', label: `⌨️  Commands (${data.commands.length})` },
      { value: 'agents', label: `🤖 Agents (${data.agents.length})` },
      { value: 'rules', label: `📐 Rules (${data.rules.length})` },
      { value: 'hooks', label: `🪝 Hooks (${data.hooks.length} 事件)` },
      { value: 'zsh', label: `🐚 ZSH (${data.zsh.installed.length}/${data.zsh.available.length})` },
      { value: 'slack', label: `💬 Slack (${data.slack.mode})` },
      { value: 'ai', label: `🧠 AI (${data.ai.model})` },
      { value: 'permissions', label: `🔐 Permissions (${data.permissions.allow.length} allow / ${data.permissions.deny.length} deny)` },
      { value: 'claudemd', label: `📝 CLAUDE.md (${data.claudeMd.length} 項目)` },
      { value: 'plugins', label: `📦 Plugins (${data.plugins.length})` },
      { value: 'sessions', label: `📈 Sessions (${data.sessions.total})` },
      { value: 'env', label: `🔧 環境變數健康檢查` },
      { value: 'disk', label: `💾 備份與磁碟` },
      { value: 'back', label: '← 返回' },
    ],
  })
  if (p.isCancel(category) || category === 'back') return false

  switch (category) {
    case 'commands':
      console.log()
      p.log.step(pc.bold('⌨️  Commands 使用統計'))
      const sourceLabel = (s) => s === 'core' ? pc.blue('核心') : s === 'ecc' ? pc.magenta('ECC') : pc.dim('自訂')
      for (const c of data.commands) {
        const used = c.count > 0 ? pc.green(`${c.count}次`) : pc.red('未使用')
        const last = c.lastUsed ? pc.dim(c.lastUsed.slice(0, 10)) : ''
        console.log(`  ${sourceLabel(c.source)} /${c.name}  ${used}  ${last}`)
      }
      break
    case 'agents':
      console.log()
      p.log.step(pc.bold('🤖 Agents 使用統計'))
      for (const a of data.agents) {
        const used = a.count > 0 ? pc.green(`${a.count}次`) : pc.red('未使用')
        const last = a.lastUsed ? pc.dim(a.lastUsed.slice(0, 10)) : ''
        const src = a.source === 'core' ? pc.blue('核心') : a.source === 'ecc' ? pc.magenta('ECC') : pc.dim('自訂')
        console.log(`  ${src} @${a.name}  ${used}  ${last}`)
      }
      break
    case 'rules':
      console.log()
      p.log.step(pc.bold('📐 Rules'))
      for (const r of data.rules) {
        const status = r.enabled ? pc.green('✔') : pc.red('✘ disabled')
        const src = r.source === 'core' ? pc.blue('核心') : r.source === 'ecc' ? pc.magenta('ECC') : pc.dim('自訂')
        console.log(`  ${status} ${src} ${r.name}`)
      }
      break
    case 'hooks':
      console.log()
      p.log.step(pc.bold('🪝 Hooks'))
      for (const h of data.hooks) {
        console.log(`  ${pc.cyan(h.event)}  ${h.subHooks} 個子 hook`)
      }
      break
    case 'zsh':
      console.log()
      p.log.step(pc.bold('🐚 ZSH 模組'))
      for (const m of data.zsh.available) {
        const installed = data.zsh.installed.includes(m)
        console.log(`  ${installed ? pc.green('✔') : pc.red('✘')} ${m}`)
      }
      break
    case 'permissions':
      console.log()
      p.log.step(pc.bold('🔐 Permissions'))
      console.log(pc.dim('  Allow:'))
      for (const rule of data.permissions.allow) {
        const isTemplate = data.permissions.templateAllow.includes(rule)
        console.log(`    ${isTemplate ? pc.blue('模板') : pc.dim('自訂')} ${rule}`)
      }
      if (data.permissions.deny.length) {
        console.log(pc.dim('  Deny:'))
        for (const rule of data.permissions.deny) console.log(`    ${pc.red('deny')} ${rule}`)
      }
      break
    case 'claudemd':
      console.log()
      p.log.step(pc.bold('📝 CLAUDE.md 項目'))
      for (const proj of data.claudeMd) {
        console.log(`  ${proj.path}  ${pc.dim(proj.mtime.slice(0, 10))}`)
      }
      break
    case 'plugins':
      console.log()
      p.log.step(pc.bold('📦 Plugins'))
      if (data.plugins.length === 0) console.log(pc.dim('  無已構建的 plugin'))
      for (const pl of data.plugins) console.log(`  ${pl.name}  ${pc.dim(pl.mtime.slice(0, 10))}`)
      break
    case 'slack':
      console.log()
      p.log.step(pc.bold('💬 Slack 配置'))
      console.log(`  模式：${data.slack.mode === 'off' ? pc.dim('未啟用') : pc.cyan(data.slack.mode)}`)
      if (data.slack.channel) console.log(`  頻道：${pc.cyan(data.slack.channel)}${data.slack.channelName ? ` (#${data.slack.channelName})` : ''}`)
      break
    case 'ai':
      console.log()
      p.log.step(pc.bold('🧠 AI 設定'))
      console.log(`  模型：${pc.cyan(data.ai.model)}`)
      console.log(`  推理強度：${pc.cyan(data.ai.effort)}`)
      console.log(`  Repo 分類模型：${pc.cyan(data.ai.repoModel)}`)
      break
    case 'sessions':
      console.log()
      p.log.step(pc.bold('📈 Sessions'))
      console.log(`  總計 ${pc.cyan(data.sessions.total)} 個 session`)
      console.log()
      for (const [proj, count] of data.sessions.byProject) {
        console.log(`  ${pc.dim(humanizeProjectPath(proj))}  ${count} sessions`)
      }
      break
    case 'env':
      console.log()
      p.log.step(pc.bold('🔧 環境變數健康檢查'))
      if (data.envHealth.missing.length) {
        console.log(pc.red(`  缺少 ${data.envHealth.missing.length} 個：`) + data.envHealth.missing.join(', '))
      }
      if (data.envHealth.empty.length) {
        console.log(pc.yellow(`  空值 ${data.envHealth.empty.length} 個：`) + data.envHealth.empty.join(', '))
      }
      if (data.envHealth.extra.length) {
        console.log(pc.dim(`  額外 ${data.envHealth.extra.length} 個：`) + data.envHealth.extra.join(', '))
      }
      if (!data.envHealth.missing.length && !data.envHealth.empty.length) {
        console.log(pc.green('  ✔ 環境變數健康'))
      }
      break
    case 'disk':
      console.log()
      p.log.step(pc.bold('💾 備份與磁碟'))
      console.log(`  備份    ${data.backups.length} 份${data.backups.length > 0 ? pc.dim('  最近: ' + data.backups[data.backups.length - 1]) : ''}`)
      console.log(`  Cache   ${formatBytes(data.diskUsage.cache)}`)
      console.log(`  Dist    ${formatBytes(data.diskUsage.dist)}`)
      console.log(`  Sessions ${formatBytes(data.diskUsage.claudeProjects)}`)
      break
  }
  console.log()
  return true // 繼續循環
}

// ═══════════════════════════════════════════════════════════════
// 管理配置
// ═══════════════════════════════════════════════════════════════

async function manageConfig(data) {
  let changed = false
  const category = await p.select({
    message: '管理哪個分類？',
    options: [
      { value: 'commands', label: '⌨️  Commands — 刪除 / 從 ECC 新增' },
      { value: 'agents', label: '🤖 Agents — 刪除 / 從 ECC 新增' },
      { value: 'rules', label: '📐 Rules — 啟用 / 停用 / 刪除 / 從 ECC 新增' },
      { value: 'hooks', label: '🪝 Hooks — 移除事件' },
      { value: 'zsh', label: '🐚 ZSH — 安裝 / 卸載模組' },
      { value: 'permissions', label: '🔐 Permissions — 新增 / 刪除規則' },
      { value: 'claudemd', label: '📝 CLAUDE.md — 刪除' },
      { value: 'back', label: '← 返回' },
    ],
  })
  if (p.isCancel(category) || category === 'back') return false

  if (category === 'commands' || category === 'agents') {
    const items = category === 'commands' ? data.commands : data.agents
    const dir = path.join(CLAUDE_DIR, category)
    const eccItems = category === 'commands' ? data.ecc.commands : data.ecc.agents
    const notInstalled = eccItems.filter(name => !items.find(i => i.name === name))

    const action = await p.select({
      message: `${category} 操作`,
      options: [
        { value: 'delete', label: '🗑️  刪除已安裝的', hint: `${items.filter(i => i.count === 0).length} 個從未使用` },
        ...(notInstalled.length > 0 ? [{ value: 'add', label: '➕ 從 ECC 新增', hint: `${notInstalled.length} 個可新增` }] : []),
        { value: 'back', label: '← 返回' },
      ],
    })
    if (p.isCancel(action) || action === 'back') return

    if (action === 'delete') {
      const selected = await p.multiselect({
        message: `選擇要刪除的 ${category}（空格選擇，Enter 確認）`,
        options: items.map(i => ({
          value: i.name,
          label: `${i.count > 0 ? '  ' : pc.red('✘ ')}${i.name}`,
          hint: i.count > 0 ? `${i.count}次` : '從未使用',
        })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        for (const name of selected) {
          const fp = path.join(dir, `${name}.md`)
          if (fs.existsSync(fp)) { fs.unlinkSync(fp); p.log.success(`已刪除 ${name}`); changed = true }
        }
      }
    } else if (action === 'add') {
      const selected = await p.multiselect({
        message: `選擇要新增的 ${category}`,
        options: notInstalled.map(name => ({ value: name, label: name })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        const eccDir = path.join(REPO, 'ecc', 'everything-claude-code', category)
        for (const name of selected) {
          const src = path.join(eccDir, `${name}.md`)
          const dest = path.join(dir, `${name}.md`)
          if (fs.existsSync(src)) { fs.copyFileSync(src, dest); p.log.success(`已新增 ${name}`); changed = true }
        }
      }
    }
  }

  if (category === 'rules') {
    const action = await p.select({
      message: 'Rules 操作',
      options: [
        { value: 'toggle', label: '🔄 啟用 / 停用' },
        { value: 'delete', label: '🗑️  刪除' },
        { value: 'add', label: '➕ 從 ECC 新增' },
        { value: 'back', label: '← 返回' },
      ],
    })
    if (p.isCancel(action) || action === 'back') return

    const rulesDir = path.join(CLAUDE_DIR, 'rules')
    if (action === 'toggle') {
      const selected = await p.multiselect({
        message: '切換啟用/停用狀態',
        options: data.rules.map(r => ({
          value: r.name,
          label: `${r.enabled ? pc.green('✔') : pc.red('✘')} ${r.name}`,
          hint: r.enabled ? '啟用中 → 將停用' : '已停用 → 將啟用',
        })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        for (const name of selected) {
          const rule = data.rules.find(r => r.name === name)
          if (rule.enabled) {
            fs.renameSync(path.join(rulesDir, `${name}.md`), path.join(rulesDir, `${name}.md.disabled`))
            p.log.info(`已停用 ${name}`)
          } else {
            fs.renameSync(path.join(rulesDir, `${name}.md.disabled`), path.join(rulesDir, `${name}.md`))
            p.log.success(`已啟用 ${name}`)
          }
        }
      }
    } else if (action === 'delete') {
      const selected = await p.multiselect({
        message: '選擇要刪除的 rules',
        options: data.rules.map(r => ({ value: r.name, label: r.name, hint: r.source })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        for (const name of selected) {
          for (const ext of ['.md', '.md.disabled']) {
            const fp = path.join(rulesDir, `${name}${ext}`)
            if (fs.existsSync(fp)) { fs.unlinkSync(fp); p.log.success(`已刪除 ${name}`) }
          }
        }
      }
    } else if (action === 'add') {
      const notInstalled = data.ecc.rules.filter(name => !data.rules.find(r => r.name === name))
      if (notInstalled.length === 0) { p.log.info('所有 ECC rules 已安裝'); return }
      const selected = await p.multiselect({
        message: '選擇要新增的 rules',
        options: notInstalled.map(name => ({ value: name, label: name })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        const eccDir = path.join(REPO, 'ecc', 'everything-claude-code', 'rules')
        for (const name of selected) {
          const src = path.join(eccDir, `${name}.md`)
          const dest = path.join(rulesDir, `${name}.md`)
          if (fs.existsSync(src)) { fs.copyFileSync(src, dest); p.log.success(`已新增 ${name}`) }
        }
      }
    }
  }

  if (category === 'hooks') {
    const hooksPath = path.join(CLAUDE_DIR, 'hooks.json')
    let hooksData = {}
    try { hooksData = JSON.parse(fs.readFileSync(hooksPath, 'utf8')) } catch {}
    const events = Object.keys(hooksData.hooks || {})

    if (events.length === 0) { p.log.info('沒有已配置的 Hook 事件'); return false }

    const selected = await p.multiselect({
      message: '選擇要移除的 Hook 事件（移除後可透過 pnpm run setup 重新安裝）',
      options: events.map(e => ({
        value: e,
        label: e,
        hint: `${(hooksData.hooks[e] || []).reduce((s, m) => s + (m.hooks?.length || 0), 0)} 個子 hook`,
      })),
      required: false,
    })
    if (!p.isCancel(selected) && selected.length > 0) {
      for (const event of selected) {
        delete hooksData.hooks[event]
        p.log.info(`已移除 ${event}`)
      }
      fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2) + '\n')
      p.log.success(`已移除 ${selected.length} 個 Hook 事件（pnpm run setup 可重新安裝）`)
      return true
    }
  }

  if (category === 'zsh') {
    const zshSrc = path.join(REPO, 'zsh', 'modules')
    const zshDest = path.join(HOME, '.zsh', 'modules')
    const selected = await p.multiselect({
      message: '切換 ZSH 模組安裝狀態',
      options: data.zsh.available.map(m => ({
        value: m,
        label: `${data.zsh.installed.includes(m) ? pc.green('✔') : pc.red('✘')} ${m}`,
        hint: data.zsh.installed.includes(m) ? '已安裝 → 將卸載' : '未安裝 → 將安裝',
      })),
      required: false,
    })
    if (!p.isCancel(selected) && selected.length > 0) {
      fs.mkdirSync(zshDest, { recursive: true })
      for (const m of selected) {
        const dest = path.join(zshDest, `${m}.zsh`)
        if (data.zsh.installed.includes(m)) {
          fs.unlinkSync(dest)
          p.log.info(`已卸載 ${m}`)
        } else {
          fs.copyFileSync(path.join(zshSrc, `${m}.zsh`), dest)
          p.log.success(`已安裝 ${m}`)
        }
      }
    }
  }

  if (category === 'permissions') {
    const action = await p.select({
      message: 'Permissions 操作',
      options: [
        { value: 'add', label: '➕ 新增 allow 規則' },
        { value: 'delete', label: '🗑️  刪除 allow 規則' },
        { value: 'back', label: '← 返回' },
      ],
    })
    if (p.isCancel(action) || action === 'back') return

    const settingsPath = path.join(CLAUDE_DIR, 'settings.json')
    let settings = {}
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch {}
    if (!settings.permissions) settings.permissions = { allow: [], deny: [] }

    if (action === 'add') {
      const rule = await p.text({ message: '輸入 permission 規則（如 Bash(docker *)）' })
      if (!p.isCancel(rule) && rule) {
        settings.permissions.allow.push(rule)
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
        p.log.success(`已新增: ${rule}`)
      }
    } else if (action === 'delete') {
      const selected = await p.multiselect({
        message: '選擇要刪除的規則',
        options: (settings.permissions.allow || []).map(r => ({ value: r, label: r })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        settings.permissions.allow = settings.permissions.allow.filter(r => !selected.includes(r))
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
        p.log.success(`已刪除 ${selected.length} 條規則`)
      }
    }
  }

  if (category === 'claudemd') {
    const action = await p.select({
      message: 'CLAUDE.md 操作',
      options: [
        { value: 'delete', label: '🗑️  刪除指定項目的 CLAUDE.md' },
        { value: 'back', label: '← 返回' },
      ],
    })
    if (p.isCancel(action) || action === 'back') return

    if (action === 'delete') {
      const selected = await p.multiselect({
        message: '選擇要刪除的 CLAUDE.md',
        options: data.claudeMd.map(proj => ({
          value: proj.path,
          label: proj.path,
          hint: proj.mtime.slice(0, 10),
        })),
        required: false,
      })
      if (!p.isCancel(selected) && selected.length > 0) {
        for (const projPath of selected) {
          const realPath = projPath.replace('~', HOME)
          const mdPath = path.join(realPath, 'CLAUDE.md')
          if (fs.existsSync(mdPath)) { fs.unlinkSync(mdPath); p.log.success(`已刪除 ${projPath}/CLAUDE.md`) }
        }
      }
    }
  }

  return changed
}

// ═══════════════════════════════════════════════════════════════
// HTML Dashboard 報告
// ═══════════════════════════════════════════════════════════════

async function generateHtmlReport(data) {
  const distDir = path.join(REPO, 'dist')
  fs.mkdirSync(distDir, { recursive: true })
  const outputPath = path.join(distDir, 'status-report.html')

  // 7 天趨勢
  const today = new Date()
  const last7days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    last7days.push({ date: key, count: data.sessions.dailyCounts?.get(key) || 0 })
  }

  // 來源統計
  const cmdBySource = { core: 0, ecc: 0, user: 0 }
  for (const c of data.commands) cmdBySource[c.source]++
  const agentBySource = { core: 0, ecc: 0, user: 0 }
  for (const a of data.agents) agentBySource[a.source]++
  const ruleBySource = { core: 0, ecc: 0, user: 0 }
  for (const r of data.rules) ruleBySource[r.source]++

  const escHtml = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

  const commandRows = data.commands.map(c => `
    <tr class="${c.count === 0 ? 'bg-red-900/20' : ''}">
      <td class="px-3 py-2"><span class="tag tag-${c.source}">${c.source}</span></td>
      <td class="px-3 py-2 font-mono">/${escHtml(c.name)}</td>
      <td class="px-3 py-2 text-right">${c.count || '<span class="text-red-400">0</span>'}</td>
      <td class="px-3 py-2 text-gray-400 text-sm">${c.lastUsed ? c.lastUsed.slice(0, 10) : '—'}</td>
    </tr>`).join('')

  const agentRows = data.agents.map(a => `
    <tr class="${a.count === 0 ? 'bg-red-900/20' : ''}">
      <td class="px-3 py-2"><span class="tag tag-${a.source}">${a.source}</span></td>
      <td class="px-3 py-2 font-mono">@${escHtml(a.name)}</td>
      <td class="px-3 py-2 text-right">${a.count || '<span class="text-red-400">0</span>'}</td>
      <td class="px-3 py-2 text-gray-400 text-sm">${a.lastUsed ? a.lastUsed.slice(0, 10) : '—'}</td>
    </tr>`).join('')

  const ruleRows = data.rules.map(r => `
    <tr>
      <td class="px-3 py-2">${r.enabled ? '✅' : '❌'}</td>
      <td class="px-3 py-2"><span class="tag tag-${r.source}">${r.source}</span></td>
      <td class="px-3 py-2 font-mono">${escHtml(r.name)}</td>
    </tr>`).join('')

  const hookRows = data.hooks.map(h => `
    <tr>
      <td class="px-3 py-2 font-mono text-cyan-400">${escHtml(h.event)}</td>
      <td class="px-3 py-2 text-right">${h.subHooks}</td>
    </tr>`).join('')

  const permRows = data.permissions.allow.map(r => {
    const isTemplate = data.permissions.templateAllow.includes(r)
    return `<tr>
      <td class="px-3 py-2"><span class="tag tag-${isTemplate ? 'core' : 'user'}">${isTemplate ? '模板' : '自訂'}</span></td>
      <td class="px-3 py-2 font-mono text-sm">${escHtml(r)}</td>
    </tr>`
  }).join('')

  const projectRows = data.claudeMd.map(proj => `
    <tr>
      <td class="px-3 py-2 font-mono text-sm">${escHtml(proj.path)}</td>
      <td class="px-3 py-2 text-gray-400">${proj.mtime.slice(0, 10)}</td>
    </tr>`).join('')

  const sessionRows = [...data.sessions.byProject].sort((a, b) => b[1] - a[1]).map(([proj, count]) => {
    const name = humanizeProjectPath(proj)
    return `<tr><td class="px-3 py-2 text-sm">${escHtml(name)}</td><td class="px-3 py-2 text-right">${count}</td></tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="zh-TW" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ab-dotfiles 配置管理中心</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  body { background: #0f172a; color: #e2e8f0; font-family: 'SF Mono', 'Fira Code', monospace; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
  .tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .tag-core { background: #1e40af; color: #93c5fd; }
  .tag-ecc { background: #7e22ce; color: #d8b4fe; }
  .tag-user { background: #374151; color: #9ca3af; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 12px; border-bottom: 1px solid #475569; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
  td { border-bottom: 1px solid #1e293b; }
  .section-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .health-ring { width: 120px; height: 120px; }
  .stat-card { text-align: center; padding: 16px; }
  .stat-num { font-size: 28px; font-weight: 700; color: #38bdf8; }
  .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .grid-12 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
  #mgmt-output { background: #0f172a; border: 1px solid #475569; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 13px; white-space: pre-wrap; display: none; }
</style>
</head>
<body class="p-6 max-w-7xl mx-auto">
<h1 class="text-3xl font-bold mb-2">🛠️ ab-dotfiles 配置管理中心</h1>
<p class="text-gray-400 mb-6">掃描時間：${new Date().toLocaleString('zh-TW')}</p>

<!-- 1. 總覽 -->
<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
  <div class="card stat-card col-span-2 flex items-center gap-6">
    <canvas id="healthRing" class="health-ring"></canvas>
    <div>
      <div class="stat-num">${data.overview.healthPct}%</div>
      <div class="stat-label">配置健康度</div>
    </div>
  </div>
  <div class="card stat-card"><div class="stat-num">${data.commands.length}</div><div class="stat-label">⌨️ Commands</div></div>
  <div class="card stat-card"><div class="stat-num">${data.agents.length}</div><div class="stat-label">🤖 Agents</div></div>
  <div class="card stat-card"><div class="stat-num">${data.rules.filter(r=>r.enabled).length}</div><div class="stat-label">📐 Rules</div></div>
  <div class="card stat-card"><div class="stat-num">${data.hooks.reduce((s,h)=>s+h.subHooks,0)}</div><div class="stat-label">🪝 Hooks</div></div>
</div>

<div class="grid-12">

<!-- 2. Commands -->
<div class="card">
  <div class="section-title">⌨️ Commands <span class="text-sm text-gray-400 font-normal">${data.commands.length} 個｜使用率 ${data.overview.commandUsageRate}%</span></div>
  <div class="flex gap-2 mb-3">
    <span class="tag tag-core">核心 ${cmdBySource.core}</span>
    <span class="tag tag-ecc">ECC ${cmdBySource.ecc}</span>
    <span class="tag tag-user">自訂 ${cmdBySource.user}</span>
  </div>
  <div style="max-height:400px;overflow-y:auto">
  <table><thead><tr><th>來源</th><th>名稱</th><th>使用次數</th><th>最近使用</th></tr></thead>
  <tbody>${commandRows}</tbody></table>
  </div>
</div>

<!-- 3. Agents -->
<div class="card">
  <div class="section-title">🤖 Agents <span class="text-sm text-gray-400 font-normal">${data.agents.length} 個｜使用率 ${data.overview.agentUsageRate}%</span></div>
  <div class="flex gap-2 mb-3">
    <span class="tag tag-core">核心 ${agentBySource.core}</span>
    <span class="tag tag-ecc">ECC ${agentBySource.ecc}</span>
    <span class="tag tag-user">自訂 ${agentBySource.user}</span>
  </div>
  <div style="max-height:400px;overflow-y:auto">
  <table><thead><tr><th>來源</th><th>名稱</th><th>使用次數</th><th>最近使用</th></tr></thead>
  <tbody>${agentRows}</tbody></table>
  </div>
</div>

<!-- 4. Rules -->
<div class="card">
  <div class="section-title">📐 Rules <span class="text-sm text-gray-400 font-normal">${data.rules.length} 個</span></div>
  <div class="flex gap-2 mb-3">
    <span class="tag tag-core">核心 ${ruleBySource.core}</span>
    <span class="tag tag-ecc">ECC ${ruleBySource.ecc}</span>
    <span class="tag tag-user">自訂 ${ruleBySource.user}</span>
  </div>
  <table><thead><tr><th>狀態</th><th>來源</th><th>名稱</th></tr></thead>
  <tbody>${ruleRows}</tbody></table>
</div>

<!-- 5. Hooks -->
<div class="card">
  <div class="section-title">🪝 Hooks <span class="text-sm text-gray-400 font-normal">${data.hooks.length} 事件</span></div>
  <table><thead><tr><th>事件</th><th>子 Hook 數</th></tr></thead>
  <tbody>${hookRows}</tbody></table>
</div>

<!-- 6. ZSH + Slack + AI -->
<div class="card">
  <div class="section-title">🐚 ZSH · 💬 Slack · 🧠 AI</div>
  <p class="text-sm mb-2"><strong>ZSH 模組</strong> ${data.zsh.installed.length}/${data.zsh.available.length}</p>
  <div class="flex flex-wrap gap-1 mb-4">${data.zsh.available.map(m =>
    `<span class="tag ${data.zsh.installed.includes(m) ? 'tag-core' : 'tag-user'}">${m}</span>`
  ).join('')}</div>
  <p class="text-sm mb-1"><strong>Slack</strong> ${data.slack.mode === 'off' ? '<span class="text-gray-500">未啟用</span>' : `${data.slack.mode} ${data.slack.channelName ? '#' + escHtml(data.slack.channelName) : ''}`}</p>
  <p class="text-sm"><strong>AI</strong> ${escHtml(data.ai.model)} / ${escHtml(data.ai.effort)} · repo: ${escHtml(data.ai.repoModel)}</p>
</div>

<!-- 7. Sessions -->
<div class="card">
  <div class="section-title">📈 Sessions <span class="text-sm text-gray-400 font-normal">共 ${data.sessions.total} 個</span></div>
  <canvas id="sessionChart" height="160"></canvas>
  <div style="max-height:200px;overflow-y:auto;margin-top:12px">
  <table><thead><tr><th>專案</th><th>數量</th></tr></thead>
  <tbody>${sessionRows}</tbody></table>
  </div>
</div>

<!-- 8. Permissions -->
<div class="card">
  <div class="section-title">🔐 Permissions <span class="text-sm text-gray-400 font-normal">${data.permissions.allow.length} allow · ${data.permissions.deny.length} deny</span></div>
  <div style="max-height:300px;overflow-y:auto">
  <table><thead><tr><th>來源</th><th>規則</th></tr></thead>
  <tbody>${permRows}</tbody></table>
  </div>
  ${data.permissions.deny.length > 0 ? `<p class="text-red-400 text-sm mt-2">Deny: ${data.permissions.deny.map(escHtml).join(', ')}</p>` : ''}
</div>

<!-- 9. CLAUDE.md -->
<div class="card">
  <div class="section-title">📝 CLAUDE.md <span class="text-sm text-gray-400 font-normal">${data.claudeMd.length} 個項目</span></div>
  <table><thead><tr><th>路徑</th><th>更新時間</th></tr></thead>
  <tbody>${projectRows}</tbody></table>
</div>

<!-- 10. Plugins -->
<div class="card">
  <div class="section-title">📦 Plugins <span class="text-sm text-gray-400 font-normal">${data.plugins.length} 個</span></div>
  ${data.plugins.length === 0 ? '<p class="text-gray-500">無已構建的 plugin</p>' :
    data.plugins.map(pl => `<p class="font-mono text-sm">${escHtml(pl.name)} <span class="text-gray-400">${pl.mtime.slice(0, 10)}</span></p>`).join('')}
</div>

<!-- 11. 備份與磁碟 -->
<div class="card">
  <div class="section-title">💾 備份與磁碟</div>
  <p class="text-sm">備份 <strong>${data.backups.length}</strong> 份${data.backups.length > 0 ? ' · 最近: ' + escHtml(data.backups[data.backups.length - 1]) : ''}</p>
  <p class="text-sm mt-1">Cache: ${formatBytes(data.diskUsage.cache)} · Dist: ${formatBytes(data.diskUsage.dist)} · Sessions: ${formatBytes(data.diskUsage.claudeProjects)}</p>
</div>

<!-- 12. 環境變數 -->
<div class="card">
  <div class="section-title">🔧 環境變數健康檢查</div>
  ${data.envHealth.missing.length ? `<p class="text-red-400 text-sm">❌ 缺少 ${data.envHealth.missing.length} 個：${data.envHealth.missing.map(escHtml).join(', ')}</p>` : ''}
  ${data.envHealth.empty.length ? `<p class="text-yellow-400 text-sm">⚠️ 空值 ${data.envHealth.empty.length} 個：${data.envHealth.empty.map(escHtml).join(', ')}</p>` : ''}
  ${data.envHealth.extra.length ? `<p class="text-gray-400 text-sm">ℹ️ 額外 ${data.envHealth.extra.length} 個：${data.envHealth.extra.map(escHtml).join(', ')}</p>` : ''}
  ${!data.envHealth.missing.length && !data.envHealth.empty.length ? '<p class="text-green-400 text-sm">✅ 環境變數健康</p>' : ''}
</div>

</div><!-- end grid -->

<!-- 管理面板 -->
<div class="card mt-6">
  <div class="section-title">⚙️ 快速管理</div>
  <p class="text-sm text-gray-400 mb-3">勾選未使用的項目，生成刪除腳本</p>
  <div class="flex gap-3 mb-3">
    <button onclick="selectUnused('cmd')" class="px-3 py-1.5 bg-red-900/50 text-red-300 rounded text-sm hover:bg-red-900">選取未使用 Commands (${data.commands.filter(c=>c.count===0).length})</button>
    <button onclick="selectUnused('agent')" class="px-3 py-1.5 bg-red-900/50 text-red-300 rounded text-sm hover:bg-red-900">選取未使用 Agents (${data.agents.filter(a=>a.count===0).length})</button>
    <button onclick="generateScript()" class="px-3 py-1.5 bg-blue-900/50 text-blue-300 rounded text-sm hover:bg-blue-900">生成刪除腳本</button>
    <button onclick="copyScript()" class="px-3 py-1.5 bg-green-900/50 text-green-300 rounded text-sm hover:bg-green-900">📋 複製</button>
  </div>
  <div id="mgmt-output"></div>
</div>

<script>
// 健康度環形圖
new Chart(document.getElementById('healthRing'), {
  type: 'doughnut',
  data: { datasets: [{ data: [${data.overview.healthPct}, ${100 - data.overview.healthPct}], backgroundColor: ['${data.overview.healthPct >= 90 ? '#22c55e' : data.overview.healthPct >= 70 ? '#eab308' : '#ef4444'}', '#334155'], borderWidth: 0 }] },
  options: { cutout: '75%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: true }
});

// 7 天趨勢
new Chart(document.getElementById('sessionChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(last7days.map(d => d.date.slice(5)))},
    datasets: [{ label: 'Sessions', data: ${JSON.stringify(last7days.map(d => d.count))}, backgroundColor: '#38bdf8', borderRadius: 4 }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } }
});

// 管理面板
const unusedCmds = ${JSON.stringify(data.commands.filter(c => c.count === 0).map(c => c.name))};
const unusedAgents = ${JSON.stringify(data.agents.filter(a => a.count === 0).map(a => a.name))};
let selectedCmds = new Set(), selectedAgents = new Set();

function selectUnused(type) {
  if (type === 'cmd') { selectedCmds = new Set(unusedCmds); selectedAgents.clear(); }
  else { selectedAgents = new Set(unusedAgents); selectedCmds.clear(); }
  generateScript();
}

function generateScript() {
  const lines = [];
  for (const c of selectedCmds) lines.push('rm -f ~/.claude/commands/' + c + '.md');
  for (const a of selectedAgents) lines.push('rm -f ~/.claude/agents/' + a + '.md');
  const el = document.getElementById('mgmt-output');
  el.style.display = lines.length ? 'block' : 'none';
  el.textContent = lines.length ? '#!/bin/bash\n# 刪除未使用的配置\n' + lines.join('\n') : '';
}

function copyScript() {
  const text = document.getElementById('mgmt-output').textContent;
  if (text) navigator.clipboard.writeText(text).then(() => alert('已複製到剪貼板'));
}
</script>
</body></html>`


  fs.writeFileSync(outputPath, html)
  p.log.success(`報告已生成：${outputPath}`)
  execFileSync('open', [outputPath])
}

main().catch(console.error)
