/**
 * 全域常量配置（集中管理，避免魔術數字）
 */

// ── 備份 ──────────────────────────────────────────────────────────
export const BACKUP_MAX_COUNT = 10         // 保留最近 N 次備份

// ── GitHub API ───────────────────────────────────────────────────
export const GH_API_TIMEOUT = 15000        // gh api 超時（ms）
export const GH_PER_PAGE = 100             // 每頁返回數量
export const GH_REPO_ANALYZE_TIMEOUT = 30000 // 單個 repo 分析超時
export const GH_COMMIT_SEARCH_LIMIT = 100  // search/commits 最大返回數

// ── npm registry ─────────────────────────────────────────────────
export const NPM_FETCH_TIMEOUT = 5000      // npm registry 查詢超時
export const NPM_BATCH_SIZE = 10           // 並行查詢批次大小

// ── AI 生成 ──────────────────────────────────────────────────────
export const AI_TIMEOUT = 60000            // Claude CLI 生成超時
export const AI_MODEL = process.env.ANTHROPIC_MODEL || null  // null = 未配置
export const AI_CONCURRENCY = 3            // AI 生成並發數

// ── 掃描 ─────────────────────────────────────────────────────────
export const SCAN_DIR_MAX_DEPTH = 1        // 遞迴掃描目錄最大深度
export const DOC_TRUNCATE_LINES = 100      // README 等文件截斷行數
export const DESC_MAX_LENGTH = 40          // 倉庫描述截斷長度

// ── 進度條 ───────────────────────────────────────────────────────
export const PROGRESS_BAR_SIZE = 26        // 進度條寬度（字元數）
