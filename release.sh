#!/usr/bin/env bash
set -euo pipefail

# Build a Tauri release, optionally bump patch version, and publish a GitHub
# release by default. Pass --dry-run to skip git/gh publishing and print manual
# steps instead.

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
CYAN=$'\033[0;36m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_CONF_PATH="$PROJECT_ROOT/src-tauri/tauri.conf.json"
PACKAGE_JSON_PATH="$PROJECT_ROOT/package.json"
CARGO_TOML_PATH="$PROJECT_ROOT/src-tauri/Cargo.toml"
DMG_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg"
MACOS_BUNDLE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/macos"
LATEST_UPDATER_JSON_PATH="$MACOS_BUNDLE_DIR/latest.json"
DEFAULT_UPDATER_SIGNING_KEY_PATH="$HOME/.tauri/freewrite-updater.key"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *)
      printf '%sUnknown argument: %s%s\n' "$RED" "$arg" "$NC" >&2
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '%sMissing required command: %s%s\n' "$RED" "$1" "$NC" >&2
    exit 1
  fi
}

require_cmd jq
require_cmd pnpm
require_cmd shasum

current_version() {
  jq -r '.version' "$TAURI_CONF_PATH"
}

next_patch_version() {
  local version="$1"
  IFS=. read -r major minor patch extra <<<"$version"
  if [[ -n "${extra:-}" || -z "$major" || -z "$minor" || -z "$patch" || ! "$patch" =~ ^[0-9]+$ ]]; then
    printf '%sExpected semver x.y.z, got: %s%s\n' "$RED" "$version" "$NC" >&2
    exit 1
  fi
  printf '%s.%s.%s\n' "$major" "$minor" "$((patch + 1))"
}

replace_version_in_json() {
  local path="$1"
  local version="$2"
  local tmp
  tmp="$(mktemp)"
  jq --arg version "$version" '.version = $version' "$path" >"$tmp"
  mv "$tmp" "$path"
}

replace_version_in_cargo() {
  local version="$1"
  perl -0pi -e 's/^version = "[^"]+"/version = "'"$version"'"/m' "$CARGO_TOML_PATH"
}

ensure_updater_signing_key() {
  if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    return
  fi

  if [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY
    TAURI_SIGNING_PRIVATE_KEY="$(<"$TAURI_SIGNING_PRIVATE_KEY_PATH")"
    return
  fi

  if [[ -f "$DEFAULT_UPDATER_SIGNING_KEY_PATH" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
    TAURI_SIGNING_PRIVATE_KEY="$(<"$DEFAULT_UPDATER_SIGNING_KEY_PATH")"
    return
  fi

  printf '%sUpdater signing key not found.%s\n' "$RED" "$NC" >&2
  printf 'Generate one with:\n' >&2
  printf '  pnpm tauri signer generate -w %s\n' "$DEFAULT_UPDATER_SIGNING_KEY_PATH" >&2
  exit 1
}

enable_updater_artifacts() {
  local tmp
  tmp="$(mktemp)"
  jq '.bundle = (.bundle // {}) | .bundle.createUpdaterArtifacts = true' "$TAURI_CONF_PATH" >"$tmp"
  mv "$tmp" "$TAURI_CONF_PATH"
}

restore_tauri_conf() {
  if [[ -n "${TAURI_CONF_BACKUP:-}" && -f "$TAURI_CONF_BACKUP" ]]; then
    cp "$TAURI_CONF_BACKUP" "$TAURI_CONF_PATH"
    rm -f "$TAURI_CONF_BACKUP"
  fi
}

find_dmg_for_version() {
  local version="$1"
  find "$DMG_DIR" -maxdepth 1 -type f -name "*_${version}_*.dmg" | sort | head -n 1
}

find_updater_archive() {
  find "$MACOS_BUNDLE_DIR" -maxdepth 1 -type f -name "*.app.tar.gz" | sort | head -n 1
}

github_asset_basename() {
  basename "$1" | tr ' ' '.'
}

updater_platform_key_from_dmg() {
  local dmg_name raw_arch arch
  dmg_name="$(basename "$1")"
  raw_arch="${dmg_name##*_}"
  raw_arch="${raw_arch%.dmg}"

  case "$raw_arch" in
    arm64 | aarch64) arch="aarch64" ;;
    x64 | amd64 | x86_64) arch="x86_64" ;;
    *) arch="$raw_arch" ;;
  esac

  printf 'darwin-%s\n' "$arch"
}

github_repo() {
  if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    printf '%s\n' "$GITHUB_REPOSITORY"
    return
  fi

  local remote
  remote="$(git -C "$PROJECT_ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$remote" =~ github.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return
  fi

  if command -v gh >/dev/null 2>&1; then
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null && return
  fi

  printf '%sUnable to determine GitHub repository. Set GITHUB_REPOSITORY=owner/repo.%s\n' "$RED" "$NC" >&2
  exit 1
}

