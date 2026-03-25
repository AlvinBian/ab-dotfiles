#!/usr/bin/env zsh
# ╔══════════════════════════════════════════════════════════════════╗
# ║          macOS ZSH 開發環境一鍵設定腳本                         ║
# ║  執行方式：zsh ~/setup-zsh.sh                                    ║
# ╚══════════════════════════════════════════════════════════════════╝

set -e
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
info()    { echo -e "${CYAN}▶ $1${RESET}"; }
success() { echo -e "${GREEN}✔ $1${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $1${RESET}"; }

# ──────────────────────────────────────────────────────────────────
# STEP 1：安裝現代 CLI 工具
# ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}STEP 1：安裝現代 CLI 工具${RESET}"

if ! command -v brew &>/dev/null; then
  warn "未偵測到 Homebrew，請先安裝：https://brew.sh"; exit 1
fi

BREW_TOOLS=(fzf zoxide bat eza fd git-delta lazygit tldr)
for tool in "${BREW_TOOLS[@]}"; do
  if brew list "$tool" &>/dev/null 2>&1; then
    info "$tool 已安裝，略過"
  else
    info "安裝 $tool ..."; brew install "$tool"; success "$tool 安裝完成"
  fi
done

# fzf keybindings
if [ -f "$(brew --prefix)/opt/fzf/install" ]; then
  "$(brew --prefix)/opt/fzf/install" --key-bindings --completion --no-update-rc --no-bash --no-fish 2>/dev/null || true
fi

# ──────────────────────────────────────────────────────────────────
# 自動檢查並安裝 nvm（如果 nvm / n 都未安裝）
# ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}STEP 1.5：檢查 Node 版本管理器${RESET}"

if [[ ! -d "$HOME/.nvm" ]] && ! command -v n &>/dev/null; then
  warn "未偵測到 nvm 或 n，自動安裝 nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  success "nvm 安裝完成！"
fi

# ──────────────────────────────────────────────────────────────────
# STEP 2：清空 ~/.zsh/ 全部文件
# ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}STEP 2：清空並重建 ~/.zsh/ 模組${RESET}"

