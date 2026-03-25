# ── Node 版本管理（動態偵測 nvm / n）────────────────────────────
#  優先順序：nvm（lazy loading） > n（brew 或手動安裝）

# ── nvm ───────────────────────────────────────────────────────────
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

# ── n ─────────────────────────────────────────────────────────────
elif command -v n &>/dev/null || [[ -d "$HOME/n" ]]; then
  # 手動安裝（~/n）vs brew 安裝（PATH 已由 brew 設好，無需額外 N_PREFIX）
  if [[ -d "$HOME/n" ]]; then
    export N_PREFIX="$HOME/n"
    [[ ":$PATH:" != *":$N_PREFIX/bin:"* ]] && export PATH="$N_PREFIX/bin:$PATH"
  fi

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
