# ── ZSH 插件 ──────────────────────────────────────────────────────
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'
ZSH_AUTOSUGGEST_STRATEGY=(history completion)

_safe_source "${BREW_PREFIX}/share/zsh-autosuggestions/zsh-autosuggestions.zsh"
_safe_source "${BREW_PREFIX}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"

# Starship prompt
if _command_exists starship; then eval "$(starship init zsh)"; fi

# IDE shell integrations（有裝才 source）
_safe_source "$HOME/.kiro/shell/zsh/init.zsh"
_safe_source "$HOME/.openclaw/init.zsh"