write_latest_updater_json() {
  local version="$1"
  local dmg_path="$2"
  local updater_archive_path="$3"
  local signature_path="${updater_archive_path}.sig"
  local signature updater_asset_name platform_key repo tmp

  if [[ ! -f "$signature_path" ]]; then
    printf '%sUpdater signature not found: %s%s\n' "$RED" "$signature_path" "$NC" >&2
    exit 1
  fi

  signature="$(tr -d '\n' <"$signature_path")"
  updater_asset_name="$(github_asset_basename "$updater_archive_path")"
  platform_key="$(updater_platform_key_from_dmg "$dmg_path")"
  repo="$(github_repo)"
  tmp="$(mktemp)"

  jq -n \
    --arg version "$version" \
    --arg pub_date "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg platform "$platform_key" \
    --arg signature "$signature" \
    --arg url "https://github.com/$repo/releases/download/v$version/$updater_asset_name" \
    '{
      version: $version,
      pub_date: $pub_date,
      platforms: {
        ($platform): {
          signature: $signature,
          url: $url
        }
      }
    }' >"$tmp"

  mv "$tmp" "$LATEST_UPDATER_JSON_PATH"
}

git_quiet() {
  git -C "$PROJECT_ROOT" "$@" >/dev/null 2>&1
}

current_git_branch() {
  git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || printf 'master\n'
}

cleanup_build_artifacts() {
  find "$PROJECT_ROOT" -name "*.bun-build" -type f -delete 2>/dev/null || true
}

CURRENT_VERSION="$(current_version)"
NEXT_VERSION="$(next_patch_version "$CURRENT_VERSION")"
BRANCH="$(current_git_branch)"
[[ -n "$BRANCH" ]] || BRANCH="master"

printf '%sCurrent version: %s%s\n' "$YELLOW" "$CURRENT_VERSION" "$NC"
printf '%sNext version:    %s%s\n\n' "$GREEN" "$NEXT_VERSION" "$NC"

read -r -p "Bump version to $NEXT_VERSION before building? (y/N) " REPLY
printf '\n'

SAME_VERSION_RELEASE=0
if [[ "$REPLY" =~ ^[Yy]$ ]]; then
  VERSION_TO_BUILD="$NEXT_VERSION"
  printf '%sUpdating version numbers to %s...%s\n' "$CYAN" "$NEXT_VERSION" "$NC"
  replace_version_in_json "$TAURI_CONF_PATH" "$NEXT_VERSION"
  printf '  - Updated tauri.conf.json\n'
  replace_version_in_json "$PACKAGE_JSON_PATH" "$NEXT_VERSION"
  printf '  - Updated package.json\n'
  replace_version_in_cargo "$NEXT_VERSION"
  printf '  - Updated Cargo.toml\n'
else
  VERSION_TO_BUILD="$CURRENT_VERSION"
  SAME_VERSION_RELEASE=1
  printf '%sKeeping current version %s%s\n' "$YELLOW" "$CURRENT_VERSION" "$NC"
fi

printf '\n%sBuilding release v%s...%s\n' "$CYAN" "$VERSION_TO_BUILD" "$NC"
ensure_updater_signing_key

TAURI_CONF_BACKUP="$(mktemp)"
cp "$TAURI_CONF_PATH" "$TAURI_CONF_BACKUP"
trap restore_tauri_conf EXIT
enable_updater_artifacts
pnpm tauri build
restore_tauri_conf
trap - EXIT

printf '%sBuild complete!%s\n' "$GREEN" "$NC"

