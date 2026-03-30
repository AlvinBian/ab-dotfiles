/**
 * 確定性分類引擎
 *
 * 優先用 awesome-* 查表分類（零 AI），查不到的返回 null 交給 AI。
 *
 * 資料來源：
 *   - node-packages.json（awesome-nodejs + Vue 生態）
 *   - php-packages.json（awesome-php）
 *   - categories.json（標準分類詞表）
 */

import fs from 'fs'
import path from 'path'
import { getDirname } from '../core/paths.mjs'
import { execSync } from 'child_process'

const __dirname = getDirname(import.meta)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const GENERATED_DIR = path.join(__dirname, '_generated') // CI 預建（tracked）
const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'taxonomy') // 本地 build（untracked）

let _nodePackages = null
let _phpPackages = null
let _categories = null

function loadData() {
  if (_nodePackages) return

  // 優先順序：CI 預建 → 本地快取 → 即時 build
  let dataDir
  if (fs.existsSync(path.join(GENERATED_DIR, 'node-packages.json'))) {
    dataDir = GENERATED_DIR
  } else if (fs.existsSync(path.join(CACHE_DIR, 'node-packages.json'))) {
    dataDir = CACHE_DIR
  } else {
    execSync('node lib/taxonomy/build.mjs', { cwd: REPO_ROOT, stdio: 'inherit' })
    dataDir = CACHE_DIR
  }

  _nodePackages = JSON.parse(fs.readFileSync(path.join(dataDir, 'node-packages.json'), 'utf8'))
  _phpPackages = JSON.parse(fs.readFileSync(path.join(dataDir, 'php-packages.json'), 'utf8'))
  _categories = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf8'))
}

/**
 * 正規化套件名（去 scope、轉小寫、去 .js 後綴）
 */
function normalize(name) {
  return name.toLowerCase()
    .replace(/^@/, '').replace(/\//g, '-')
    .replace(/\.js$/i, '').replace(/\.ts$/i, '')
}

/**
 * 分類單一 npm 套件
 * @returns {string|null} 標準分類名，查不到返回 null
 */
export function classifyNpm(packageName) {
  loadData()
  const lower = packageName.toLowerCase()
  return _nodePackages[lower] || _nodePackages[normalize(lower)] || null
}

/**
 * 分類單一 PHP 套件
 * @returns {string|null}
 */
export function classifyPhp(packageName) {
  loadData()
  return _phpPackages[packageName.toLowerCase()] || null
}

/**
 * 批量分類（npm + PHP），返回 { classified, unclassified }
 *
 * @param {string[]} npmDeps
 * @param {string[]} phpDeps
 * @returns {{ classified: Map<category, string[]>, unclassified: string[] }}
 */
export function classifyBatch(npmDeps = [], phpDeps = []) {
  loadData()
  const classified = new Map()
  const unclassified = []

  for (const dep of npmDeps) {
    const cat = classifyNpm(dep)
    if (cat) {
      if (!classified.has(cat)) classified.set(cat, [])
      classified.get(cat).push(dep)
    } else {
      unclassified.push(dep)
    }
  }

  for (const dep of phpDeps) {
    const cat = classifyPhp(dep)
    if (cat) {
      if (!classified.has(cat)) classified.set(cat, [])
      classified.get(cat).push(dep)
    } else {
      unclassified.push(`[php] ${dep}`)
    }
  }

  return { classified, unclassified }
}

/**
 * 取得標準分類列表
 */
export function getStandardCategories() {
  loadData()
  return _categories.standardCategories
}

/**
 * 查表覆蓋率統計
 */
export function getCoverageStats(npmDeps = [], phpDeps = []) {
  const { classified, unclassified } = classifyBatch(npmDeps, phpDeps)
  const total = npmDeps.length + phpDeps.length
  const covered = total - unclassified.length
  return { total, covered, uncovered: unclassified.length, rate: total ? (covered / total * 100).toFixed(1) + '%' : '0%' }
}
