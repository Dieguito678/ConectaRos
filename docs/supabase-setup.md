# Supabase: instalación y verificación

## Estado comprobado

El frontend consulta Supabase usando las variables de `.env.local`, revisadas sin imprimir sus valores. La primera comprobación recibió `404 / PGRST205`. La comprobación posterior del 24/10/2026, durante la entrega de Auth, recibió **HTTP 200 con los nueve registros del seed y nueve categorías**. La lectura pública está verificada; el agente no aplicó las migraciones remotas. Para Auth, aplicá la nueva quinta migración y revisá [auth-setup.md](auth-setup.md).

No se dispone de MCP de Supabase, CLI autenticada ni acceso administrativo. No se pudo inspeccionar el catálogo remoto, verificar propiedad administrativa, aplicar migraciones ni cargar el seed remoto. La clave pública no permite hacerlo. No se solicitaron contraseñas ni claves secretas.

## Aplicar en SQL Editor

1. Abrí el proyecto correcto en Supabase Dashboard. Compará **localmente** su referencia en Settings con el host de `VITE_SUPABASE_URL`. No compartas el contenido de `.env.local`.
2. En **SQL Editor**, con el rol de administración del proyecto (`postgres`), ejecutá esta inspección de solo lectura:

```sql
select current_database(), current_user, version();
select table_schema, table_name from information_schema.tables
where table_schema in ('public', 'private') order by 1, 2;
select schemaname, tablename, policyname from pg_policies
where schemaname in ('public', 'storage') order by 1, 2, 3;
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'claim-photos';
```

3. Es una instalación inicial: requiere que no existan las tablas/tipos/funciones de ConectaRos, el esquema `private` ni el bucket `claim-photos`. Si hay objetos coincidentes, detenete y prepará una migración compatible después de inspeccionarlos. Los archivos fallan ante conflictos, sin reemplazar objetos, borrar tablas ni resetear datos. No aplicar sobre otro producto que use `private`.
4. Creá una consulta por archivo, pegá **todo su contenido** (incluyendo `begin`/`commit`) y ejecutalos una sola vez, en este orden. Si uno falla, no avances:

| Orden | Archivo | Contenido |
| --- | --- | --- |
| 1 | `supabase/migrations/20261024000100_initial_schema.sql` | Tablas, tipos, índices, perfil Auth y cierre inicial de permisos |
| 2 | `supabase/migrations/20261024000200_policies.sql` | RLS y permisos por columna |
| 3 | `supabase/migrations/20261024000300_transactional_functions.sql` | RPC autorizadas y transaccionales |
| 4 | `supabase/migrations/20261024000400_storage.sql` | Bucket privado y controles de fotos |
| 5 | `supabase/migrations/20261024000500_auth_profile_display_name.sql` | Nombre visible validado al crear el perfil Auth |
| 6 | `supabase/seed.sql` | Categorías y nueve reclamos ficticios |

Cada archivo es una transacción. Si queda una transacción abortada tras un error, ejecutá `rollback;` antes de investigar y reintentar ese archivo. SQL Editor no registra automáticamente el historial de la CLI: conservá un registro de archivos ejecutados. Antes de usar luego `supabase db push`, reconciliá el historial con `supabase migration repair` de acuerdo con lo realmente aplicado. Nunca ejecutes un reset remoto.

5. En Settings → API, mantené `public` expuesto y **no expongas `private`**. No desactives RLS. La última migración recarga PostgREST; si la API todavía no ve el esquema, ejecutá:

```sql
notify pgrst, 'reload schema';
```

6. Verificá la carga desde SQL Editor:

```sql
select c.id, cat.slug, c.title, c.status, c.is_demo, c.moderation_status
from public.claims c join public.categories cat on cat.id = c.category_id
where c.is_demo order by c.created_at desc, c.id desc;
select count(*) from public.point_movements; -- el seed no crea movimientos
```

