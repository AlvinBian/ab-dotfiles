/**
 * 報告模組入口（向後相容層）
 *
 * 職責：為了保持向後相容性，此檔案重新匯出位於 ./report/ 目錄下的模組。
 * 新代碼應直接匯入 './report/renderer.mjs' 或 './report/formatters.mjs'。
 */

export {
	badge,
	badgeWithDesc,
	esc,
	getStyles,
	renderBackup,
	renderEcc,
	renderInstalled,
	renderOverview,
	renderStacks,
	section,
} from "./report/formatters.mjs";
export {
	generateReport,
	openInBrowser,
	saveReport,
} from "./report/renderer.mjs";
