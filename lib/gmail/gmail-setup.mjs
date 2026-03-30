/**
 * Gmail 5-Tier Filter Setup — 互動式設定精靈
 *
 * 引導用戶透過 clasp 將 Gmail 分級過濾規則部署到 Google Apps Script。
 * Tier 0  github_noise   → 歸檔靜音（PR、CI、bot）
 * Tier 1  skip           → 歸檔靜音（SaaS bot、促銷）
 * Tier 2  info_only      → 留收件匣，移除 IMPORTANT
 * Tier 3  meeting_info   → 留收件匣（行事曆邀請）
 * Tier 4  action_required → 標 IMPORTANT + STARRED
 */

import * as p from '@clack/prompts'
import { handleCancel, BACK } from '../cli/prompts.mjs'
import { execFileSync, spawn } from 'child_process'
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir, tmpdir } from 'os'

const SCRIPT_DIR = new URL('../../scripts', import.meta.url).pathname

/**
 * 互動式 Gmail 分級過濾設定精靈
 *
 * 引導用戶安裝 clasp、登入 Google 帳號，並將 Gmail 過濾規則
 * 部署至 Google Apps Script。若已有設定則詢問是否保持不變。
 *
 * @param {Object|null} prev - 上次的 session 設定（{ gmail: { scriptId, scriptUrl, setupAt } }）
 * @returns {Promise<{ scriptId: string, scriptUrl: string, setupAt: string } | null>}
 */
