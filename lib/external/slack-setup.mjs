/**
 * Slack 通知設定 — setup 時互動式配置
 *
 * 三種模式：
 * 1. Channel（推薦）— 搜尋/引導建立專屬頻道
 * 2. DM — 私發給自己
 * 3. 關閉 — 不啟用 Slack 通知
 *
 * 通知透過 claude.ai Slack MCP 發送，不需要 Incoming Webhook 或 Bot Token。
 */

import * as p from "@clack/prompts";
import { BACK, handleCancel } from "../cli/prompts.mjs";
import { env } from "../core/env.mjs";

/**
 * 互動式 Slack 通知設定精靈
 *
 * 引導用戶選擇通知模式（Channel / DM / 關閉），
 * 並收集所需的 Channel ID 或 User ID。
 * 若已有設定則先詢問是否保持不變。
 *
 * @param {Object|null} prev - 上次的 session 設定（{ slackChannel, slackMode }）
 * @returns {Promise<{ channelId: string, mode: string } | null>} 設定結果，取消時返回 null
 */
export async function setupSlackNotify(prev) {
	// 已有設定 → 顯示當前狀態
	const currentChannel =
		env("SLACK_NOTIFY_CHANNEL", "") || prev?.slackChannel || "";
	const currentMode = env("SLACK_NOTIFY_MODE", "") || prev?.slackMode || "";
	const currentChannelName =
		env("SLACK_NOTIFY_CHANNEL_NAME", "") || prev?.slackChannelName || "";

	// prev !== null 才詢問是否保持不變（全部清除後 prev = null，強制重新設定）
	if (prev && currentChannel && currentMode) {
		const channelLabel = currentChannelName || currentChannel;
		const displayLabel =
			currentMode === "channel"
				? `#${channelLabel} (${currentChannel})`
				: currentMode === "dm"
					? "DM 私發"
					: "已關閉";
		const keep = handleCancel(
			await p.confirm({
				message: `Slack 通知：${displayLabel}，保持不變？`,
				initialValue: true,
			}),
		);
		if (keep === true) {
			return {
				channelId: currentChannel,
				channelName: currentChannelName,
				mode: currentMode,
			};
		}
	}

	const action = handleCancel(
		await p.select({
			message: "Slack 通知設定",
			options: [
				{
					value: "channel",
					label: "📢 專屬 Channel（推薦）",
					hint: "所有通知集中管理",
				},
				{ value: "dm", label: "💬 DM 私發給自己", hint: "零配置，立即可用" },
				{ value: "off", label: "🔕 關閉通知" },
			],
		}),
	);

	if (action === BACK) return null;

	if (action === "off") {
		return { channelId: "", mode: "off" };
	}

	if (action === "dm") {
		// User ID 由 Claude session 首次使用時透過 Slack MCP 自動查詢並快取
		const userId = env("SLACK_NOTIFY_USER_ID", "");
		p.log.success(
			`已設定 DM 模式${userId ? `（${userId}）` : "（首次發送時自動查詢 User ID）"}`,
		);
		return { channelId: userId, userId, mode: "dm" };
	}

	// channel 模式：確認頻道 → 取得 Channel ID
	let username = "";
	try {
		const { execSync } = await import("node:child_process");
		const login = execSync("gh api user --jq .login", {
			encoding: "utf8",
			timeout: 5000,
		})
			.trim()
			.toLowerCase();
		const name = execSync("gh api user --jq .name", {
			encoding: "utf8",
			timeout: 5000,
		})
			.trim()
			.toLowerCase();
		username = name
			? name.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
			: login;
	} catch {
		/* gh not available */
	}

	const channelName = username ? `${username}-notify` : "claude-code-notify";

	const hasChannel = handleCancel(
		await p.select({
			message: `通知頻道 #${channelName}`,
			options: [
				{
					value: "exists",
					label: "🔗 已有此頻道，貼上 Link",
					hint: "右鍵頻道名 → Copy link",
				},
				{
					value: "create",
					label: "➕ 建立新頻道",
					hint: `自動複製 ${channelName} 到剪貼板`,
				},
			],
		}),
	);

	if (hasChannel === BACK) return null;

	if (hasChannel === "create") {
		try {
			const { execFileSync } = await import("node:child_process");
			execFileSync("pbcopy", [], {
				input: channelName,
				stdio: ["pipe", "pipe", "pipe"],
			});
			p.log.success(`已複製 "${channelName}" 到剪貼板`);
			execFileSync("open", ["slack://channel?team=&id=new"]);
		} catch {
			/* ignore */
		}
		p.log.info(`請在 Slack 中：
  1. 已打開 Slack，直接貼上名稱（⌘V）
  2. 建議設為私人頻道
  3. 建立後回來貼上 Channel Link`);
	}

	const manualInput = handleCancel(
		await p.text({
			message: "貼上 Channel Link 或 ID（在頻道名稱右鍵 → Copy link）",
			placeholder: "https://xxx.slack.com/archives/C07XXXXXX 或 C07XXXXXX",
		}),
	);
	if (!manualInput || manualInput === BACK) return null;
	const idMatch = manualInput.match(/\b(C[A-Z0-9]{8,})\b/);
	const channelId = idMatch ? idMatch[1] : manualInput.trim();
	if (!channelId.startsWith("C")) {
		p.log.error("無效的 Channel ID，請重新貼上 Channel Link");
		return null;
	}
	// User ID 不在 setup 收集，用戶說「發給我」時 Claude 會從 $SLACK_NOTIFY_USER_ID 讀取
	// 若未設定，Claude 會提示用戶去 ~/.claude/.env 加上 SLACK_NOTIFY_USER_ID=Uxxxxxxx
	const userId = env("SLACK_NOTIFY_USER_ID", "");

	p.log.success(`已設定 #${channelName} (${channelId})`);
	return { channelId, channelName, userId, mode: "channel" };
}
