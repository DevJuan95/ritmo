#!/bin/sh
set -eu
# Corre como root con sudo, que conserva el PATH de quien lo llama: se fija el entorno y
# cada orden externa usa su ruta absoluta, para no ejecutar programas puestos por otro proceso.
PATH=/usr/bin:/bin:/usr/sbin:/sbin
IFS=' 	
'
LC_ALL=C
export PATH LC_ALL

action=${1:-}
domains=${2:-}
if [ "$action" = check ]; then exit 0; fi
start='# >>> RITMO FOCUS BLOCK >>>'
end='# <<< RITMO FOCUS BLOCK <<<'
hosts=/etc/hosts
if [ "$(/usr/bin/id -u)" -ne 0 ] && [ -n "${RITMO_TEST_HOSTS:-}" ]; then
  case "$RITMO_TEST_HOSTS" in
    /tmp/*|/private/tmp/*) hosts=$RITMO_TEST_HOSTS ;;
    *) echo 'Ruta de prueba inválida.' >&2; exit 2 ;;
  esac
fi
temporary=$(/usr/bin/mktemp /tmp/ritmo-hosts.XXXXXX)
# Una señal debe terminar el script: si siguiera sin el temporal, vaciaría hosts.
trap '/bin/rm -f "$temporary"' EXIT
trap 'exit 1' HUP INT TERM

# Remove only the section managed by this app. Leave every other entry intact.
/usr/bin/awk -v start="$start" -v end="$end" '
  $0 == start { inside = 1; next }
  $0 == end { inside = 0; next }
  !inside { print }
' "$hosts" > "$temporary"

case "$action" in
  block)
    if [ -z "$domains" ]; then
      echo 'No hay dominios para bloquear.' >&2
      exit 2
    fi
    {
      printf '\n%s\n' "$start"
      printf '%s\n' "$domains" | while IFS= read -r domain; do
        case "$domain" in
          *[!a-z0-9.-]*|''|.*|*..*|*.) echo 'Dominio inválido.' >&2; exit 2 ;;
        esac
        printf '0.0.0.0 %s www.%s\n' "$domain" "$domain"
        printf '::1 %s www.%s\n' "$domain" "$domain"
      done
      printf '%s\n' "$end"
    } >> "$temporary"
    ;;
  unblock) ;;
  *) echo 'Acción inválida.' >&2; exit 2 ;;
esac

# Si Ritmo cancela el cambio al salir, sudo reenvía la señal: desde aquí se termina la escritura
# para no dejar hosts a medias. El trap de EXIT sigue borrando el temporal.
trap '' HUP INT TERM
/bin/cat "$temporary" > "$hosts"
/usr/bin/dscacheutil -flushcache || true
/usr/bin/killall -HUP mDNSResponder >/dev/null 2>&1 || true
