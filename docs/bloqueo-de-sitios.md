# Bloqueo de sitios

Durante el foco, Ritmo añade los dominios de **Sitios en pausa** a una sección identificada de `/etc/hosts` y la retira al terminar. Las entradas ajenas a esa sección no se tocan.

## Qué se bloquea

La lista inicial es `facebook.com`, `linkedin.com`, `x.com` y `twitter.com`; puedes añadir o quitar dominios antes de iniciar el foco. El bloqueo aplica al dominio exacto y a `www.`: `/etc/hosts` no permite bloquear todos los subdominios, y ciertas configuraciones de DNS o de red podrían evitarlo.

## El helper

En el primer pomodoro, macOS pide autorización de administrador para instalar un helper limitado en `/Library/PrivilegedHelperTools/ritmo-block-sites` y una regla por cuenta en `/etc/sudoers.d/ritmo-<usuario>` (si el nombre de la cuenta tiene puntos, en el archivo aparecen como `%`, porque sudo ignora los archivos con punto). Después, Ritmo lo usa sin pedir autorización al iniciar o terminar cada foco. Si el script cambia tras una actualización, o se pierde el permiso de la cuenta, macOS vuelve a pedirla para restaurarlo.

El helper solo permite modificar la sección de Ritmo en `/etc/hosts`.

## Recuperación

- Si no puede quitar el bloqueo, la app muestra **Quitar bloqueo** para reintentar.
- Al salir (Cmd+Q, Ctrl+C en `npm start`, `SIGTERM` o apagado de macOS), la app espera la operación en curso, hasta unos 2 minutos y medio por si macOS está pidiendo autorización, e intenta quitar el bloqueo con el helper ya instalado, sin pedirla. Si no lo consigue, sale igualmente, lo avisa con una notificación y ofrece **Quitar bloqueo** al volver a abrirla. El foco interrumpido no cuenta como pomodoro.
- Si la app se cierra de forma inesperada, al volver a abrirla detecta la sección y permite retirarla.

## Contrapartida de seguridad

La regla de sudoers deja que cualquier proceso que corra con tu cuenta ejecute el helper sin contraseña. Para limitarlo:

- El helper fija su propio `PATH` y llama cada orden por su ruta absoluta, y la regla añade `secure_path`, así que ese proceso no puede colarle programas propios.
- Solo acepta dominios válidos y solo escribe la sección de Ritmo, con cada entrada apuntando a `0.0.0.0` o `::1`. Lo peor que puede hacer ese proceso es bloquear sitios o quitar el bloqueo.

Además, el helper instalado queda como root hasta que lo desinstales: si alguien modificara el `block-sites.sh` de la app, la siguiente solicitud de autorización instalaría esa versión.

## Desinstalar

Después de quitar cualquier bloqueo activo, elimina con permisos de administrador la regla de tu cuenta en `/etc/sudoers.d/ritmo-<usuario>` y `/Library/PrivilegedHelperTools/ritmo-block-sites`. Las instalaciones anteriores pueden tener además una regla en `/etc/sudoers.d/ritmo`.
