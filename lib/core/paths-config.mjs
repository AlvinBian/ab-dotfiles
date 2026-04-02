/**
 * 路徑配置 — 集中管理所有硬編碼路徑
 *
 * 職責：提供統一的路徑常數，避免在各檔案重複定義相同路徑。
 */

import os from "node:os";
import path from "node:path";

// ── Home & Claude 主目錄 ──────────────────────────────────────────

export const HOME = os.homedir();
export const CLAUDE_HOME = path.join(HOME, ".claude");

// ── Claude 配置檔案 ────────────────────────────────────────────────

export const CLAUDE_SETTINGS = path.join(CLAUDE_HOME, "settings.json");
export const CLAUDE_ENV = path.join(CLAUDE_HOME, ".env");
export const CLAUDE_HOOKS = path.join(CLAUDE_HOME, "hooks.json");

// ── Claude 檔名（相對於 repo）  ─────────────────────────────────

export const CLAUDE_MD = "CLAUDE.md";

// ── Claude 子目錄 ──────────────────────────────────────────────────

export const CLAUDE_RULES_DIR = "rules";
export const CLAUDE_COMMANDS_DIR = "commands";
export const CLAUDE_AGENTS_DIR = "agents";

// ── 完整路徑（HOME 級別）  ────────────────────────────────────────

export const CLAUDE_RULES_HOME = path.join(CLAUDE_HOME, CLAUDE_RULES_DIR);
export const CLAUDE_COMMANDS_HOME = path.join(CLAUDE_HOME, CLAUDE_COMMANDS_DIR);
export const CLAUDE_AGENTS_HOME = path.join(CLAUDE_HOME, CLAUDE_AGENTS_DIR);

// ── 專案目錄 ────────────────────────────────────────────────────────

export const PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");
