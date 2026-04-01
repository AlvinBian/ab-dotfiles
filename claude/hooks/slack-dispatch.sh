#!/bin/bash
# Claude Code Slack 通知分發器
#
# session-stop → 寫入 /tmp/claude-slack/notify-pending.json
# Stop hook prompt 讀取後呼叫 mcp__claude_ai_Slack__slack_send_message

set -uo pipefail

# 載入 .env（優先級：repo .env → ~/.claude/.env → ~/.env → 環境變數）
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
REPO_CHANNEL=""
if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/.env" ]; then
  REPO_CHANNEL=$(grep -m1 '^SLACK_NOTIFY_CHANNEL=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)
fi

for envfile in "$HOME/.claude/.env" "$HOME/.env"; do
  [ -f "$envfile" ] && . "$envfile" 2>/dev/null && break
done

# per-repo 優先，否則用全局（~/.claude/.env 或 settings.json 注入的環境變數）
CHANNEL="${REPO_CHANNEL:-${SLACK_NOTIFY_CHANNEL:-}}"
[ -z "$CHANNEL" ] && exit 0
MIN_SESSION="${CLAUDE_SLACK_MIN_SESSION_SECS:-300}"
STATE_DIR="/tmp/claude-slack"
SESSION="${CLAUDE_SESSION_ID:-$$}"
SESSION_SHORT="${SESSION:0:8}"

mkdir -p "$STATE_DIR"

get_context() {
  REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo 'unknown')")
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")
  PROJECT_INFO="$REPO"
  [ -n "$BRANCH" ] && PROJECT_INFO="$PROJECT_INFO / $BRANCH"
  [ -n "$TICKET" ] && PROJECT_INFO="$PROJECT_INFO · $TICKET"
}

EVENT="${1:-}"
shift || true

MSG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --msg)  MSG="$2"; shift 2 ;;
    --file|--cmd) shift 2 ;;
    *) shift ;;
  esac
done

case "$EVENT" in

  session-start)
    date +%s > "$STATE_DIR/start_$SESSION_SHORT"
    ;;

  session-stop)
    start_file="$STATE_DIR/start_$SESSION_SHORT"
    [ ! -f "$start_file" ] && exit 0
    DURATION=$(( $(date +%s) - $(cat "$start_file") ))
    [ "$DURATION" -lt "$MIN_SESSION" ] && exit 0
    get_context
    MINS=$(( DURATION / 60 ))
    MSG_TEXT="✅ *Claude Code：任務完成*
• 專案：${PROJECT_INFO}
• 耗時：${MINS} 分鐘"
    [ -n "$MSG" ] && MSG_TEXT="${MSG_TEXT}
_${MSG}_"
    if command -v python3 >/dev/null 2>&1; then
      JSON_TEXT=$(printf '%s' "$MSG_TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
    else
      JSON_TEXT="\"$(printf '%s' "$MSG_TEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/g' | tr -d '\n' | sed 's/\\n$//')\""
    fi
    printf '{"channel_id":"%s","text":%s}\n' "$CHANNEL" "$JSON_TEXT" > "$STATE_DIR/notify-pending.json"
    rm -f "$start_file"
    ;;

esac

exit 0
