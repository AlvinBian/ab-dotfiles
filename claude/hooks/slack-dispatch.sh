#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Claude Code Slack 通知分發器
#
# 透過 Claude CLI MCP 發送 Slack DM（不需要 Bot Token）
# 背景執行，不阻塞 Claude Code hooks
#
# 用法：slack-dispatch.sh <event> [--msg "..."] [--file "..."] [--cmd "..."]
# 分級：P0（必達）P1（重要）P2（資訊）
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

# ── 配置 ──────────────────────────────────────────────────────

# 載入 .env（ab-dotfiles 目錄 → HOME）
for envfile in "$HOME/Documents/MyProjects/ab-dotfiles/.env" "$HOME/.env" "$HOME/.claude/.env"; do
  [ -f "$envfile" ] && . "$envfile" 2>/dev/null && break
done

LEVEL="${CLAUDE_SLACK_LEVEL:-normal}"
MIN_SESSION="${CLAUDE_SLACK_MIN_SESSION_SECS:-300}"
# 統一用 SLACK_NOTIFY_CHANNEL（支持 channel ID 或 user ID）
SLACK_DM_ID="${SLACK_NOTIFY_CHANNEL:-${SLACK_DM_CHANNEL:-}}"
SLACK_MODE="${SLACK_NOTIFY_MODE:-dm}"
[ -z "$SLACK_DM_ID" ] && exit 0
STATE_DIR="/tmp/claude-slack"
SESSION="${CLAUDE_SESSION_ID:-$$}"
SESSION_SHORT="${SESSION:0:8}"

command -v claude >/dev/null 2>&1 || exit 0
mkdir -p "$STATE_DIR"

# ── 工具函式 ──────────────────────────────────────────────────

get_context() {
  REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo 'unknown')")
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")
  PROJECT_INFO="$REPO"
  [ -n "$BRANCH" ] && PROJECT_INFO="$PROJECT_INFO / $BRANCH"
  [ -n "$TICKET" ] && PROJECT_INFO="$PROJECT_INFO · $TICKET"
}

should_notify() {
  local level="$1"
  case "$level" in
    P0) return 0 ;;
    P1) [ "$LEVEL" != "quiet" ] && return 0 || return 1 ;;
    P2) [ "$LEVEL" = "verbose" ] && return 0 || return 1 ;;
  esac
  return 1
}

is_rate_limited() {
  local event="$1"
  local cooldown="${2:-60}"
  local lock="$STATE_DIR/rl_${SESSION_SHORT}_${event}"
  if [ -f "$lock" ]; then
    local now=$(date +%s)
    local mtime=$(stat -f %m "$lock" 2>/dev/null || stat -c %Y "$lock" 2>/dev/null || echo 0)
    [ $(( now - mtime )) -lt "$cooldown" ] && return 0
  fi
  touch "$lock"
  return 1
}

# 背景發送 Slack DM（不阻塞 hook）
send_slack_bg() {
  local msg="$1"
  (
    claude --print --output-format text --model haiku \
      -p "Use slack_send_message to send to channel_id \"$SLACK_DM_ID\". Message:
$msg
Just send it, no commentary." \
      >/dev/null 2>&1
  ) &
  disown 2>/dev/null
}

get_session_duration() {
  local start_file="$STATE_DIR/start_$SESSION_SHORT"
  if [ -f "$start_file" ]; then
    echo $(( $(date +%s) - $(cat "$start_file") ))
  else
    echo 0
  fi
}

# ── 解析參數 ──────────────────────────────────────────────────

EVENT="${1:-}"
shift || true

MSG="" FILE="" CMD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --msg)  MSG="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --cmd)  CMD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── 事件處理 ──────────────────────────────────────────────────

case "$EVENT" in

  dangerous-command)
    should_notify P0 || exit 0
    is_rate_limited "danger" 30 && exit 0
    get_context
    send_slack_bg "🚨 *Claude Code：危險命令被攔截*
• 專案：$PROJECT_INFO
• 攔截：\`${CMD:0:60}\`"
    ;;

  protected-file)
    should_notify P0 || exit 0
    is_rate_limited "protect" 30 && exit 0
    get_context
    send_slack_bg "🔒 *Claude Code：受保護檔案阻止*
• 專案：$PROJECT_INFO
• 檔案：\`$FILE\`"
    ;;

  session-start)
    date +%s > "$STATE_DIR/start_$SESSION_SHORT"
    should_notify P2 || exit 0
    get_context
    send_slack_bg "🚀 *Claude Code：Session 開始*
• 專案：$PROJECT_INFO"
    ;;

  session-stop)
    DURATION=$(get_session_duration)
    [ "$DURATION" -lt "$MIN_SESSION" ] && exit 0
    should_notify P1 || exit 0
    get_context
    MINS=$(( DURATION / 60 ))
    send_slack_bg "✅ *Claude Code：任務完成*
• 專案：$PROJECT_INFO
• 耗時：${MINS} 分鐘${MSG:+
_${MSG}_}"
    rm -f "$STATE_DIR/start_$SESSION_SHORT" "$STATE_DIR"/rl_"${SESSION_SHORT}"_*
    ;;

  session-compact)
    should_notify P1 || exit 0
    is_rate_limited "compact" 600 && exit 0
    get_context
    send_slack_bg "🔄 *Claude Code：Context 已壓縮*
• 專案：$PROJECT_INFO
工作記憶已重置，回來後建議重新確認任務上下文。"
    ;;

  agent-blocked)
    should_notify P1 || exit 0
    is_rate_limited "attention" 60 && exit 0
    get_context
    send_slack_bg "💬 *Claude Code：需要你的注意*
• 專案：$PROJECT_INFO${MSG:+
_${MSG}_}"
    ;;

  subagent-fail)
    should_notify P1 || exit 0
    is_rate_limited "subagent" 120 && exit 0
    get_context
    send_slack_bg "⚠️ *Claude Code：子代理失敗*
• 專案：$PROJECT_INFO${MSG:+
• _${MSG}_}"
    ;;

  file-edited)
    should_notify P2 || exit 0
    echo "$FILE" >> "$STATE_DIR/edits_$SESSION_SHORT"
    is_rate_limited "edits" 120 && exit 0
    if [ -f "$STATE_DIR/edits_$SESSION_SHORT" ]; then
      COUNT=$(wc -l < "$STATE_DIR/edits_$SESSION_SHORT" | tr -d ' ')
      FILES=$(tail -5 "$STATE_DIR/edits_$SESSION_SHORT" | xargs -I{} basename {} | sort -u | paste -sd '、' -)
      get_context
      send_slack_bg "📝 *Claude Code：檔案編輯*
• 專案：$PROJECT_INFO
• 最近 ${COUNT} 次：${FILES}"
      > "$STATE_DIR/edits_$SESSION_SHORT"
    fi
    ;;

esac

exit 0
