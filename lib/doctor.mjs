/**
 * 環境檢查 + 自動修復
 *
 * 檢查順序：Homebrew → nvm → Node.js → pnpm → gh CLI → gh 登入
 */

import { execSync } from 'child_process'
import * as p from '@clack/prompts'
import pc from 'picocolors'

function has(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true } catch { return false }
}

function ver(cmd, flag = '--version') {
  try { return execSync(`${cmd} ${flag}`, { encoding: 'utf8', stdio: 'pipe' }).trim().split('\n')[0] } catch { return null }
}

function run(cmd) {
  try { execSync(cmd, { stdio: 'inherit' }); return true } catch { return false }
}

export async function ensureEnvironment() {
  const checks = [
    { name: 'Homebrew', ok: has('brew'), ver: ver('brew', '-v')?.match(/[\d.]+/)?.[0] },
    { name: 'nvm', ok: !!process.env.NVM_DIR, ver: (() => { try { return execSync('bash -c "source $NVM_DIR/nvm.sh 2>/dev/null && nvm --version"', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 }).trim() } catch { return process.env.NVM_DIR ? 'installed' : null } })() },
    { name: 'Node.js', ok: has('node'), ver: ver('node') },
    { name: 'pnpm', ok: has('pnpm'), ver: ver('pnpm') },
    { name: 'gh CLI', ok: has('gh'), ver: ver('gh') },
    { name: 'gh 登入', ok: (() => { try { execSync('gh auth status', { stdio: 'pipe' }); return true } catch { return false } })(), ver: null },
  ]

  const missing = checks.filter(c => !c.ok)

  // 全部通過
  if (missing.length === 0) {
    const cleanVer = v => v?.match(/[\d.]+/)?.[0] || ''
    const info = checks.filter(c => c.ver && c.ver !== 'logged in').map(c => `${c.name} ${pc.dim(cleanVer(c.ver))}`).join(' · ')
    p.log.success(`環境檢查通過  ${info}`)
    return true
  }

  // 顯示狀態
  const checkLines = checks.map(c => {
    const icon = c.ok ? pc.green('✔') : pc.red('✘')
    const info = c.ok ? pc.dim(c.ver?.slice(0, 25) || 'OK') : pc.red('未安裝')
    return `  ${icon} ${c.name.padEnd(12)} ${info}`
  }).join('\n')
  p.log.info(`環境檢查\n${checkLines}`)

  const confirm = await p.confirm({
    message: `需要安裝 ${missing.map(m => m.name).join('、')}，自動安裝？  Y 確認 · n 取消`,
    initialValue: true,
  })
  if (p.isCancel(confirm) || !confirm) {
    p.log.warn('請手動安裝後重新執行')
    process.exit(1)
  }

  for (const m of missing) {
    const s = p.spinner()

    if (m.name === 'Homebrew') {
      s.start('安裝 Homebrew...')
      const ok = run('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
      s.stop(ok ? `${pc.green('✔')} Homebrew 安裝完成` : pc.red('Homebrew 安裝失敗'))
      if (!ok) return false
    }

    if (m.name === 'nvm') {
      s.start('安裝 nvm（Node 版本管理）...')
      const ok = run('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash')
      s.stop(ok ? `${pc.green('✔')} nvm 安裝完成` : pc.red('nvm 安裝失敗'))
      if (ok) p.log.message(`  ${pc.dim('請重啟終端後執行：nvm install --lts')}`)
      if (!ok) return false
    }

    if (m.name === 'Node.js') {
      s.start('安裝 Node.js...')
      let ok = false
      if (process.env.NVM_DIR || has('nvm')) {
        ok = run('nvm install --lts')
      } else if (has('brew')) {
        ok = run('brew install node')
      }
      s.stop(ok ? `${pc.green('✔')} Node.js 安裝完成 ${pc.dim(ver('node'))}` : pc.red('Node.js 安裝失敗'))
      if (!ok) return false
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
      if (!has('pnpm')) return false
    }

    if (m.name === 'gh CLI') {
      s.start('安裝 gh CLI...')
      const ok = has('brew') ? run('brew install gh') : false
      s.stop(ok ? `${pc.green('✔')} gh CLI 安裝完成 ${pc.dim(ver('gh'))}` : pc.red('gh CLI 安裝失敗'))
      if (!ok) { p.log.message(`  ${pc.dim('手動安裝：https://cli.github.com')}`); return false }
    }

    if (m.name === 'gh 登入') {
      s.stop('')
      p.log.info('需要登入 GitHub，將開啟瀏覽器授權...')
      const ok = run('gh auth login')
      if (!ok) return false
      p.log.success(`${pc.green('✔')} GitHub 登入完成`)
    }
  }

  p.log.success('環境就緒')
  return true
}
