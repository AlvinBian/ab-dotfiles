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
    p.log.info('DM 模式：通知將私發給你自己')
    let userId = env('SLACK_NOTIFY_CHANNEL', '') || env('SLACK_DM_CHANNEL', '')
    if (!userId) {
      const inputId = handleCancel(await p.text({
        message: 'Slack User ID（在 Slack 個人檔案中查看）',
        placeholder: 'U04B933M4G6',
      }))
      if (!inputId || inputId === BACK) return null
      userId = inputId
    }
    await sendTestMessage(userId)
    return { channelId: userId, mode: 'dm' }
  }

  // channel 模式：用 GitHub 用戶名生成頻道名（可靠，不依賴 MCP）
  let username = ''
  try {
    const { execSync } = await import('child_process')
    // gh api 直接取用戶名 + 全名
    const login = execSync('gh api user --jq .login', { encoding: 'utf8', timeout: 5000 }).trim().toLowerCase()
    const name = execSync('gh api user --jq .name', { encoding: 'utf8', timeout: 5000 }).trim().toLowerCase()
    // 優先用全名（如 "Alvin Bian" → "alvin-bian"），fallback 到 login
    username = name ? name.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : login
  } catch { /* gh not available */ }

  const channelName = username ? `${username}-notify` : 'claude-code-notify'
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
    await sendTestMessage(foundChannelId)
    return { channelId: foundChannelId, mode: 'channel' }
  }

  // 未找到 → 複製頻道名到剪貼板 + 打開 Slack
  try {
    const { execSync, exec } = await import('child_process')
    // 複製頻道名到剪貼板
    execSync(`printf '%s' '${channelName}' | pbcopy`, { stdio: 'pipe' })
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

  // 最後手段：貼上 channel link 或 ID
  const manualInput = handleCancel(await p.text({
    message: '貼上 Channel Link 或 ID（在頻道名稱右鍵 → Copy link）',
    placeholder: 'https://xxx.slack.com/archives/C07XXXXXX 或 C07XXXXXX',
  }))
  if (!manualInput || manualInput === BACK) return null
  // 從 link 提取 channel ID：https://xxx.slack.com/archives/C07XXXXXX
  const idMatch = manualInput.match(/\b(C[A-Z0-9]{8,})\b/)
  const channelId = idMatch ? idMatch[1] : manualInput.trim()
  if (!channelId.startsWith('C')) {
    p.log.warn('無效的 Channel ID，使用 DM 模式')
    return { channelId: env('SLACK_DM_CHANNEL', ''), mode: 'dm' }
  }
  // 發送測試訊息
  const ok = await sendTestMessage(channelId)
  if (!ok) {
    p.log.warn('測試訊息發送失敗，請確認頻道 ID 正確且 Claude Code 已加入頻道')
    return { channelId, mode: 'channel' } // 仍然保存，用戶可後續修復
  }
  return { channelId, mode: 'channel' }
}

/**
 * 發送測試訊息驗證 channel 可用
 */
async function sendTestMessage(channelId) {
  const s = p.spinner()
  s.start('發送測試訊息...')
  try {
    const { execFileSync } = await import('child_process')
    execFileSync('claude', [
      '--print', '--output-format', 'text', '--model', 'haiku',
      '-p', `Use slack_send_message to send to channel_id "${channelId}". Message:
✅ *ab-dotfiles 通知頻道設定成功*

此頻道將接收 Claude Code 使用中的通知：
• 🚨 P0：危險命令攔截、受保護檔案阻止
• ✅ P1：任務完成、Context 壓縮、子代理失敗
• 📝 P2：Session 開始、檔案編輯摘要

設定完成時間：${new Date().toLocaleString('zh-TW')}
Just send it, no commentary.`,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })
    s.stop('✔ 測試訊息已發送，請確認收到')
    return true
  } catch {
    s.stop('✗ 發送失敗')
    return false
  }
}
