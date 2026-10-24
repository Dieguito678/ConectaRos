# Diseño de ConectaRos

El rediseño conserva el cliente único de Supabase, las consultas remotas, el flujo de Auth y el módulo de reclamos. No requiere migraciones, dependencias nuevas ni cambios remotos. Las migraciones y configuraciones pendientes de entregas previas siguen documentadas en las guías de Auth y reclamos.

## Identidad y componentes

Los tokens se centralizan en `src/styles.css`: verde principal `#164d3d`, acento lima `#d5edac`, fondo `#f6f8f4`, superficies blancas y texto `#20382d`. Se reutiliza Segoe UI con fallback sans serif, ancho máximo de 1240 px y radios de 10, 16 y 24 px.

- `SiteHeader`, `Brand` y `SiteFooter`: navegación real, CTA, cuenta con iniciales y footer de independencia, ubicación y año dinámico.
- `CommunityHero`: propuesta, acceso al listado real y recorrido de participación sin estadísticas ni mapa simulado.
- `ClaimCardView`, `ClaimStatusBadge`, `EmptyState` y `CardSkeletons`: presentación compartida entre pantallas.
- `PublicClaimDetail`, `OwnClaimDetail`, `CreateClaimDialog` y `AuthDialog`: diálogos nativos con labels, foco visible y scroll interno. Auth y detalles se cargan al abrirlos.
- `src/auth/auth.css` y `src/claims/claims.css`: estilos de sus módulos sobre los mismos tokens.

La etiqueta secundaria «Ejemplo» depende de `is_demo`; el rediseño no altera ese valor. Se elimina el banner general de demo y se conserva una única aclaración de independencia en el footer. Beneficios presenta un estado vacío sin ofertas ni canjes simulados.

## Estados

`src/lib/claim-status.ts` es la única función de presentación. Los badges incluyen texto e icono, además del color. No se cambian enums ni valores almacenados.

| Condición | Etiqueta principal | Color |
| --- | --- | --- |
| Moderación pendiente, cualquiera sea gestión | En revisión | Ámbar |
| Moderación rechazada | No aprobado | Rojo |
| Moderación oculta | No visible | Neutro |
| Aprobado + publicado | Pendiente | Rojo |
| Aprobado + en_revision, presentado, recepcion_confirmada, en_tratamiento o solucion_informada | En proceso | Ámbar |
| Aprobado + resuelto | Resuelto | Verde |

El detalle aprobado muestra la etapa exacta: Publicado, En revisión, Presentado, Recepción confirmada, En tratamiento, Solución informada o Resuelto. «Solución informada» permanece ámbar. El detalle pendiente explica que el reclamo está siendo revisado antes de compartirlo, sin prometer plazos. El rojo de gestión no indica una emergencia.

## Revisión local

`node scripts/visual-review.mjs` inicia una entrada Vite independiente en el puerto 5186, sin configuración de entorno ni acceso a servicios remotos. Los fixtures inyectan repositorio, listado y sesión en memoria; no se importan desde la entrada productiva ni se usan como fallback.

Escenarios: `home`, `session`, `own`, `empty`, `loading`, `error`, `own-loading` y `own-error`. Para revisar la cuenta, usá la navegación «Mis reclamos» y el CTA «Crear reclamo». Cada página indica explícitamente que son datos aislados.

Se inspeccionaron home, listado, detalle público y propio, creación, login, registro, Mis reclamos vacío/con datos, Beneficios y footer. Se comprobaron anchos de 360, 390, 768, 1280 y 1440 px sin desbordamiento horizontal en home: una columna en móvil, dos a 768 y tres desde escritorio. También se revisaron formularios y detalle a 360/390 px, y foco inicial/Escape del menú compacto. Se respeta `prefers-reduced-motion`.

Las pruebas automatizadas cubren mapeo y precedencia de moderación, solución informada, navegación, validaciones, autenticación, cancelación, reintentos, idempotencia, fotografía y limpieza de sesión. Los tests de PostgreSQL usan PGlite local. Estas pruebas y los fixtures no prueban el servicio HTTP real de Auth o Storage ni concurrencia entre conexiones. No se crearon cuentas, enviaron correos ni subieron fotografías remotas para revisar el diseño.

El intento de verificación de solo lectura del listado remoto durante esta entrega terminó con HTTP 0 / error de red, también al repetirlo fuera del sandbox. No se considera una confirmación de conexión ni se atribuye la causa a Supabase. La aplicación conserva el tratamiento explícito del error y no reemplaza datos remotos por fixtures.
