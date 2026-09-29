# Plan de adopción de UI para Ritmo

**Estado: implementado.** El renderer usa Tailwind CSS 4 y daisyUI 5 con un tema local `ritmo`. La compilación genera `dist/src/styles.css` y `npm start` abre la app sin recursos externos. Se comprobaron tareas, dominios y descansos en Electron; el flujo de foco no se activó durante la revisión visual porque solicita autorización de macOS y modifica `/etc/hosts`.

## Decisión propuesta

Adoptar **Tailwind CSS 4 + daisyUI 5** en el renderer de Electron. Mantener HTML y TypeScript sin incorporar React. Usar daisyUI para botones, entradas, tarjetas, insignias y alertas; usar utilidades de Tailwind para distribución y espaciado. Conservar CSS propio para el anillo del temporizador y detalles de identidad visual.

La decisión busca reducir CSS repetido y dar consistencia a los controles sin reescribir la lógica del producto. La interfaz actual es pequeña: un solo documento HTML, `src/renderer.ts` que actualiza el DOM y `src/styles.css` con los estilos. El proceso principal y la API de `preload` pueden permanecer como están.

## Alternativas evaluadas

| Opción | Encaje con el proyecto | Costo principal | Resultado |
| --- | --- | --- | --- |
| Solo Tailwind CSS | Se integra con el HTML actual mediante CLI | Hay que definir y mantener los componentes | Útil si se quiere un sistema visual completamente propio |
| Tailwind CSS + daisyUI | Funciona con HTML y tiene instalación documentada para Electron | Hay que adaptar el tema para conservar la identidad de Ritmo | **Recomendada** |
| shadcn/ui | Componentes editables y control fino | Su guía de Vite parte de React; exige migrar el renderer a React, TSX y Vite | Reservar para una futura interfaz mucho más compleja |

Tailwind es un motor de estilos, no una biblioteca de componentes. daisyUI proporciona los componentes que se buscan sin añadir un framework de interfaz. shadcn/ui merece reconsiderarse si crece mucho la interacción de la app y una migración a React aporta valor por sí misma.

## Alcance y secuencia

### 1. Base de estilos y compilación

- Añadir `tailwindcss`, `@tailwindcss/cli` y `daisyui` como dependencias de desarrollo.
- Crear una entrada CSS que importe Tailwind y active daisyUI. Configurar un tema claro con los colores actuales: azul marino, azul y amarillo.
- Actualizar `npm run build` para generar el CSS local en `dist/src/styles.css` antes de iniciar Electron; agregar un script de observación para desarrollo si hace falta.
- Mantener la política de seguridad que carga recursos desde `'self'`. No usar CDN en tiempo de ejecución.
- Verificar que Tailwind detecta las clases del HTML y las clases creadas en `renderer.ts`.

### 2. Migración de componentes

- Migrar botones y estados deshabilitados, formularios, tarjetas, insignia de estado, chips de dominios y alerta de error.
- Mantener etiquetas accesibles, mensajes de error y foco visible. Revisar navegación por teclado.
- Dejar el anillo, el progreso cónico y el diseño de la marca en CSS propio; migrar su distribución solo si simplifica el código.
- Evitar clases dinámicas construidas por fragmentos: usar cadenas completas para que la compilación incluya cada variante.

### 3. Limpieza y verificación

- Retirar reglas CSS reemplazadas y centralizar los valores visuales del tema.
- Revisar tamaños de ventana grande, media y estrecha; estados de foco, descanso, bloqueo pendiente, lista vacía y operación ocupada.
- Ejecutar `npm run typecheck`, `npm test` y una inspección visual de la app en macOS. Confirmar que el CSS compilado existe al abrir la app sin conexión.
- Comprobar que las acciones del temporizador, las tareas y los dominios siguen conectadas a la misma API de `preload`.

## Criterios para dar la migración por terminada

1. `npm start` abre una interfaz completa usando únicamente archivos locales.
2. Los controles principales comparten estilos y estados consistentes; los colores y la personalidad de Ritmo siguen reconocibles.
3. El temporizador y todas las acciones existentes funcionan en cada estado de la app.
4. No quedan reglas duplicadas para componentes migrados; las pruebas y el chequeo de tipos pasan.

## Riesgos concretos

- El estilo predeterminado de daisyUI puede cambiar la apariencia de la app. Definir el tema antes de migrar componentes y comparar cada panel con la interfaz actual.
- El CSS generado depende de que el script de compilación corra antes de Electron. Hacerlo parte de `build`, no un paso manual.
- Las clases de elementos creados desde TypeScript deben ser visibles para el escaneo de Tailwind; usar nombres completos y comprobar cada estado.

## Referencias

- [Instalación de daisyUI para Electron](https://daisyui.com/docs/install/electron/)
- [Instalación de daisyUI](https://daisyui.com/docs/install/)
- [Guía de actualización de Tailwind CSS 4](https://tailwindcss.com/docs/upgrade-guide)
- [Instalación de shadcn/ui con Vite](https://ui.shadcn.com/docs/installation/vite)