mkdir -p ~/.zsh
info "清空 ~/.zsh/ 所有文件..."
rm -rf ~/.zsh/* 2>/dev/null || true
success "~/.zsh/ 已清空並準備就緒"

# ── nvm.zsh（同時支援 nvm / n）──────────────────────────────────
info "寫入 nvm.zsh ..."
cat > ~/.zsh/nvm.zsh << 'NVMEOF'
# ── Node 版本管理（自動偵測 nvm / n）────────────────────────────
#
#  優先順序：nvm（lazy loading） > n > 系統 node
#
# ── nvm Lazy Loading ──────────────────────────────────────────────
if [[ -d "$HOME/.nvm" ]]; then
  export NVM_DIR="$HOME/.nvm"

  _nvm_lazy_load() {
    unset -f nvm node npm npx pnpm 2>/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" --no-use
    [ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"
  }

  nvm()  { _nvm_lazy_load; nvm  "$@"; }
  node() { _nvm_lazy_load; node "$@"; }
  npm()  { _nvm_lazy_load; npm  "$@"; }
  npx()  { _nvm_lazy_load; npx  "$@"; }
  pnpm() { _nvm_lazy_load; pnpm "$@"; }

  _auto_nvm_use() {
    if [[ -f .nvmrc || -f .node-version ]]; then
      _nvm_lazy_load
      nvm use --silent 2>/dev/null || nvm install --silent
    else
      _nvm_lazy_load
      nvm use default --silent 2>/dev/null || true
    fi
  }

  autoload -U add-zsh-hook
  add-zsh-hook chpwd _auto_nvm_use
  _auto_nvm_use

# ── n node version manager ────────────────────────────────────────
elif command -v n &>/dev/null || [[ -d "$HOME/n" ]]; then
  export N_PREFIX="${N_PREFIX:-$HOME/n}"
  [[ ":$PATH:" != *":$N_PREFIX/bin:"* ]] && export PATH="$N_PREFIX/bin:$PATH"

  _auto_n_use() {
    local version_file=""
    [[ -f .node-version ]] && version_file=".node-version"
    [[ -f .nvmrc ]]        && version_file=".nvmrc"
    if [[ -n "$version_file" ]]; then
      local ver; ver=$(cat "$version_file" | tr -d '[:space:]')
      n "$ver" --quiet 2>/dev/null || true
    fi
  }
  autoload -U add-zsh-hook
  add-zsh-hook chpwd _auto_n_use
  _auto_n_use
fi
NVMEOF
success "nvm.zsh 完成"

# ── pnpm.zsh ──────────────────────────────────────────────────────
info "寫入 pnpm.zsh ..."
cat > ~/.zsh/pnpm.zsh << 'PNPMEOF'
# ── PNPM 環境設定 ─────────────────────────────────────────────────
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
PNPMEOF
success "pnpm.zsh 完成"

# ── completion.zsh ────────────────────────────────────────────────
info "寫入 completion.zsh ..."
cat > ~/.zsh/completion.zsh << 'COMPEOF'
# ── ZSH 補全系統 ──────────────────────────────────────────────────
autoload -Uz compinit
if [[ -n ~/.zcompdump(#qN.mh+24) ]]; then
  compinit
else
  compinit -C
fi

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*:descriptions' format '%F{yellow}── %d ──%f'
zstyle ':completion:*:warnings' format '%F{red}找不到符合項目%f'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' rehash true
COMPEOF
success "completion.zsh 完成"

# ── history.zsh ───────────────────────────────────────────────────
info "寫入 history.zsh ..."
cat > ~/.zsh/history.zsh << 'HISTEOF'
# ── 歷史記錄設定 ──────────────────────────────────────────────────
HISTFILE="$HOME/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000

setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY
HISTEOF
success "history.zsh 完成"

# ── keybindings.zsh ───────────────────────────────────────────────
info "寫入 keybindings.zsh ..."
cat > ~/.zsh/keybindings.zsh << 'KEYEOF'
# ── 按鍵綁定 ──────────────────────────────────────────────────────
bindkey -e

bindkey '\e[1;3D' backward-word
bindkey '\e[1;3C' forward-word
bindkey '\eb'     backward-word
bindkey '\ef'     forward-word

bindkey '\e[1;5D' backward-word
bindkey '\e[1;5C' forward-word

bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward

bindkey '^U' backward-kill-line
bindkey '^K' kill-line
bindkey '^W' backward-kill-word
KEYEOF
success "keybindings.zsh 完成"

# ── plugins.zsh ───────────────────────────────────────────────────
info "寫入 plugins.zsh ..."
cat > ~/.zsh/plugins.zsh << 'PLUGEOF'
# ── ZSH 插件 ──────────────────────────────────────────────────────
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'
ZSH_AUTOSUGGEST_STRATEGY=(history completion)
_safe_source "${BREW_PREFIX}/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
_safe_source "${BREW_PREFIX}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

if _command_exists starship; then eval "$(starship init zsh)"; fi
_safe_source "$HOME/.kiro/shell/zsh/init.zsh"
_safe_source "$HOME/.openclaw/init.zsh"
PLUGEOF
success "plugins.zsh 完成"

# ── fzf.zsh ───────────────────────────────────────────────────────
info "寫入 fzf.zsh ..."
cat > ~/.zsh/fzf.zsh << 'FZFEOF'
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
FZFEOF
success "fzf.zsh 完成"

# ── tools.zsh ─────────────────────────────────────────────────────
info "寫入 tools.zsh ..."
cat > ~/.zsh/tools.zsh << 'TOOLEOF'
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
TOOLEOF
success "tools.zsh 完成"

# ── git.zsh ───────────────────────────────────────────────────────
info "寫入 git.zsh ..."
cat > ~/.zsh/git.zsh << 'GITEOF'
# ── Git 增強 ──────────────────────────────────────────────────────
if _command_exists delta; then
  git config --global core.pager delta
  git config --global delta.navigate true
  git config --global delta.light false
  git config --global delta.line-numbers true
  git config --global interactive.diffFilter "delta --color-only"
fi

if _command_exists lazygit; then alias lg='lazygit'; fi

alias gs='git status'
alias gst='git status --short --branch'
alias gd='git diff'
alias gds='git diff --staged'
alias gl='git log --oneline --graph --decorate --all'
alias gll='git log --pretty=format:"%C(yellow)%h%Creset %C(blue)%ad%Creset %s %C(green)[%an]%Creset" --date=short'
alias ga='git add'
alias gaa='git add --all'
alias gc='git commit -m'
alias gca='git commit --amend'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gb='git branch'
alias gba='git branch -a'
alias gp='git push'
alias gpf='git push --force-with-lease'
alias gpl='git pull'
alias gplr='git pull --rebase'
GITEOF
success "git.zsh 完成"

# ── aliases.zsh ───────────────────────────────────────────────────
info "寫入 aliases.zsh ..."
cat > ~/.zsh/aliases.zsh << 'ALIASEOF'
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

if _command_exists gh; then
  alias ghpr='gh pr create'
  alias ghprl='gh pr list'
  alias ghprv='gh pr view --web'
fi

if _command_exists uv; then
  alias pip='uv pip'
  alias venv='uv venv'
fi

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
ALIASEOF
success "aliases.zsh 完成"

# ──────────────────────────────────────────────────────────────────
# STEP 3：寫入 ~/.zshrc
# ──────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}STEP 3：寫入 ~/.zshrc${RESET}"

[[ -f ~/.zshrc ]] && cp ~/.zshrc ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S) && info "已備份舊版 ~/.zshrc"

cat > ~/.zshrc << 'ZSHRCEOF'
# ╔══════════════════════════════════════════════════════════════════╗
# ║  ~/.zshrc — 模組化入口                                          ║
# ╚══════════════════════════════════════════════════════════════════╝

_command_exists() { command -v "$1" &>/dev/null; }
_safe_source()    { [[ -s "$1" ]] && source "$1"; }

if _command_exists brew; then
  export BREW_PREFIX=$(brew --prefix)
else
  export BREW_PREFIX="/usr/local"
fi

if _command_exists pyenv; then
  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PATH"
  eval "$(pyenv init - zsh)"
fi

for _zsh_config in ~/.zsh/*.zsh; do
  [[ -f "$_zsh_config" ]] && source "$_zsh_config"
done
unset _zsh_config
ZSHRCEOF
success "~/.zshrc 寫入完成"

cat > ~/.ripgreprc << 'RGEOF'
--line-number
--color=auto
--hidden
--smart-case
--glob=!.git/*
--glob=!node_modules/*
--glob=!.next/*
--glob=!dist/*
--glob=!build/*
--glob=!.DS_Store
RGEOF
success "~/.ripgreprc 寫入完成"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║  ✔ 所有設定完成！                   ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════╝${RESET}"
echo ""
echo -e "請執行：${CYAN}source ~/.zshrc${RESET}  或開新 Terminal 讓設定生效。"
