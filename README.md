# ConectaRos

Aplicación responsive para explorar reclamos urbanos de Rosario. React + Vite + TypeScript + Tailwind CSS. El listado consulta Supabase; es una demo sin integración municipal.

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

- **Mi barrio:** consulta `claims` y categorías desde Supabase, solo con moderación aprobada. Incluye carga, error con reintento, lista vacía y filtros por categoría, barrio y grupo de estado. Las tarjetas muestran los siete estados reales; los filtros agrupan `publicado` como pendiente, `resuelto` como resuelto y los demás como en proceso.
- Los contadores y barrios se calculan con la respuesta remota. Las categorías de navegación y la ilustración del barrio son locales. La ilustración no es un mapa real.
- `src/data/claims.ts` queda como referencia histórica, **sin importaciones en la aplicación**. Los nueve ejemplos se insertan con `supabase/seed.sql` y se identifican con `is_demo`.
- **Mis reclamos** y **Beneficios** siguen siendo pantallas informativas. No hay autenticación simulada. Publicación, fotos, Auth, puntos y canjes todavía no están conectados al frontend.
- El SQL implementa roles, moderación, historial, derivaciones privadas, puntos, beneficios, canjes y Storage. Solo existirán remotamente después de aplicar las migraciones.
- Verificación del 24/10/2026: variables locales presentes; la consulta REST recibió `404 / PGRST205` para `claims`. No se aplicó SQL ni seed remoto. **Todavía no se verificó el listado con datos remotos.**

## Comprobaciones

```sh
npm test                 # Contrato de lectura: error, vacío, sin fallback, mapeo y paginación
npm run test:db          # Migraciones, seed repetible, RLS, RPC y políticas Storage en PGlite
npm run types:db         # Tipos de filas generados desde las migraciones locales
npm run verify:supabase  # Consulta real usando .env.local, sin imprimir sus valores
npm run build           # TypeScript y compilación de producción
npm run preview
```

PGlite ejecuta PostgreSQL en WASM con contratos mínimos de Auth y Storage. No prueba servicios HTTP de Supabase ni concurrencia entre conexiones. `npm run test:concurrency` requiere un PostgreSQL local desechable vacío y `TEST_DATABASE_URL`; ver la guía.

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