export async function setupGmailFilters(prev) {
  // 已有設定 → 詢問是否保持不變
  if (prev?.gmail?.scriptId) {
    const keep = handleCancel(await p.confirm({
      message: `Gmail 分級已設定（Script ID: ${prev.gmail.scriptId}），保持不變？`,
      initialValue: true,
    }))
    if (keep === BACK) return null
    if (keep === true) return prev.gmail
  }

  // Step 1: 確認 clasp 已安裝
  const claspSpinner = p.spinner()
  claspSpinner.start('檢查 clasp 安裝狀態')
  let claspPath = ''
  try {
    claspPath = execFileSync('which', ['clasp'], { encoding: 'utf8' }).trim()
    claspSpinner.stop('clasp 已安裝')
  } catch {
    claspSpinner.stop('clasp 未安裝')
    const install = handleCancel(await p.confirm({
      message: '需要安裝 clasp（npm install -g @google/clasp），現在安裝？',
      initialValue: true,
    }))
    if (install === BACK || install === false) {
      _showManualSteps()
      return null
    }
    try {
      execFileSync('npm', ['install', '-g', '@google/clasp'], { stdio: 'inherit' })
      claspPath = execFileSync('which', ['clasp'], { encoding: 'utf8' }).trim()
      p.log.success('clasp 安裝完成')
    } catch {
      p.log.warn('clasp 安裝失敗，請手動執行：npm install -g @google/clasp')
      _showManualSteps()
      return null
    }
  }

  // Step 2: 確認 clasp 已登入
  const clasprcPath = join(homedir(), '.clasprc.json')
  if (!existsSync(clasprcPath)) {
    p.log.info('尚未登入 Google 帳號，即將開啟瀏覽器授權...')
    const loginOk = await _runInteractive(claspPath, ['login'])
    if (!loginOk) {
      p.log.warn('登入失敗，請手動執行：clasp login')
      _showManualSteps()
      return null
    }
    p.log.success('Google 帳號登入成功')
  } else {
    p.log.info('已偵測到 clasp 登入狀態')
  }

  // Step 3: 選擇建立新專案或使用現有 Script ID
  const projectAction = handleCancel(await p.select({
    message: '選擇 Apps Script 專案',
    options: [
      { value: 'new', label: '建立新 Apps Script 專案', hint: '自動建立並命名' },
      { value: 'existing', label: '使用現有 Script ID', hint: '已有部署過的專案' },
    ],
  }))
  if (projectAction === BACK) return null

  // Step 4: 建立暫存目錄並準備腳本檔案
  const tmpDir = join(tmpdir(), `gmail-filters-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    copyFileSync(join(SCRIPT_DIR, 'gmail-filters-setup.gs'), join(tmpDir, 'gmail-filters-setup.gs'))
    copyFileSync(join(SCRIPT_DIR, 'appsscript.json'), join(tmpDir, 'appsscript.json'))
  } catch {
    p.log.warn(`找不到腳本檔案，請確認 scripts/ 目錄有 gmail-filters-setup.gs 和 appsscript.json`)
    _showManualSteps()
    return null
  }

  let scriptId = ''

  if (projectAction === 'new') {
    scriptId = await _claspCreateWithRetry(claspPath, tmpDir)
    if (!scriptId) {
      _showManualSteps()
      return null
    }
  } else {
    const inputId = handleCancel(await p.text({
      message: '輸入現有 Script ID',
      placeholder: '1BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxP',
      validate: v => (!v || v.trim().length < 10) ? '請輸入有效的 Script ID' : undefined,
    }))
    if (!inputId || inputId === BACK) return null
    scriptId = inputId.trim()
    writeFileSync(join(tmpDir, '.clasp.json'), JSON.stringify({ scriptId, rootDir: tmpDir }))
  }

  if (!scriptId) {
    p.log.warn('無法取得 Script ID')
    _showManualSteps()
    return null
  }

  // Step 5: 推送腳本
  const pushSpinner = p.spinner()
  pushSpinner.start('推送腳本到 Google Apps Script')
  try {
    execFileSync(claspPath, ['push', '--force'], { encoding: 'utf8', cwd: tmpDir })
    pushSpinner.stop('腳本推送完成')
  } catch (err) {
    pushSpinner.stop('推送失敗')
    p.log.warn(`clasp push 失敗：${err.message}`)
    _showManualSteps()
    return null
  }

  // Step 6: 顯示後續步驟
  const scriptUrl = `https://script.google.com/d/${scriptId}/edit`
  p.log.success(`腳本已部署完成`)
  p.log.info(`請完成以下步驟以套用 Gmail 過濾規則：
  1. 開啟 Apps Script 編輯器：${scriptUrl}
  2. 選擇函式 setupAllFilters
  3. 點擊「執行」按鈕
  4. 首次執行需授權 Gmail API 權限`)

  return {
    scriptId,
    scriptUrl,
    setupAt: new Date().toISOString(),
  }
}

/** 以 inherit stdio 執行互動式指令（如 clasp login 需要瀏覽器） */
async function _runInteractive(bin, args) {
  return new Promise(resolve => {
    const child = spawn(bin, args, { stdio: 'inherit' })
    child.on('close', code => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/** clasp create 帶 API 未啟用自動重試 */
async function _claspCreateWithRetry(claspPath, tmpDir) {
  const API_SETTINGS_URL = 'https://script.google.com/home/usersettings'
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const s = p.spinner()
    s.start(attempt === 0 ? '建立新 Apps Script 專案' : '重試建立 Apps Script 專案')
    try {
      const output = execFileSync(
        claspPath,
        ['create', '--type', 'standalone', '--title', 'Gmail 5-Tier Filters', '--rootDir', tmpDir],
        { encoding: 'utf8', cwd: tmpDir, stderr: 'pipe' }
      )
      const match = output.match(/script\.google\.com\/d\/([^/]+)\/edit/)
      s.stop('Apps Script 專案建立完成')
      return match ? match[1] : ''
    } catch (err) {
      s.stop('建立失敗')
      const msg = err.stderr?.toString() || err.message || ''
      if (msg.includes('Apps Script API') && attempt < maxRetries) {
        p.log.info(`需要先啟用 Apps Script API，正在開啟設定頁面...`)
        try { execFileSync('open', [API_SETTINGS_URL]) } catch { /* ignore */ }
        const ready = handleCancel(await p.confirm({
          message: `請在瀏覽器中開啟「Google Apps Script API」，完成後按 Enter 繼續`,
          initialValue: true,
        }))
        if (ready === BACK || ready === false) return ''
        continue
      }
      p.log.warn(`clasp create 失敗：${msg.slice(0, 120)}`)
      return ''
    }
  }
  return ''
}

/** 顯示手動操作步驟 */
function _showManualSteps() {
  p.log.info(`手動設定步驟：
  1. npm install -g @google/clasp
  2. clasp login
  3. clasp create --type standalone --title "Gmail 5-Tier Filters"
  4. 複製 scripts/gmail-filters-setup.gs 和 scripts/appsscript.json 到專案目錄
  5. clasp push
  6. 在 Apps Script 編輯器執行 setupAllFilters`)
}
