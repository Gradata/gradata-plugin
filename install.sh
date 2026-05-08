#!/bin/sh
# Gradata one-paste installer. POSIX sh — no bashisms.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Gradata/gradata-plugin/main/install.sh | sh
#
# Honors $GRADATA_HOME (default: $HOME/.gradata).

set -eu

GRADATA_HOME="${GRADATA_HOME:-$HOME/.gradata}"
PLUGIN_DIR="$GRADATA_HOME/plugin"
REPO_URL="https://github.com/Gradata/gradata-plugin.git"

say() { printf '%s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# --- Dependency checks ------------------------------------------------------

check_git() {
  if ! have git; then
    say 'git not found.'
    say 'Install: macOS=`xcode-select --install`  Debian/Ubuntu=`sudo apt install git`  Fedora=`sudo dnf install git`'
    exit 1
  fi
}

check_node() {
  if ! have node; then
    say 'node not found (need >= 18).'
    say 'Install: https://nodejs.org/  or  `nvm install 20`'
    exit 1
  fi
  ver=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)
  if [ "$ver" -lt 18 ] 2>/dev/null; then
    die "node >= 18 required (found $(node -v 2>/dev/null || echo unknown))"
  fi
}

check_python() {
  for c in python3 python; do
    if have "$c"; then
      v=$("$c" -c 'import sys;print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "")
      maj=$(printf '%s' "$v" | cut -d. -f1)
      min=$(printf '%s' "$v" | cut -d. -f2)
      if [ -n "$maj" ] && [ -n "$min" ]; then
        if [ "$maj" -gt 3 ] 2>/dev/null || { [ "$maj" -eq 3 ] && [ "$min" -ge 10 ]; }; then
          PYTHON_BIN="$c"
          return 0
        fi
      fi
    fi
  done
  say 'python3 >= 3.10 not found.'
  say 'Install: macOS=`brew install python3`  Debian/Ubuntu=`sudo apt install python3 python3-pip`  Fedora=`sudo dnf install python3`'
  exit 1
}

# --- Clone or update --------------------------------------------------------

ensure_repo() {
  mkdir -p "$GRADATA_HOME"
  if [ -d "$PLUGIN_DIR/.git" ]; then
    say "Updating existing checkout at $PLUGIN_DIR"
    (cd "$PLUGIN_DIR" && git pull --ff-only --quiet) || warn 'git pull failed; continuing with existing checkout'
  elif [ -d "$PLUGIN_DIR" ] && [ -f "$PLUGIN_DIR/setup/install.js" ]; then
    # Local dev / dogfood: a non-git plugin dir is already populated. Leave it.
    say "Using existing plugin checkout at $PLUGIN_DIR"
  else
    say "Cloning $REPO_URL -> $PLUGIN_DIR"
    git clone --depth 1 "$REPO_URL" "$PLUGIN_DIR"
  fi
}

# --- Run node installer -----------------------------------------------------

run_installer() {
  say 'Running setup/install.js --auto'
  GRADATA_HOME="$GRADATA_HOME" node "$PLUGIN_DIR/setup/install.js" --auto
}

# --- Optional Claude Code symlink -------------------------------------------

maybe_symlink_cc() {
  cc_dir="$HOME/.claude"
  [ -d "$cc_dir" ] || return 0
  plugins_dir="$cc_dir/plugins"
  mkdir -p "$plugins_dir"
  link="$plugins_dir/gradata"
  if [ -L "$link" ]; then
    return 0
  fi
  if [ -e "$link" ]; then
    warn "$link exists and is not a symlink — leaving alone"
    return 0
  fi
  if ln -s "$PLUGIN_DIR" "$link" 2>/dev/null; then
    say "Linked Claude Code plugin: $link -> $PLUGIN_DIR"
  else
    warn "could not create symlink at $link (skipping)"
  fi
}

# --- Main -------------------------------------------------------------------

main() {
  say 'Gradata installer'
  check_git
  check_node
  check_python
  ensure_repo
  run_installer
  maybe_symlink_cc
  say ''
  say 'Done.'
  say "Verify: node \"$PLUGIN_DIR/setup/doctor.js\""
}

main
