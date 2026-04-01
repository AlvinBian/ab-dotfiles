/**
 * 環境檢查 + 自動修復
 *
 * 檢查順序：Homebrew → nvm → Node.js → pnpm → gh CLI → gh 登入 → claude CLI
 */

import * as p from '@clack/prompts';
import { execSync, execFileSync } from 'child_process';
import pc from 'picocolors';

function has(cmd) {
  try { execFileSync('which', [cmd], { stdio: 'pipe' }); return true } catch { return false }
}

function ver(cmd, flag = '--version') {
  try { return execFileSync(cmd, [flag], { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0] } catch { return null }
}

function run(cmd) {
  try { execSync(cmd, { stdio: 'inherit' }); return true } catch { return false }
}

/**
 * 透過 bash source nvm.sh 執行 nvm 命令（nvm 是 shell function，不在 PATH）
 * 使用 $NVM_DIR 或 fallback 到 $HOME/.nvm（剛安裝時 env 尚未更新）
 */
function runNvm(nvmCmd) {
  const nvmDir = process.env.NVM_DIR || `${process.env.HOME}/.nvm`
  try {
    execFileSync('bash', ['-c', `source "${nvmDir}/nvm.sh" 2>/dev/null && nvm ${nvmCmd}`], { stdio: 'inherit', timeout: 120000 })
    return true
  } catch { return false }
}

function checkNvm() {
  const nvmDir = process.env.NVM_DIR || `${process.env.HOME}/.nvm`
  try {
    execFileSync('bash', ['-c', `source "${nvmDir}/nvm.sh" 2>/dev/null && nvm --version`], { stdio: 'pipe', timeout: 3000 })
    return true
  } catch { return false }
}

function nvmVersion() {
  const nvmDir = process.env.NVM_DIR || `${process.env.HOME}/.nvm`
  try {
    return execFileSync('bash', ['-c', `source "${nvmDir}/nvm.sh" 2>/dev/null && nvm --version`], { encoding: 'utf8', stdio: 'pipe', timeout: 3000 }).trim()
  } catch { return null }
}

/**
 * 檢查並確保開發環境完整
 *
 * 依序檢查 Homebrew、nvm、Node.js、pnpm、gh CLI、gh 登入、claude CLI。
 * 若有缺失，提示用戶確認後自動安裝。
 * 全部通過則顯示版本資訊並返回 true。
 *
 * @returns {Promise<boolean>} 環境就緒返回 true，安裝失敗返回 false
 */
export async function ensureEnvironment() {
  const nvmOk = checkNvm()

  const checks = [
    { name: 'Homebrew', ok: has('brew'), ver: ver('brew', '-v')?.match(/[\d.]+/)?.[0], failLabel: '未安裝', actionLabel: '安裝 Homebrew' },
    { name: 'nvm', ok: nvmOk, ver: nvmVersion(), failLabel: '未安裝', actionLabel: '安裝 nvm' },
    { name: 'Node.js', ok: has('node'), ver: ver('node'), failLabel: '未安裝', actionLabel: '安裝 Node.js' },
    { name: 'pnpm', ok: has('pnpm'), ver: ver('pnpm'), failLabel: '未安裝', actionLabel: '安裝 pnpm' },
    { name: 'gh CLI', ok: has('gh'), ver: ver('gh'), failLabel: '未安裝', actionLabel: '安裝 gh CLI' },
    { name: 'gh 登入', ok: (() => { try { execSync('gh auth status', { stdio: 'pipe' }); return true } catch { return false } })(), ver: null, failLabel: '未登入', actionLabel: 'GitHub 登入' },
    { name: 'claude CLI', ok: has('claude'), ver: ver('claude'), failLabel: '未安裝', actionLabel: '安裝 Claude CLI' },
  ]

  const missing = checks.filter(c => !c.ok)

  // 全部通過
  if (missing.length === 0) {
    const cleanVer = v => v?.match(/[\d.]+/)?.[0] || ''
    const info = checks.filter(c => c.ver).map(c => `${c.name} ${pc.dim(cleanVer(c.ver))}`).join(' · ')
    p.log.success(`環境檢查通過  ${info}`)
    return true
  }

  // 顯示狀態
  const checkLines = checks.map(c => {
    const icon = c.ok ? pc.green('✔') : pc.red('✘')
    const info = c.ok ? pc.dim(c.ver?.slice(0, 25) || 'OK') : pc.red(c.failLabel)
    return `  ${icon} ${c.name.padEnd(12)} ${info}`
  }).join('\n')
  p.log.info(`環境檢查\n${checkLines}`)

  const confirm = await p.confirm({
    message: `需要處理 ${missing.map(m => m.actionLabel).join('、')}，繼續？  Y 確認 · n 取消`,
    initialValue: true,
  })
  if (p.isCancel(confirm) || !confirm) {
    p.log.warn('請手動安裝後重新執行')
    p.outro(pc.red('環境準備失敗'))
    process.exit(1)
  }

  // 記錄哪些工具本次被安裝（影響後續步驟的判斷）
  const justInstalled = new Set()

  for (const m of missing) {
    const s = p.spinner()

    if (m.name === 'Homebrew') {
      s.start('安裝 Homebrew...')
      const ok = run('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
      s.stop(ok ? `${pc.green('✔')} Homebrew 安裝完成` : pc.red('Homebrew 安裝失敗'))
      if (!ok) {
        p.log.warn(`Homebrew 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')}`)
        return false
      }
      // Apple Silicon: brew 安裝後需要更新 PATH 才能立即使用
      run('eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || eval "$(/usr/local/bin/brew shellenv)" 2>/dev/null')
      justInstalled.add('brew')
    }

    if (m.name === 'nvm') {
      s.start('安裝 nvm（Node 版本管理）...')
      const ok = run('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash')
      s.stop(ok ? `${pc.green('✔')} nvm 安裝完成` : pc.red('nvm 安裝失敗'))
      if (!ok) {
        p.log.warn(`nvm 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash')}`)
        return false
      }
      // 安裝後設定 NVM_DIR，讓後續 runNvm 不需要重啟終端就能使用
      if (!process.env.NVM_DIR) process.env.NVM_DIR = `${process.env.HOME}/.nvm`
      justInstalled.add('nvm')
    }

    if (m.name === 'Node.js') {
      s.start('安裝 Node.js...')
      let ok = false
      const nvmAvailable = nvmOk || justInstalled.has('nvm') // 本次剛裝的也算
      if (nvmAvailable) {
        ok = runNvm('install --lts')
      } else if (has('brew')) {
        ok = run('brew install node')
      }
      s.stop(ok ? `${pc.green('✔')} Node.js 安裝完成 ${pc.dim(ver('node') || '')}` : pc.red('Node.js 安裝失敗'))
      if (!ok) {
        p.log.warn(`Node.js 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('nvm install --lts')}  或  ${pc.cyan('brew install node')}`)
        return false
      }
    }

    if (m.name === 'pnpm') {
      s.start('安裝 pnpm...')
      let ok = false
      if (has('corepack')) {
        run('corepack enable')
        ok = run('corepack prepare pnpm@latest --activate')
      }
      if (!ok) ok = run('npm install -g pnpm')
      s.stop(ok && has('pnpm') ? `${pc.green('✔')} pnpm 安裝完成 ${pc.dim(ver('pnpm'))}` : pc.red('pnpm 安裝失敗'))
      if (!has('pnpm')) {
        p.log.warn(`pnpm 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('npm install -g pnpm')}`)
        return false
      }
    }

    if (m.name === 'gh CLI') {
      s.start('安裝 gh CLI...')
      let ok = false
      if (has('brew')) {
        ok = run('brew install gh')
      }
      s.stop(ok ? `${pc.green('✔')} gh CLI 安裝完成 ${pc.dim(ver('gh'))}` : pc.red('gh CLI 安裝失敗'))
      if (!ok) {
        p.log.warn(`gh CLI 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('brew install gh')}  或  ${pc.cyan('https://cli.github.com')}`)
        p.outro(pc.red('環境準備失敗'))
        process.exit(1)
      }
    }

    if (m.name === 'gh 登入') {
      p.log.info(`需要登入 GitHub，請在瀏覽器完成授權：\n  ${pc.dim('按 Enter 開啟瀏覽器 → 複製一次性驗證碼 → 完成授權')}`)
      const ok = run('gh auth login --web')
      if (!ok) {
        p.log.warn(
          `GitHub 登入失敗，請手動執行後重新運行：\n` +
          `  ${pc.cyan('gh auth login')}          # 互動式（瀏覽器）\n` +
          `  ${pc.cyan('gh auth login --with-token')}  # 貼上 Personal Access Token`
        )
        p.outro(pc.red('環境準備失敗'))
        process.exit(1)
      }
      p.log.success(`${pc.green('✔')} GitHub 登入完成`)
    }

    if (m.name === 'claude CLI') {
      s.start('安裝 Claude CLI...')
      const ok = run('npm install -g @anthropic-ai/claude-code')
      s.stop(ok && has('claude') ? `${pc.green('✔')} Claude CLI 安裝完成 ${pc.dim(ver('claude'))}` : pc.red('Claude CLI 安裝失敗'))
      if (!ok || !has('claude')) {
        p.log.warn(`Claude CLI 安裝失敗，請手動安裝後重新執行：\n  ${pc.cyan('npm install -g @anthropic-ai/claude-code')}`)
        p.outro(pc.red('環境準備失敗'))
        process.exit(1)
      }
    }
  }

  p.log.success('環境就緒')
  return true
}
