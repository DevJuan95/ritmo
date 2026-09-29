#!/bin/sh
# Integra la rama de un worktree en main mediante su PR y limpia el worktree, su rama y su sesión en Orca.
# main está protegida: solo acepta PR con el check `ci` aprobado e integrados por rebase.
# Uso: scripts/integrar-feature.sh [--force] [ruta-del-worktree]
#   --force  descarta los cambios sin commitear del worktree al eliminarlo.
# Sin ruta, usa el worktree del directorio actual.
set -eu

fail() {
  echo "integrar-feature: $*" >&2
  exit 1
}

# Orca cierra las terminales y la sesión del agente del worktree al quitarlo.
remove_worktree() {
  if command -v orca >/dev/null 2>&1 &&
    orca worktree show --worktree "path:$WT" >/dev/null 2>&1; then
    orca worktree rm --worktree "path:$WT" $FORCE
  else
    git -C "$MAIN" worktree remove $FORCE "$WT"
  fi
  # GitHub reescribe los commits al integrar por rebase, así que `branch -d` no
  # reconoce la rama como integrada. Solo se llega aquí con el PR ya integrado.
  if git -C "$MAIN" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$MAIN" branch -D "$BRANCH"
  fi
}

# Uso interno: fase de limpieza lanzada fuera de la sesión del worktree.
if [ "${1:-}" = "--limpiar" ]; then
  WT=$2 MAIN=$3 BRANCH=$4 FORCE=$5
  remove_worktree
  echo "==> Worktree $WT eliminado"
  exit 0
fi

FORCE=""
if [ "${1:-}" = "--force" ]; then
  FORCE="--force"
  shift
fi

CALLER=$(pwd -P)
command -v gh >/dev/null 2>&1 || fail "necesita la CLI de GitHub (gh) autenticada"

WT=$(git -C "${1:-.}" rev-parse --show-toplevel) || fail "no es un repositorio git: ${1:-.}"
MAIN=$(git -C "$WT" worktree list --porcelain | sed -n '1s/^worktree //p')
[ "$WT" != "$MAIN" ] || fail "ejecútalo desde el worktree de la feature, no desde el checkout principal"

BRANCH=$(git -C "$WT" branch --show-current)
[ -n "$BRANCH" ] || fail "el worktree no está en una rama"
[ "$(git -C "$MAIN" branch --show-current)" = "main" ] || fail "el checkout principal ($MAIN) no está en main"
git -C "$MAIN" diff --quiet HEAD || fail "main tiene cambios sin commitear en $MAIN"

DIRTY=$(git -C "$WT" status --porcelain)
if [ -n "$DIRTY" ] && [ -z "$FORCE" ]; then
  echo "$DIRTY" >&2
  fail "el worktree tiene cambios sin commitear; commitéalos o repite con --force para descartarlos"
fi

echo "==> Actualizando main desde origin"
git -C "$MAIN" fetch origin
git -C "$MAIN" merge --ff-only origin/main
git -C "$MAIN" merge-base --is-ancestor origin/main "$BRANCH" ||
  fail "$BRANCH no está al día con main; rebásala sobre main y vuelve a intentarlo"

HEAD_SHA=$(git -C "$WT" rev-parse HEAD)
echo "==> Publicando $BRANCH"
git -C "$WT" push --force-with-lease -u origin "$BRANCH"

# gh resuelve el repositorio desde el directorio actual.
cd "$WT"
if ! gh pr view "$BRANCH" --json state --jq .state 2>/dev/null | grep -qx OPEN; then
  echo "==> Creando el PR"
  gh pr create --base main --head "$BRANCH" --fill
fi

echo "==> Esperando el check obligatorio"
# GitHub tarda unos segundos en registrar el check de un push nuevo.
tries=0
until [ "$(gh pr checks "$BRANCH" --required --json name --jq length 2>/dev/null || echo 0)" -gt 0 ]; do
  tries=$((tries + 1))
  [ "$tries" -le 30 ] || fail "GitHub no registró el check obligatorio del PR"
  sleep 5
done
gh pr checks "$BRANCH" --required --watch --fail-fast ||
  fail "el check obligatorio falló; corrige la rama y vuelve a ejecutar el script"

echo "==> Integrando el PR en main"
gh pr merge "$BRANCH" --rebase --match-head-commit "$HEAD_SHA"
[ "$(gh pr view "$BRANCH" --json state --jq .state)" = "MERGED" ] ||
  fail "GitHub no marcó el PR como integrado"

if git -C "$MAIN" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git -C "$MAIN" push origin --delete "$BRANCH"
fi
git -C "$MAIN" fetch origin
git -C "$MAIN" merge --ff-only origin/main

case "$CALLER/" in
  "$WT"/*)
    # Si el script corre dentro del worktree, la sesión que Orca cierra es la propia.
    # La limpieza se lanza con la copia de main en una sesión de proceso nueva
    # (setsid) para que termine aunque Orca detenga esta.
    LOG="${TMPDIR:-/tmp}/integrar-feature-$(basename "$WT").log"
    echo "==> $BRANCH integrada en main"
    echo "==> Eliminando el worktree en segundo plano (registro: $LOG); esta sesión se cerrará"
    cd "$MAIN"
    perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' \
      sh "$MAIN/scripts/integrar-feature.sh" --limpiar "$WT" "$MAIN" "$BRANCH" "$FORCE" \
      >"$LOG" 2>&1 </dev/null &
    ;;
  *)
    echo "==> Eliminando el worktree y la rama"
    remove_worktree
    echo "==> $BRANCH integrada en main"
    ;;
esac