7. Reiniciá Vite y ejecutá `npm run verify:supabase`. Debe informar `success: true`, HTTP 200 y nueve filas del seed en una instalación inicial. La herramienta no imprime URL, clave, cabeceras ni errores crudos. Una lista vacía puede indicar seed pendiente o filas no visibles, y se informa como respuesta vacía, no como error.
8. En **Mi barrio**, comprobá las tarjetas marcadas como ficticias, el indicador `Fuente: Supabase`, búsqueda, filtros y detalle. En Network podés comprobar la petición a `claims`; no compartas capturas de cabeceras. Ante un error, deben mostrarse el error y el botón Reintentar, sin ejemplos locales.

## Primer administrador

Registrá primero una cuenta real mediante el nuevo formulario de Supabase Auth o las herramientas de administración de Authentication del Dashboard. Aplicá antes la quinta migración y la configuración de [autenticación](auth-setup.md). No insertes contraseñas en `auth.users`.

Tomá el UUID de Authentication → Users y verificá a quién corresponde. En SQL Editor reemplazá el placeholder y ejecutá desde el entorno confiable:

```sql
begin;
insert into public.user_roles(user_id, role)
values ('REEMPLAZAR-POR-UUID-DE-AUTH'::uuid, 'admin')
on conflict (user_id, role) do nothing;
insert into private.admin_audit(actor_id, action, subject_id, details)
values ('REEMPLAZAR-POR-UUID-DE-AUTH'::uuid, 'trusted_admin_bootstrap',
        'REEMPLAZAR-POR-UUID-DE-AUTH'::uuid, '{"source":"SQL Editor"}');
commit;
```

No existe RPC de autoasignación. `user_metadata` no otorga autoridad. Todas las cuentas autenticadas son vecinos; un comercio aprobado añade `ambassador` sin quitar otros roles. Rechazar el último comercio aprobado del propietario quita ese rol. Las RPC verifican propiedad y aprobación actual del comercio, además de la identidad.

## Modelo y permisos

- `profiles`: privado para su titular, sin correos ni contraseñas. No hay directorio público de perfiles. Los visitantes tampoco reciben UUID de autores. `user_roles` solo se lee para la propia cuenta y no admite escritura del cliente.
- `categories`, `entities` y `entity_categories`: directorios públicos mantenidos con SQL confiable. Los organismos no son cuentas.
- `claims`: autor, categoría, organismo opcional, ubicación y fechas. Estado operativo y moderación son independientes. Un reclamo nace `publicado`/`pendiente`; validar permite publicarlo y premiarlo, no resolverlo. Solo los aprobados son visibles al visitante.
- Los reclamos y aportes no se editan directamente: las correcciones se realizan con nuevos aportes sujetos a revisión. Las columnas sensibles no tienen permisos de escritura del cliente, tampoco para usuarios administradores.
- `claim_supports`: un apoyo por usuario/reclamo, visible en forma agregada. `claim_contributions`: experiencias, evidencia y actualizaciones inmutables con revisión separada.
- `claim_referrals`: números de trámite, canales, comprobantes y notas internas, accesibles solo a administradores. `receipt_reference` es una referencia interna, nunca un enlace público a comprobantes. `claim_history` contiene solo estados y notas expresamente públicas.
- `businesses`, `rewards`, `redemptions` y `point_movements`: propiedad, aprobación, condiciones, stock, cupones y libro contable. Los comerciantes no enumeran cupones de clientes: usan RPC con un UUID de cupón concreto.
- `private.admin_audit` conserva las acciones administrativas. No hay borrado en cascada de auditoría, canjes o movimientos; eliminar cuentas exige un proceso confiable de anonimización.

