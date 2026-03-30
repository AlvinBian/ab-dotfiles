/**
 * Plugin manifest 版本追蹤
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

/**
 * 生成 plugin manifest
 *
 * @param {string} distDir - dist/ 目錄路徑
 * @param {Object} contents - { commands: number, agents: number, rules: number, hooks: number, stacks: number }
 * @returns {Object} manifest 物件
 */
export function generateManifest(distDir, contents) {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(distDir, '..', 'package.json'), 'utf8'))

  const manifest = {
    version: pkg.version || '0.0.0',
    buildTime: new Date().toISOString(),
    contents,
    checksum: null,
  }

  // 計算 release 目錄的 checksum
  const releaseDir = path.join(distDir, 'release')
  if (fs.existsSync(releaseDir)) {
    const hash = createHash('sha256')
    const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.plugin')).sort()
    for (const f of files) {
      hash.update(fs.readFileSync(path.join(releaseDir, f)))
    }
    manifest.checksum = `sha256:${hash.digest('hex').slice(0, 16)}`
  }

  return manifest
}

/**
 * 寫入 manifest.json
 */
export function saveManifest(manifest, distDir) {
  const releaseDir = path.join(distDir, 'release')
  fs.mkdirSync(releaseDir, { recursive: true })
  const manifestPath = path.join(releaseDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return manifestPath
}
