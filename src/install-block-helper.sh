#!/bin/sh
set -eu

source_script=${1:-}
account=${2:-}
helper=/Library/PrivilegedHelperTools/ritmo-block-sites
rule=/etc/sudoers.d/ritmo

if [ "$(id -u)" -ne 0 ] || [ ! -f "$source_script" ]; then
  echo 'Instalación inválida.' >&2
  exit 2
fi

case "$account" in
  ''|-*|*[!a-zA-Z0-9_-]*) echo 'Usuario inválido.' >&2; exit 2 ;;
esac
id "$account" >/dev/null 2>&1 || { echo 'Usuario desconocido.' >&2; exit 2; }

/usr/bin/install -d -o root -g wheel -m 755 /Library/PrivilegedHelperTools
temporary_rule=$(mktemp /etc/sudoers.d/ritmo.XXXXXX)
temporary_helper=$(mktemp /Library/PrivilegedHelperTools/ritmo.XXXXXX)
trap 'rm -f "$temporary_rule" "$temporary_helper"' EXIT HUP INT TERM
printf '%s ALL=(root) NOPASSWD: %s\n' "$account" "$helper" > "$temporary_rule"
/bin/chmod 440 "$temporary_rule"
/usr/sbin/visudo -cf "$temporary_rule" >/dev/null
/usr/bin/install -o root -g wheel -m 755 "$source_script" "$temporary_helper"
/bin/mv -f "$temporary_rule" "$rule"
/bin/mv -f "$temporary_helper" "$helper"