Todos los usuarios autenticados conservan su rol de vecino. Ni siquiera un administrador puede validar su propio reclamo/aporte, aprobar su comercio o cerrar su propio reclamo para premiarse. Las funciones privilegiadas verifican `auth.uid()`, usan `search_path` vacío y objetos calificados, y no tienen `EXECUTE` público. Los helpers evitan consultar recursivamente tablas bajo sus propias políticas.

### RPC

| Función | Autorización |
| --- | --- |
| `review_business(uuid, boolean)` | Administrador ajeno al comercio |
| `review_claim(uuid, boolean)` | Administrador ajeno al reclamo |
| `hide_claim(uuid, text)` | Administrador ajeno al reclamo |
| `review_contribution(uuid, boolean)` | Administrador ajeno al aporte |
| `update_claim_status(uuid, claim_status, text)` | Administrador ajeno al reclamo |
| `record_claim_referral(...)` | Administrador |
| `save_reward(...)` | Propietario de comercio aprobado |
| `redeem_reward(reward_id, idempotency_key)` | Usuario autenticado, solo para sí mismo |
| `inspect_coupon(coupon)` / `use_coupon(coupon)` | Propietario del comercio aprobado correspondiente |
| `get_my_balance()` | Usuario autenticado, saldo propio |
| `get_claim_support_counts(uuid[])` | Visitantes y usuarios, máximo 200 IDs visibles |

`save_reward` es el único canal de edición de beneficios y stock desde el cliente; bloquea el comercio y actualiza en transacción. Conceder `EXECUTE` a `authenticated` no otorga autoridad administrativa: la RPC comprueba los permisos nuevamente.

### Puntos y canjes

Reglas en `private.point_rules`: 20 por validar un reclamo, 10 por aporte validado (máximo 3 por persona/reclamo) y 10 extra por resolución validada. Los apoyos no puntúan. El texto repetido tras normalizar espacios y mayúsculas se rechaza; un revisor debe comprobar que un aporte distinto sea sustantivo. No se premia automáticamente por comentar.

Los movimientos no se editan desde el cliente. La unicidad `(reason, event_id)` impide premiar de nuevo al revalidar o reabrir/cerrar. El saldo se calcula por suma, sin un campo desnormalizado que pueda desincronizarse. Créditos y débitos bloquean la fila de perfil; el límite de aportes se comprueba bajo ese bloqueo.

**Revocar una validación no quita créditos ya ganados.** Oculta/rechaza el registro, registra la decisión y conserva los movimientos; reaprobar no repite el premio. Así no se genera un saldo negativo cuando se gastaron los puntos. Una futura política de sanciones requiere movimientos compensatorios auditados, sin borrar anteriores.

El canje bloquea perfil, comercio y beneficio, verifica saldo, stock, aprobación y vigencia, y descuenta/emite el cupón en la misma transacción. La clave UUID de idempotencia pertenece al usuario: repetirla devuelve el canje original y usarla para otro beneficio falla. El cupón conserva costo, título, condiciones y vencimiento. El vencimiento se evalúa al consultar/usar; no requiere cron. `cancelado` está reservado para futuras operaciones confiables; no existe RPC de cancelación del cliente.

### Transiciones

```text
publicado → en_revision o presentado
en_revision → presentado
presentado → recepcion_confirmada o en_revision
recepcion_confirmada → en_tratamiento o en_revision
en_tratamiento → solucion_informada o en_revision
solucion_informada → resuelto o en_tratamiento
resuelto → en_revision
```

Resolver requiere validación activa. La primera validación de un reclamo ya resuelto exige reabrirlo. El seed es carga confiable: muestra estados ilustrativos sin validaciones ni premios de usuarios.

## Storage

Bucket privado `claim-photos`, máximo 5 MiB (5.242.880 bytes), MIME JPEG/PNG/WebP. Rutas con UUID, sin nombres o correos:

```text
<auth.uid()>/<claim_id>/claim/<file_uuid>.jpg
<auth.uid()>/<claim_id>/<contribution_id>/<file_uuid>.webp
```

