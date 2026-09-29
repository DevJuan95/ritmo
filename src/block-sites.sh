#!/bin/sh
set -eu
LC_ALL=C
export LC_ALL

action=${1:-}
domains=${2:-}
if [ "$action" = check ]; then exit 0; fi
start='# >>> RITMO FOCUS BLOCK >>>'
end='# <<< RITMO FOCUS BLOCK <<<'
hosts=/etc/hosts
if [ "$(id -u)" -ne 0 ] && [ -n "${RITMO_TEST_HOSTS:-}" ]; then
  case "$RITMO_TEST_HOSTS" in
    /tmp/*|/private/tmp/*) hosts=$RITMO_TEST_HOSTS ;;
    *) echo 'Ruta de prueba inválida.' >&2; exit 2 ;;
  esac
fi
temporary=$(mktemp /tmp/ritmo-hosts.XXXXXX)
trap 'rm -f "$temporary"' EXIT HUP INT TERM

# Remove only the section managed by this app. Leave every other entry intact.
awk -v start="$start" -v end="$end" '
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

cat "$temporary" > "$hosts"
/usr/bin/dscacheutil -flushcache || true
/usr/bin/killall -HUP mDNSResponder >/dev/null 2>&1 || true
