---
name: integrar-feature
description: Integra en main la rama del worktree actual de Ritmo y después elimina el worktree, su rama y su sesión en Orca. Úsala cuando pidan integrar, mergear o llevar a main una feature o un PR de este proyecto.
---

# Integrar una feature en main

`main` está protegida por un ruleset: solo acepta cambios por PR, con el check `ci` de GitHub Actions aprobado y la rama al día con `main`, e integrados por rebase. No se puede hacer push directo. `scripts/integrar-feature.sh` sigue ese flujo:

1. Comprueba que el checkout principal está en `main` sin cambios, lo actualiza desde `origin/main` y que la rama contiene `origin/main`.
2. Sube la rama (`--force-with-lease`) y crea su PR con `gh pr create --fill` si no hay uno abierto.
3. Espera el check `ci` (`npm ci`, `npm run typecheck`, `npm test` en macOS). Si falla, se detiene sin integrar.
4. Integra el PR con `gh pr merge --rebase`, borra la rama remota y actualiza `main` local.
5. Elimina el worktree con `orca worktree rm`, lo que cierra sus terminales y la sesión del agente, y borra la rama local. Si el worktree no está en Orca, usa `git worktree remove`.

Necesita `gh` autenticado con permiso de escritura en el repositorio.

## Pasos

1. Confirma que el trabajo está commiteado y que el usuario pidió integrarlo. Si el PR aún no existe, puedes crearlo antes con una descripción propia; si no, el script lo crea con los mensajes de los commits.
2. Revisa `git status --short` en el worktree. Si hay cambios sin commitear, enséñaselos al usuario y pregúntale si los descarta (con `--force`) o los commitea. Nunca uses `--force` sin su confirmación.
3. Si la rama no está al día con `main`, rebásala sobre `main`, resuelve los conflictos y ejecuta `npm run typecheck` y `npm test` antes de seguir; el script sube la rama rebasada.
4. Avisa al usuario de que la sesión se cerrará al terminar y resume lo que se va a integrar. Ese resumen es tu último mensaje útil.
5. Ejecuta el script desde el worktree como **última acción**:

   ```bash
   scripts/integrar-feature.sh           # o: scripts/integrar-feature.sh --force
   ```

   Cuando corre dentro del worktree, la eliminación sigue en segundo plano y deja un registro en `$TMPDIR/integrar-feature-<nombre>.log`. Esta sesión termina cuando Orca quita el worktree, así que no planees nada después. Si el check falla, el script se detiene antes de integrar y la sesión sigue abierta: corrige, commitea y vuelve a ejecutarlo.