Subir primero con Storage y luego insertar `claim_attachments`. Se comprueban usuario, propiedad, reclamo/aporte y existencia del objeto. La foto de un reclamo se carga antes de su revisión; un aporte nuevo permite evidencia adicional en un reclamo visible. La asociación se bloquea contra la revisión simultánea. El cliente no puede reemplazar, borrar o sobrescribir evidencia, incluso si otras políticas de Storage fueran permisivas.

Las lecturas exigen una asociación con reclamo/aporte visibles, salvo propietario o administrador. Preferir descargas autorizadas de Storage con sesión actual; no usar `getPublicUrl`. **Una URL firmada ya emitida puede seguir válida hasta vencer aunque se oculte un reclamo**. La app no emite URLs firmadas; evitarlas permite revocar nuevas lecturas de inmediato. Los objetos huérfanos deben limpiarse mediante un proceso confiable de Storage API, no borrando filas manualmente.

Los tests verifican configuración y políticas SQL, no el rechazo HTTP de MIME/tamaño incorrectos ni el contenido binario. Falta probar Storage real antes de habilitar un cargador de fotos; ese cargador no está implementado.

## Seed y tipos

`supabase/seed.sql` crea nueve categorías y nueve ejemplos de Rosario con UUID estables, `is_demo=true`, sin autores, usuarios, contraseñas ni puntos. No necesita Auth Admin. Es repetible sin duplicar datos ni revertir moderaciones y no limpia tablas remotas. No crea comercios o beneficios que aparenten estar operativos.

`src/types/database.generated.ts` contiene filas y enums generados desde el catálogo PostgreSQL de las migraciones locales. No representa permisos de escritura ni el contrato RPC completo, y no fue generado desde un proyecto remoto. `npm run types:db` lo regenera. Con acceso CLI verificado puede complementarse con `supabase gen types typescript`.

## Pruebas y límites

```sh
npm test
npm run test:db
npm run types:db
npm run build
```

`test:db` ejecuta las cinco migraciones, carga el seed dos veces y prueba RLS/RPC/Storage y el perfil Auth con PostgreSQL WASM (PGlite), roles reales de PostgreSQL e identidades de prueba. Los fixtures se revierten. Prueba privacidad, autoría, columnas sensibles, roles, comercios, premios únicos, límite de aportes, apoyos duplicados, transiciones, resolución, saldo/stock/vigencia, idempotencia, condiciones conservadas, uso único y fotos ocultas.

Auth y Storage se representan con contratos mínimos en el runner: no se prueba su HTTP real, JWT ni cuentas remotas. El frontend tiene 31 pruebas con respuestas controladas, incluyendo formularios, sesión y lectura pública. La lectura remota de los nueve reclamos se comprobó aparte por REST; el recorrido real de Auth sigue pendiente según [su guía](auth-setup.md).

### Concurrencia con dos conexiones

No se ejecutó: el motor Docker no está iniciado y no hay PostgreSQL local multiusuario disponible. `npm run test:concurrency` está preparado para una **base local vacía desechable**, con permisos para crear esquemas/roles y nombre terminado en `_conectaros_test`. Rechaza hosts remotos y bases con tablas. No lee `.env.local`, no borra ni resetea bases y deja fixtures para revisión.

Ejemplo opcional con Docker iniciado e imagen oficial de PostgreSQL, usando autenticación trust únicamente en un contenedor de pruebas ligado a loopback:

```powershell
docker run --name conectarostest --publish 127.0.0.1:55432:5432 --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=isolated_conectaros_test --detach postgres:17
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/isolated_conectaros_test'
npm run test:concurrency
```

No usar esa configuración en producción. El script comprueba competencia por último stock, reintento simultáneo, gasto concurrente del mismo saldo y doble validación de cupón. Para repetirlo, elegí otra base vacía; no limpia instalaciones existentes.

Referencias: [funciones](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage/security/access-control).
