/**
 * 全域常量配置（從 .env 讀取，集中管理）
 *
 * 所有常量皆透過 env(key, defaultValue) 讀取，
 * 未設定時使用括號內的預設值。
 * 可在專案根目錄的 .env 中覆蓋任意項目。
 */

import fs from 'fs'
import path from 'path'
import { env } from './env.mjs'
import { getDirname } from './paths.mjs'

// ── 版本（從 package.json 讀取）─────────────────────────────────
const __dirname = getDirname(import.meta)
let _version = '0.0.0'
try { _version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')).version } catch { /* fallback */ }
export const APP_VERSION = _version

// ── 備份 ──────────────────────────────────────────────────────────
// 保留最近 10 份備份，超出後自動刪除最舊的
export const BACKUP_MAX_COUNT = env('BACKUP_MAX_COUNT', 10)

// ── GitHub API ───────────────────────────────────────────────────
// 一般 API 請求逾時（毫秒）
export const GH_API_TIMEOUT = env('GH_API_TIMEOUT', 15000)
// 每頁最大回傳數（GitHub API 上限為 100）
export const GH_PER_PAGE = env('GH_PER_PAGE', 100)
// 單一 repo 分析逾時（毫秒），分析任務較重故設較長
export const GH_REPO_ANALYZE_TIMEOUT = env('GH_REPO_ANALYZE_TIMEOUT', 30000)
// commit 搜尋上限（避免掃描過多歷史紀錄）
export const GH_COMMIT_SEARCH_LIMIT = env('GH_COMMIT_SEARCH_LIMIT', 100)

// ── npm registry ─────────────────────────────────────────────────
// npm 套件資訊請求逾時（毫秒）
export const NPM_FETCH_TIMEOUT = env('NPM_FETCH_TIMEOUT', 5000)
// 每批次同時請求的套件數量
export const NPM_BATCH_SIZE = env('NPM_BATCH_SIZE', 10)

// ── AI 生成 ──────────────────────────────────────────────────────
// AI 請求整體逾時（毫秒）
export const AI_TIMEOUT = env('AI_TIMEOUT', 60000)
// 預設 AI 模型（haiku = 最低成本）
export const AI_MODEL = env('AI_MODEL', 'haiku')
// 推理精度等級（low / medium / high）
export const AI_EFFORT = env('AI_EFFORT', 'low')
// 同時進行的 AI 任務上限
// AI 並行數：Infinity = 無限制（Claude CLI 內建 rate limiting）
export const AI_CONCURRENCY = env('AI_CONCURRENCY', Infinity)
// GitHub API 並行數：8（防止觸發 rate limit 403）
export const GH_CONCURRENCY = env('GH_CONCURRENCY', 8)

// ── Per-repo AI 分類 ──────────────────────────────────────────
// repo 分析使用 sonnet，品質較 haiku 高
export const AI_REPO_MODEL = env('AI_REPO_MODEL', 'sonnet')
export const AI_REPO_EFFORT = env('AI_REPO_EFFORT', 'low')
export const AI_REPO_TIMEOUT = env('AI_REPO_TIMEOUT', 60000)
// 是否快取 repo 分析結果（避免重複呼叫 AI）
export const AI_REPO_CACHE = env('AI_REPO_CACHE', true)
// 單一 repo 最多分配幾個技術分類
export const AI_REPO_MAX_CATEGORIES = env('AI_REPO_MAX_CATEGORIES', 6)
// 單一 repo 最多列出幾項技術棧
export const AI_REPO_MAX_TECHS = env('AI_REPO_MAX_TECHS', 15)

// ── ECC AI 推薦（匹配已有分類到資源，haiku 足夠）──
export const AI_ECC_MODEL = env('AI_ECC_MODEL', 'haiku')
export const AI_ECC_EFFORT = env('AI_ECC_EFFORT', 'low')
// ECC 任務量較大，逾時設定為 90 秒
export const AI_ECC_TIMEOUT = env('AI_ECC_TIMEOUT', 90000)

// ── 開發者畫像（裝飾性摘要，最低成本）──
export const AI_PROFILE_MODEL = env('AI_PROFILE_MODEL', 'haiku')
export const AI_PROFILE_EFFORT = env('AI_PROFILE_EFFORT', 'low')

// ── 掃描 ─────────────────────────────────────────────────────────
// 目錄掃描最大深度（1 = 只掃第一層子目錄）
export const SCAN_DIR_MAX_DEPTH = env('SCAN_DIR_MAX_DEPTH', 1)
// 文件截斷行數（避免傳入過長內容給 AI）
export const DOC_TRUNCATE_LINES = env('DOC_TRUNCATE_LINES', 100)
// 描述字串最大長度（截斷 AI 生成的摘要）
export const DESC_MAX_LENGTH = env('DESC_MAX_LENGTH', 40)

// ── 進度條 ───────────────────────────────────────────────────────
// 進度條的字元寬度（26 個字元）
export const PROGRESS_BAR_SIZE = env('PROGRESS_BAR_SIZE', 26)

// ── GitHub Org ───────────────────────────────────────────────────
// 目標 GitHub 組織名稱（空字串表示只掃個人 repo）
export const GITHUB_ORG = env('GITHUB_ORG', '')
