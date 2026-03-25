# ── 現代 CLI 工具 ─────────────────────────────────────────────────
if _command_exists bat; then
  alias cat='bat --style=plain'
  alias less='bat --pager="less -RF"'
  export BAT_THEME="TwoDark"
fi

if _command_exists eza; then
  alias ls='eza --icons --group-directories-first'
  alias ll='eza -alF --icons --group-directories-first --git'
  alias la='eza -a --icons --group-directories-first'
  alias lt='eza --tree --icons --level=2'
  alias lt3='eza --tree --icons --level=3'
fi

if _command_exists fd;     then alias find='fd'; fi
if _command_exists zoxide; then eval "$(zoxide init zsh)"; alias cd='z'; fi
if _command_exists rg;     then export RIPGREP_CONFIG_PATH="$HOME/.ripgreprc"; fi
if _command_exists tldr;   then alias help='tldr'; fi
