#!/usr/bin/env bash
# Copy the probe plugin to the console's plugin folder. Run this yourself —
# it writes outside the repo, into a tree your Show Creator build scripts also
# manage, so it should be a visible deliberate step rather than a side effect.
#
#   ./scripts/deploy-plugin.sh                 # dry run, shows what it would do
#   ./scripts/deploy-plugin.sh --write         # actually copy
#   ./scripts/deploy-plugin.sh --write --dest <dir>
set -euo pipefail
cd "$(dirname "$0")/.."

# Default: the folder the operator already used. lib_plugins/LifeBridge/ is the
# documented home for the external-file form and is NOT written by
# build_plugin_xml.py, so it is the tidier target if you want to move.
DEST="${HOME}/MALightingTechnology/gma3_library/datapools/plugins"
WRITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --write) WRITE=1 ;;
    --dest) DEST="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

echo "dest: $DEST"
[ -d "$DEST" ] || { echo "ERROR: destination does not exist" >&2; exit 1; }

for f in console-plugin/LifeBridge.lua console-plugin/LifeBridge.xml; do
  target="$DEST/$(basename "$f")"
  if [ -f "$target" ] && ! diff -q "$f" "$target" >/dev/null; then
    status="REPLACES an existing, DIFFERENT file"
  elif [ -f "$target" ]; then
    status="unchanged"
  else
    status="new"
  fi
  printf '  %-28s %s\n' "$(basename "$f")" "$status"
  [ "$WRITE" = "1" ] && cp "$f" "$target"
done

if [ "$WRITE" = "1" ]; then
  echo "copied. Now re-import the XML on the console, or:"
  echo '  Off Plugin "LifeBridge" -> ReloadAllPlugins -> Call Plugin "LifeBridge"'
else
  echo "(dry run — pass --write to copy)"
fi
