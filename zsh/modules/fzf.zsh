# ── FZF 整合 ──────────────────────────────────────────────────────
_safe_source "${BREW_PREFIX}/opt/fzf/shell/key-bindings.zsh"
_safe_source "${BREW_PREFIX}/opt/fzf/shell/completion.zsh"

if _command_exists fd; then
  export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
fi

if _command_exists bat; then
  export FZF_CTRL_T_OPTS="--preview 'bat --color=always --line-range=:50 {}' --preview-window=right:50%"
fi

export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --info=inline"
