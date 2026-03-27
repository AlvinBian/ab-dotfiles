/**
 * 全域常量配置（從 .env 讀取，集中管理）
 */

import { env } from './env.mjs'

// ── 備份 ──────────────────────────────────────────────────────────
export const BACKUP_MAX_COUNT = env('BACKUP_MAX_COUNT', 10)

// ── GitHub API ───────────────────────────────────────────────────
export const GH_API_TIMEOUT = env('GH_API_TIMEOUT', 15000)
export const GH_PER_PAGE = env('GH_PER_PAGE', 100)
export const GH_REPO_ANALYZE_TIMEOUT = env('GH_REPO_ANALYZE_TIMEOUT', 30000)
export const GH_COMMIT_SEARCH_LIMIT = env('GH_COMMIT_SEARCH_LIMIT', 100)

// ── npm registry ─────────────────────────────────────────────────
export const NPM_FETCH_TIMEOUT = env('NPM_FETCH_TIMEOUT', 5000)
export const NPM_BATCH_SIZE = env('NPM_BATCH_SIZE', 10)

// ── AI 生成 ──────────────────────────────────────────────────────
export const AI_TIMEOUT = env('AI_TIMEOUT', 60000)
export const AI_MODEL = env('AI_MODEL', 'haiku')
export const AI_EFFORT = env('AI_EFFORT', 'low')
export const AI_CONCURRENCY = env('AI_CONCURRENCY', 3)
// ── Per-repo AI 分類 ──────────────────────────────────────────
export const AI_REPO_MODEL = env('AI_REPO_MODEL', 'sonnet')
export const AI_REPO_EFFORT = env('AI_REPO_EFFORT', 'low')
export const AI_REPO_TIMEOUT = env('AI_REPO_TIMEOUT', 60000)
export const AI_REPO_CACHE = env('AI_REPO_CACHE', true)
export const AI_REPO_MAX_CATEGORIES = env('AI_REPO_MAX_CATEGORIES', 6)
export const AI_REPO_MAX_TECHS = env('AI_REPO_MAX_TECHS', 15)

// ── 掃描 ─────────────────────────────────────────────────────────
export const SCAN_DIR_MAX_DEPTH = env('SCAN_DIR_MAX_DEPTH', 1)
export const DOC_TRUNCATE_LINES = env('DOC_TRUNCATE_LINES', 100)
export const DESC_MAX_LENGTH = env('DESC_MAX_LENGTH', 40)

// ── 進度條 ───────────────────────────────────────────────────────
export const PROGRESS_BAR_SIZE = env('PROGRESS_BAR_SIZE', 26)

// ── GitHub Org ───────────────────────────────────────────────────
export const GITHUB_ORG = env('GITHUB_ORG', '')
