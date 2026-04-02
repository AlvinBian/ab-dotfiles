/**
 * 全局配置部署 — settings.json 合併
 *
 * 職責：
 *   將 ab-dotfiles 的全局配置安全地部署到 ~/.claude/，
 *   採用「合併」而非「覆蓋」策略，保留用戶已有的自訂設定。
 */

import fs from "node:fs";
import path from "node:path";

const CLAUDE_DIR_GETTER = () => {
	const HOME = process.env.HOME;
	if (!HOME) throw new Error("HOME 環境變數未設定，無法部署全局設定");
	return path.join(HOME, ".claude");
};

/**
 * 部署 settings.json（merge 策略）
 *
 * 合併規則：
 *   - permissions.allow / deny：取聯集（去重），保留用戶已有的規則
 *   - model / effortLevel / env：只在未設定時寫入（不覆蓋用戶偏好）
 *   - autoMemoryEnabled：只在 undefined 時寫入
 *
 * @param {Object} template - 要合併的模板設定（來自 claude/settings.template.json）
 * @param {string[]} [template.permissions.allow] - 允許的 Bash/Read/Write 規則
 * @param {string[]} [template.permissions.deny] - 禁止的危險命令規則
 * @param {string} [template.model] - 預設 AI 模型（如 'sonnet'）
 * @param {string} [template.effortLevel] - 推理強度（如 'medium'）
 * @param {boolean} [template.autoMemoryEnabled] - 是否啟用自動記憶
 * @param {Object} [template.env] - 環境變數設定（如 MAX_THINKING_TOKENS）
 * @returns {{ path: string, permissionsAdded: number, isNew: boolean }}
 *   path: settings.json 的絕對路徑
 *   permissionsAdded: 新增的 allow 規則數量
 *   isNew: 是否為首次建立（原本不存在）
 */
export function deploySettings(template) {
	const settingsPath = path.join(CLAUDE_DIR_GETTER(), "settings.json");
	let existing = {};

	if (fs.existsSync(settingsPath)) {
		try {
			existing = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
		} catch {
			/* settings.json 格式錯誤則略過，從空物件合併 */
		}
	}

	const merged = { ...existing };

	// permissions: 完全不動 — 用戶自行在 Claude Code 中配置
	// ab-dotfiles 不介入 permissions 管理，避免覆蓋用戶偏好
	if (existing.permissions) {
		merged.permissions = existing.permissions;
	}

	// model/effortLevel: 不寫入，由用戶自行在 Claude Code 中設定
	if (existing.autoMemoryEnabled === undefined)
		merged.autoMemoryEnabled = template.autoMemoryEnabled;

	// env: 逐 key 合併（保留用戶已有的值，只新增 template 中的新 key）
	if (template.env) {
		merged.env = { ...template.env, ...(existing.env || {}) };
	}

	const isNew = !fs.existsSync(settingsPath);
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`);

	return {
		path: settingsPath,
		permissionsAdded:
			merged.permissions.allow.length -
			(existing.permissions?.allow?.length || 0),
		isNew,
	};
}
