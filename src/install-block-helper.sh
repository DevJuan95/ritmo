#!/bin/sh
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

source_script=${1:-}
account=${2:-}
helper=/Library/PrivilegedHelperTools/ritmo-block-sites

# El nombre se valida antes de exigir root para poder probarlo sin privilegios.
case "$account" in
  ''|-*|.*|*[!a-zA-Z0-9._-]*) echo 'Usuario inválido.' >&2; exit 2 ;;
esac

if [ "$(id -u)" -ne 0 ] || [ ! -f "$source_script" ]; then
  echo 'Instalación inválida.' >&2
  exit 2
fi

id "$account" >/dev/null 2>&1 || { echo 'Usuario desconocido.' >&2; exit 2; }
# sudo ignora los archivos de sudoers.d con un punto en el nombre. macOS permite puntos en
# los nombres de cuenta; en el archivo se cambian por %, que ningún nombre de cuenta contiene.
rule=/etc/sudoers.d/ritmo-$(printf '%s' "$account" | tr . %)

/usr/bin/install -d -o root -g wheel -m 755 /Library/PrivilegedHelperTools
temporary_rule=$(mktemp "$rule.XXXXXX")
temporary_helper=$(mktemp /Library/PrivilegedHelperTools/ritmo.XXXXXX)
trap 'rm -f "$temporary_rule" "$temporary_helper"' EXIT HUP INT TERM
# secure_path es una segunda defensa: sudo no pasa al helper el PATH de quien lo llama.
{
  printf 'Defaults!%s secure_path="/usr/bin:/bin:/usr/sbin:/sbin"\n' "$helper"
  printf '%s ALL=(root) NOPASSWD: %s\n' "$account" "$helper"
} > "$temporary_rule"
/bin/chmod 440 "$temporary_rule"
/usr/sbin/visudo -cf "$temporary_rule" >/dev/null
/usr/bin/install -o root -g wheel -m 755 "$source_script" "$temporary_helper"
/bin/mv -f "$temporary_rule" "$rule"
/bin/mv -f "$temporary_helper" "$helper"
