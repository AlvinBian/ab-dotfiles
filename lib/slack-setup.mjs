/**
 * Slack 通知設定 — setup 時互動式配置
 *
 * 三種模式：
 * 1. Channel（推薦）— 搜尋/引導建立專屬頻道
 * 2. DM — 私發給自己（零配置）
 * 3. 關閉 — 不啟用 Slack 通知
 */

import * as p from '@clack/prompts'
import { handleCancel, BACK } from './ui/prompts.mjs'
import { env } from './env.mjs'

/**
 * 互動式 Slack 通知設定
 * @returns {{ channelId: string, mode: string } | null}
 */
export async function setupSlackNotify(prev) {
  // 已有設定 → 顯示當前狀態
  const currentChannel = env('SLACK_NOTIFY_CHANNEL', '') || prev?.slackChannel || ''
  const currentMode = env('SLACK_NOTIFY_MODE', '') || prev?.slackMode || ''

  if (currentChannel && currentMode) {
    const keep = handleCancel(await p.confirm({
      message: `Slack 通知：${currentMode === 'channel' ? `#channel (${currentChannel})` : currentMode === 'dm' ? 'DM 私發' : '已關閉'}，保持不變？`,
      initialValue: true,
    }))
    if (keep === true) return { channelId: currentChannel, mode: currentMode }
  }

  const action = handleCancel(await p.select({
    message: 'Slack 通知設定',
    options: [
      { value: 'channel', label: '專屬 Channel（推薦）', hint: '所有通知集中管理' },
      { value: 'dm', label: 'DM 私發給自己', hint: '零配置，立即可用' },
      { value: 'off', label: '關閉通知' },
    ],
  }))

  if (action === BACK) return null

  if (action === 'off') {
    return { channelId: '', mode: 'off' }
  }

  if (action === 'dm') {
    // 用 claude MCP 取得自己的 user ID
    p.log.info('DM 模式：通知將私發給你自己')
    const userId = env('SLACK_DM_CHANNEL', '')
    if (userId) {
      return { channelId: userId, mode: 'dm' }
    }
    const inputId = handleCancel(await p.text({
      message: 'Slack User ID（在 Slack 個人檔案中查看）',
      placeholder: 'U04B933M4G6',
    }))
    if (!inputId || inputId === BACK) return null
    return { channelId: inputId, mode: 'dm' }
  }

  // channel 模式：用 Slack 用戶名生成頻道名
  let slackUsername = ''
  try {
    const { execFileSync } = await import('child_process')
    const result = execFileSync('claude', [
      '--print', '--output-format', 'json', '--model', 'haiku',
      '-p', 'Use slack_read_user_profile (no user_id, defaults to current user). Return ONLY the username (the part before the display name, e.g. "alvin.bian"). No other text.',
    ], { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'ignore'] })
    const parsed = JSON.parse(result)
    const text = (parsed.result || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (text) slackUsername = text
  } catch { /* MCP not available */ }

  // fallback: GitHub 用戶名
  if (!slackUsername) {
    try {
      const { execSync } = await import('child_process')
      slackUsername = execSync('gh api user --jq .login', { encoding: 'utf8', timeout: 5000 }).trim().toLowerCase()
    } catch { /* gh not available */ }
  }

  // Slack channel 名稱只允許小寫、數字、連字號（. 替換為 -）
  const channelName = slackUsername ? `${slackUsername.replace(/\./g, '-')}-notify` : 'claude-code-notify'
  p.log.info(`搜尋 #${channelName}...`)

  // 嘗試搜尋（通過 claude CLI）
  let foundChannelId = null
  try {
    const { execFileSync } = await import('child_process')
    const result = execFileSync('claude', [
      '--print', '--output-format', 'json', '--model', 'haiku',
      '-p', `Use slack_search_channels to search for "${channelName}" including private channels. Return ONLY the channel ID if found, or "NOT_FOUND". No other text.`,
    ], { encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] })

    const parsed = JSON.parse(result)
    const text = (parsed.result || result).trim()
    if (text && !text.includes('NOT_FOUND') && text.startsWith('C')) {
      foundChannelId = text
    }
  } catch { /* search failed, continue */ }

  if (foundChannelId) {
    p.log.success(`找到 #${channelName}（${foundChannelId}）`)
    return { channelId: foundChannelId, mode: 'channel' }
  }

  // 未找到 → 複製頻道名到剪貼板 + 打開 Slack
  try {
    const { execSync, exec } = await import('child_process')
    // 複製頻道名到剪貼板
    execSync(`echo -n "${channelName}" | pbcopy`, { stdio: 'pipe' })
    p.log.success(`已複製 "${channelName}" 到剪貼板`)
    // 打開 Slack
    exec('open "slack://channel?team=&id=new"')
  } catch { /* ignore */ }
  p.log.info(`請在 Slack 中建立頻道：
  1. 已打開 Slack，直接貼上名稱（⌘V）
  2. 建議設為私人頻道
  3. 建立後回來按 Enter`)

  const confirmed = handleCancel(await p.confirm({
    message: `已建立 #${channelName}？`,
    initialValue: false,
  }))

  if (!confirmed || confirmed === BACK) {
    // fallback to DM
    p.log.info('使用 DM 模式作為替代')
    const userId = env('SLACK_DM_CHANNEL', '')
    return { channelId: userId || '', mode: userId ? 'dm' : 'off' }
  }

  // 再次搜尋
  try {
    const { execFileSync } = await import('child_process')
    const result = execFileSync('claude', [
      '--print', '--output-format', 'json', '--model', 'haiku',
      '-p', `Use slack_search_channels to search for "${channelName}" including private channels. Return ONLY the channel ID. No other text.`,
    ], { encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'ignore'] })

    const parsed = JSON.parse(result)
    const text = (parsed.result || result).trim()
    if (text && text.startsWith('C')) {
      p.log.success(`找到 #${channelName}（${text}）`)
      return { channelId: text, mode: 'channel' }
    }
  } catch { /* failed */ }

  // 最後手段：手動輸入 channel ID
  const manualId = handleCancel(await p.text({
    message: '輸入 Channel ID（在頻道詳情底部查看）',
    placeholder: 'C07XXXXXXX',
  }))
  if (!manualId || manualId === BACK) return null
  return { channelId: manualId, mode: 'channel' }
}
