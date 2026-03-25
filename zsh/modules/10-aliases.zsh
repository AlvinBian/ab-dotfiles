# ── 編輯器自動偵測（Kiro → Cursor → VSCode → vim）───────────────
_detect_editor() {
  if [[ -x "/Applications/Kiro.app/Contents/Resources/app/bin/code" ]]; then
    export EDITOR="/Applications/Kiro.app/Contents/Resources/app/bin/code"
    export VISUAL="$EDITOR"; alias code="$EDITOR"; return
  fi
  if [[ -x "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" ]]; then
    export EDITOR="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    export VISUAL="$EDITOR"; alias code="$EDITOR"; return
  fi
  if [[ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
    export EDITOR="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    export VISUAL="$EDITOR"; alias code="$EDITOR"; return
  fi
  export EDITOR="vim"; export VISUAL="vim"
}
_detect_editor

open() {
  if [[ "$1" == "-e" ]]; then shift; "$EDITOR" "$@"
  else command open "$@"; fi
}

# ── GitHub CLI ────────────────────────────────────────────────────
if _command_exists gh; then
  alias ghpr='gh pr create'
  alias ghprl='gh pr list'
  alias ghprv='gh pr view --web'
fi

# ── uv（Python 套件管理）─────────────────────────────────────────
if _command_exists uv; then
  alias pip='uv pip'
  alias venv='uv venv'
fi

# ── 通用 ──────────────────────────────────────────────────────────
alias reload='source ~/.zshrc && echo "✔ .zshrc reloaded"'
alias zshconfig='$EDITOR ~/.zshrc'
alias zshmodules='$EDITOR ~/.zsh/'
alias path='echo $PATH | tr ":" "\n"'
alias myip='curl -s https://ipinfo.io/ip'
alias ports='lsof -iTCP -sTCP:LISTEN -P'
alias dud='du -d 1 -h | sort -hr'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
