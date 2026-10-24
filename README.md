# ConectaRos

Plataforma comunitaria independiente para compartir y seguir reclamos urbanos de Rosario. React + Vite + TypeScript + Tailwind CSS. El listado consulta Supabase; los registros ficticios se identifican como «Ejemplo» y no existe integración municipal automática.

## Ejecutar

Requiere Node.js >=22.12 (recomendado: 24 LTS) y npm.

```sh
npm ci
```

Copiá `.env.example` a `.env.local` y configurá localmente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. No publiques el archivo ni uses claves secretas. Reiniciá Vite después de cambiar variables.

```sh
npm run dev
```

La interfaz inicia sin configuración, pero el listado muestra un error. **No hay fallback a datos locales.** Aplicá las migraciones y el seed según [la guía de Supabase](docs/supabase-setup.md).

## Estado de la integración

- **Mi barrio:** consulta `claims` y categorías desde Supabase, solo con moderación aprobada. Incluye carga, error con reintento, lista vacía y filtros por categoría, barrio y grupo de estado. Las tarjetas resumen el estado; el detalle muestra la etapa exacta. Los filtros agrupan `publicado` como pendiente, `resuelto` como resuelto y los demás como en proceso.
- Los contadores y barrios se calculan con la respuesta remota. Las categorías de navegación y la ilustración del barrio son locales. La ilustración no es un mapa real.
- `src/data/claims.ts` queda como referencia histórica, **sin importaciones en la aplicación**. Los nueve ejemplos se insertan con `supabase/seed.sql` y se identifican con `is_demo`.
- **Autenticación:** registro, confirmación por correo con PKCE, login/logout, sesión y perfil/roles propios. El usuario informó haber probado registro/login reales; esta entrega no creó cuentas ni envió correos. Ver [configuración de Auth](docs/auth-setup.md).
- **Crear reclamo y Mis reclamos:** formulario autenticado, categorías remotas, foto opcional, reintentos idempotentes, lista propia paginada y detalle con moderación/gestión, fotografía privada e historial público permitido. Aplicá primero la sexta migración según [la guía de reclamos](docs/claims-setup.md). La escritura y Storage reales de este módulo quedan pendientes de tu prueba manual.
- **Beneficios** continúa informativo. No hay autenticación simulada. Edición, eliminación, apoyos, aportes, puntos y canjes no se agregan en esta entrega.
- El SQL implementa roles, moderación, historial, derivaciones privadas, puntos, beneficios, canjes y Storage. Solo existirán remotamente después de aplicar las migraciones.
- Última consulta remota exitosa previa al rediseño (24/10/2026): REST **HTTP 200**, nueve reclamos reconocidos del seed y nueve categorías. El nuevo intento durante la revisión visual no obtuvo respuesta de red (HTTP 0), por lo que no se volvió a confirmar la conexión real en esta entrega. El agente no aplicó migraciones remotas ni configuró Auth; la quinta migración para el nombre debe ejecutarse antes de probar el registro.

## Comprobaciones

```sh
npm test                 # Auth, reclamos, Storage y formularios con mocks/JSDOM
npm run test:db          # Migraciones, seed repetible, RLS, RPC y políticas Storage en PGlite
npm run types:db         # Tipos de filas generados desde las migraciones locales
npm run verify:supabase  # Consulta real usando .env.local, sin imprimir sus valores
npm run build           # TypeScript y compilación de producción
npm run preview
```

PGlite ejecuta PostgreSQL en WASM con contratos mínimos de Auth y Storage. No prueba servicios HTTP de Supabase ni concurrencia entre conexiones. `npm run test:concurrency` requiere un PostgreSQL local desechable vacío y `TEST_DATABASE_URL`; ver la guía.

## Sistema visual y revisión aislada

El sistema visual, los componentes compartidos, el mapeo de estados y la revisión responsive se documentan en [la guía de frontend](docs/frontend-design.md).

Para inspeccionar pantallas sin credenciales ni operaciones remotas:

```sh
node scripts/visual-review.mjs
```

Abrí `http://127.0.0.1:5186/?scenario=home`. El selector permite revisar carga, error, sesión ficticia local y reclamos propios. Estos fixtures viven en `scripts/visual-fixtures`, tienen una entrada separada y **nunca son fallback de la aplicación de producción**. El servidor no lee archivos `.env` y bloquea solicitudes externas desde esa página.

## Estructura

```text
src/components/               Tarjetas y categorías
src/hooks/useClaims.ts        Consulta, carga, cancelación, error y reintento
src/lib/supabase.ts           Una instancia compartida de cliente
src/lib/claims.ts             Consulta paginada y adaptación de filas
src/types/                    Modelo de UI y filas generadas desde SQL local
supabase/migrations/          Esquema, permisos, RPC y Storage
supabase/seed.sql             Nueve ejemplos, sin usuarios ni puntos
supabase/tests/               Pruebas SQL
scripts/                      Verificación remota y pruebas locales
docs/supabase-setup.md        Instalación y decisiones de seguridad
```

## Vercel

`vercel.json` configura Vite, `npm run build` y salida `dist`. Configurá las dos variables públicas en Vercel y recompilá al cambiarlas. La navegación no necesita reescrituras. Esta tarea no despliega ni hace push.