DMG_PATH="$(find_dmg_for_version "$VERSION_TO_BUILD")"
if [[ -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  printf '%sError: DMG not found for version %s in %s%s\n' "$RED" "$VERSION_TO_BUILD" "$DMG_DIR" "$NC" >&2
  exit 1
fi

UPDATER_ARCHIVE_PATH="$(find_updater_archive)"
if [[ -z "$UPDATER_ARCHIVE_PATH" || ! -f "$UPDATER_ARCHIVE_PATH" ]]; then
  printf '%sError: updater archive not found in %s%s\n' "$RED" "$MACOS_BUNDLE_DIR" "$NC" >&2
  exit 1
fi

UPDATER_SIGNATURE_PATH="${UPDATER_ARCHIVE_PATH}.sig"
if [[ ! -f "$UPDATER_SIGNATURE_PATH" ]]; then
  printf '%sError: updater signature not found at %s%s\n' "$RED" "$UPDATER_SIGNATURE_PATH" "$NC" >&2
  exit 1
fi

SHA256="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"
GITHUB_DMG_NAME="$(github_asset_basename "$DMG_PATH")"
write_latest_updater_json "$VERSION_TO_BUILD" "$DMG_PATH" "$UPDATER_ARCHIVE_PATH"
cleanup_build_artifacts

printf '\n%s===============================================================%s\n' "$GREEN" "$NC"
printf '%sSUCCESS! Release Ready%s\n' "$GREEN" "$NC"
printf '%s===============================================================%s\n' "$GREEN" "$NC"
printf 'Version:          %s%s%s\n' "$CYAN" "$VERSION_TO_BUILD" "$NC"
printf 'DMG Path:         %s%s%s\n' "$CYAN" "$DMG_PATH" "$NC"
printf 'GitHub DMG Name:  %s%s%s\n' "$CYAN" "$GITHUB_DMG_NAME" "$NC"
printf 'Updater Archive:  %s%s%s\n' "$CYAN" "$UPDATER_ARCHIVE_PATH" "$NC"
printf 'Updater Sig:      %s%s%s\n' "$CYAN" "$UPDATER_SIGNATURE_PATH" "$NC"
printf 'Updater JSON:     %s%s%s\n' "$CYAN" "$LATEST_UPDATER_JSON_PATH" "$NC"
printf 'SHA256:           %s%s%s\n' "$CYAN" "$SHA256" "$NC"
printf '%s===============================================================%s\n' "$GREEN" "$NC"

if [[ "$DRY_RUN" -eq 0 ]]; then
  require_cmd gh

  printf '\n%sPublishing release...%s\n' "$CYAN" "$NC"

  if [[ "$SAME_VERSION_RELEASE" -eq 1 ]]; then
    printf '\n%sSame version release; cleaning up any existing tag/release...%s\n' "$YELLOW" "$NC"
    if gh release delete "v$VERSION_TO_BUILD" --yes >/dev/null 2>&1; then
      printf '%s  - Deleted existing GitHub release%s\n' "$GREEN" "$NC"
    else
      printf '%s  - No existing GitHub release to delete%s\n' "$YELLOW" "$NC"
    fi
    if git_quiet push origin --delete "v$VERSION_TO_BUILD"; then
      printf '%s  - Deleted remote tag%s\n' "$GREEN" "$NC"
    else
      printf '%s  - No remote tag to delete%s\n' "$YELLOW" "$NC"
    fi
    if git_quiet tag -d "v$VERSION_TO_BUILD"; then
      printf '%s  - Deleted local tag%s\n' "$GREEN" "$NC"
    else
      printf '%s  - No local tag to delete%s\n' "$YELLOW" "$NC"
    fi
    printf '\n'
  fi

  printf '%sStep 1: Committing changes...%s\n' "$CYAN" "$NC"
  git -C "$PROJECT_ROOT" add -A
  if git -C "$PROJECT_ROOT" diff --cached --quiet; then
    printf '%s  - Nothing to commit%s\n' "$YELLOW" "$NC"
  else
    git -C "$PROJECT_ROOT" commit -m "Release v$VERSION_TO_BUILD"
    printf '%s  - Changes committed%s\n' "$GREEN" "$NC"
  fi

  printf '%sStep 2: Creating tag and pushing...%s\n' "$CYAN" "$NC"
  git -C "$PROJECT_ROOT" tag "v$VERSION_TO_BUILD"
  git -C "$PROJECT_ROOT" push origin "$BRANCH" --tags
  printf '%s  - Tag v%s pushed%s\n' "$GREEN" "$VERSION_TO_BUILD" "$NC"

  printf '%sStep 3: Creating GitHub release...%s\n' "$CYAN" "$NC"
  gh release create "v$VERSION_TO_BUILD" \
    "$DMG_PATH" \
    "$UPDATER_ARCHIVE_PATH" \
    "$UPDATER_SIGNATURE_PATH" \
    "$LATEST_UPDATER_JSON_PATH" \
    --title "v$VERSION_TO_BUILD" \
    --generate-notes
  printf '%s  - GitHub release created%s\n' "$GREEN" "$NC"
  printf '\n%sRelease v%s published!%s\n' "$GREEN" "$VERSION_TO_BUILD" "$NC"
else
  printf '\n%sTo publish this release:%s\n\n' "$CYAN" "$NC"

  if [[ "$SAME_VERSION_RELEASE" -eq 1 ]]; then
    printf '  0. Clean up existing tag/release (errors are safe to ignore):\n'
    printf '     gh release delete v%s --yes\n' "$VERSION_TO_BUILD"
    printf '     git push origin --delete v%s\n' "$VERSION_TO_BUILD"
    printf '     git tag -d v%s\n\n' "$VERSION_TO_BUILD"
  fi

  printf '  1. Commit changes:\n'
  printf '     git add -A && git commit -m "Release v%s"\n\n' "$VERSION_TO_BUILD"
  printf '  2. Create tag:\n'
  printf '     git tag v%s\n' "$VERSION_TO_BUILD"
  printf '     git push origin %s --tags\n\n' "$BRANCH"
  printf '  3. Create GitHub release:\n'
  printf '     gh release create v%s "%s" "%s" "%s" "%s" --title "v%s" --generate-notes\n\n' \
    "$VERSION_TO_BUILD" \
    "$DMG_PATH" \
    "$UPDATER_ARCHIVE_PATH" \
    "$UPDATER_SIGNATURE_PATH" \
    "$LATEST_UPDATER_JSON_PATH" \
    "$VERSION_TO_BUILD"
  printf '%sTip: Omit --dry-run to publish automatically.%s\n' "$YELLOW" "$NC"
fi
