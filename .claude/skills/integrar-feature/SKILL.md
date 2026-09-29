---
name: integrar-feature
description: Integra en main la rama del worktree actual de Ritmo y después elimina el worktree, su rama y su sesión en Orca. Úsala cuando pidan integrar, mergear o llevar a main una feature o un PR de este proyecto.
---

# Integrar una feature en main

Integra la rama del worktree en `main` y limpia el worktree con `scripts/integrar-feature.sh`. El script hace esto:

1. Comprueba que el checkout principal está en `main` sin cambios y lo actualiza desde `origin/main`.
2. Hace `git merge --ff-only` de la rama y ejecuta `npm test` en `main`. Si las pruebas fallan, deshace la integración local y se detiene.
3. Sube `main` a `origin` (así GitHub marca el PR como integrado) y borra la rama remota.
4. Elimina el worktree con `orca worktree rm`, lo que cierra sus terminales y la sesión del agente, y borra la rama local. Si el worktree no está en Orca, usa `git worktree remove`.

## Pasos

1. Confirma que el trabajo está commiteado y que el PR, si existe, está aprobado o que el usuario pidió integrarlo.
2. Revisa `git status --short` en el worktree. Si hay cambios sin commitear, enséñaselos al usuario y pregúntale si los descarta (con `--force`) o los commitea. Nunca uses `--force` sin su confirmación.
3. Si la rama no admite fast-forward, rebásala sobre `main`, resuelve los conflictos, ejecuta `npm run typecheck` y `npm test` y vuelve a subirla antes de seguir.
4. Avisa al usuario de que la sesión se cerrará al terminar y resume lo que se va a integrar. Ese resumen es tu último mensaje útil.
5. Ejecuta el script desde el worktree como **última acción**:

   ```bash
   scripts/integrar-feature.sh           # o: scripts/integrar-feature.sh --force
   ```

   Cuando corre dentro del worktree, la eliminación sigue en segundo plano y deja un registro en `$TMPDIR/integrar-feature-<nombre>.log`. Esta sesión termina cuando Orca quita el worktree, así que no planees nada después.
