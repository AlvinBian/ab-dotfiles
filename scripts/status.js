function generateStatusReport() {
	const config = loadConfig(); // 加载配置数据
	const commands = config.commands || [];
	const agents = config.agents || [];
	const rules = config.rules || [];
	const hooks = config.hooks || [];

	// 添加调试日志（可临时启用）
	console.log(
		"Commands:",
		commands.length,
		"Valid:",
		commands.filter((c) => c.valid).length,
	);
	console.log(
		"Agents:",
		agents.length,
		"Valid:",
		agents.filter((a) => a.valid).length,
	);
	console.log(
		"Rules:",
		rules.length,
		"Valid:",
		rules.filter((r) => r.valid).length,
	);
	console.log(
		"Hooks:",
		hooks.length,
		"Valid:",
		hooks.filter((h) => h.valid).length,
	);

	// 计算配置健康度：有效配置项 / 总配置项
	const totalConfigs =
		commands.length + agents.length + rules.length + hooks.length;
	const validConfigs =
		commands.filter((c) => c.valid).length +
		agents.filter((a) => a.valid).length +
		rules.filter((r) => r.valid).length +
		hooks.filter((h) => h.valid).length;

	// 防止除零
	const healthPercentage =
		totalConfigs > 0 ? (validConfigs / totalConfigs) * 100 : 0;

	// 确保数字统计正确
	const commandCount = commands.length;
	const agentCount = agents.length;
	const ruleCount = rules.length;
	const hookCount = hooks.length;

	// 生成 HTML 报告
	const reportHtml = `
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
        }
        .card-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .card {
            background-color: #333;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            color: white;
            font-size: 24px; /* 增大字体大小 */
        }
        .card h2 {
            margin: 0;
            font-size: 36px; /* 进一步增大标题字体大小 */
        }
        .card p {
            margin: 5px 0 0;
            font-size: 18px; /* 增大描述文字的字体大小 */
        }
        /* 新增：折叠面板样式 */
        .panel {
            margin: 10px 0;
            border: 1px solid #444;
            border-radius: 8px;
            overflow: hidden;
        }
        .panel-header {
            background-color: #222;
            padding: 10px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 16px;
            color: white;
        }
        .panel-body {
            padding: 10px;
            background-color: #333;
            display: none;
        }
        .panel.expanded .panel-body {
            display: block;
        }
        .panel-header::after {
            content: '▼';
            font-size: 12px;
            transition: transform 0.3s ease;
        }
        .panel.expanded .panel-header::after {
            transform: rotate(180deg);
        }
    </style>
    <div class="card-container">
        <div class="card">
            <h2>${healthPercentage.toFixed(0)}%</h2>
            <p>配置健康度</p>
        </div>
        <div class="card">
            <h2>${commandCount}</h2>
            <p>Commands</p>
        </div>
        <div class="card">
            <h2>${agentCount}</h2>
            <p>Agents</p>
        </div>
        <div class="card">
            <h2>${ruleCount}</h2>
            <p>Rules</p>
        </div>
        <div class="card">
            <h2>${hookCount}</h2>
            <p>Hooks</p>
        </div>

        <!-- 新增：环境变量健康检查面板 -->
        <div class="panel" data-expanded="false">
            <div class="panel-header">环境变量健康检查</div>
            <div class="panel-body">
                <ul>
                    <li>❌ 缺少 22 个：AI_MODEL, AI_EFFORT, AI_TIMEOUT, AI_REPO_MODEL, AI_REPO_EFFORT, AI_REPO_TIMEOUT, AI_REPO_CACHE, AI_REPO_MAX_CATEGORIES, AI_REPO_MAX_TECHS, GITHUB_ORG, GH_API_TIMEOUT, GH_PER_PAGE, GH_REPO_ANALYZE_TIMEOUT, GH_COMMIT_SEARCH_LIMIT, NPM_FETCH_TIMEOUT, NPM_BATCH_SIZE, ECC_SOURCES, SCAN_DIR_MAX_DEPTH, DOC_TRUNCATE_LINES, DESC_MAX_LENGTH, BACKUP_MAX_COUNT, PROGRESS_BAR_SIZE</li>
                    <li>⚠️ 空值 1 个：ANTHROPIC_API_KEY</li>
                </ul>
            </div>
        </div>

        <!-- 新增：Deny规则面板 -->
        <div class="panel" data-expanded="false">
            <div class="panel-header">Deny 安全规则</div>
            <div class="panel-body">
                <ul>
                    <li>Read(node_modules/**)</li>
                    <li>Read(dist/**)</li>
                    <li>Read(build/**)</li>
                    <li>Read(.next/**)</li>
                    <li>Read(.nuxt/**)</li>
                    <li>Read(coverage/**)</li>
                    <li>Read(*.min.js)</li>
                    <li>Read(*.min.css)</li>
                    <li>Read(*.map)</li>
                    <li>Bash(rm -rf /)</li>
                    <li>Bash(rm -rf ~)</li>
                    <li>Bash(DROP TABLE *)</li>
                    <li>Bash(DROP DATABASE *)</li>
                </ul>
            </div>
        </div>
    </div>

    <script>
        // 添加折叠功能
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.parentElement;
                panel.classList.toggle('expanded');
            });
        });
    </script>
`;

	fs.writeFileSync("dist/status-report.html", reportHtml);
}
