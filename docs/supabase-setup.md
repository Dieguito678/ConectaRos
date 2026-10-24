# Supabase: instalación y verificación

## Estado comprobado

El frontend consulta Supabase con su configuración local. Como antecedente, la primera comprobación recibió `404 / PGRST205` y una posterior del 24/10/2026 recibió **HTTP 200 con los nueve registros del seed y nueve categorías**. Estos son resultados históricos, no una comprobación remota de la publicación automática. La entrega actual no inspeccionó el entorno remoto ni aplicó SQL. Para el frontend actual deben estar aplicadas **001–007**; revisá [Auth](auth-setup.md) y [creación/publicación de reclamos](claims-setup.md).

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

3. Para una instalación desde cero, los archivos iniciales requieren que no existan las tablas/tipos/funciones de ConectaRos, el esquema `private` ni el bucket `claim-photos`. Si hay objetos coincidentes sin un historial conocido, detenete e inspeccionalos. No apliques la instalación inicial sobre otro producto que use `private`. En una instalación existente con 001–006 aplicadas, no las repitas: la 007 reemplaza expresamente las funciones de creación y asociación conocidas, sin resetear ni borrar datos.
4. Creá una consulta por archivo, pegá **todo su contenido** (incluyendo `begin`/`commit`) y ejecutalos una sola vez, en este orden. Si uno falla, no avances:

| Orden | Archivo | Contenido |
| --- | --- | --- |
| 1 | `supabase/migrations/20261024000100_initial_schema.sql` | Tablas, tipos, índices, perfil Auth y cierre inicial de permisos |
| 2 | `supabase/migrations/20261024000200_policies.sql` | RLS y permisos por columna |
| 3 | `supabase/migrations/20261024000300_transactional_functions.sql` | RPC autorizadas y transaccionales |
| 4 | `supabase/migrations/20261024000400_storage.sql` | Bucket privado y controles de fotos |
| 5 | `supabase/migrations/20261024000500_auth_profile_display_name.sql` | Nombre visible validado al crear el perfil Auth |
| 6 | `supabase/migrations/20261024000600_claim_submission.sql` | Creación y adjunto idempotentes |
| 7 | `supabase/migrations/20261024000700_automatic_claim_publication.sql` | Alta aprobada/publicada y primera foto compatible |
| 8 | `supabase/seed.sql` | Categorías y nueve reclamos ficticios |

Cada archivo es una transacción. Si queda una transacción abortada tras un error, ejecutá `rollback;` antes de investigar y reintentar ese archivo. SQL Editor no registra automáticamente el historial de la CLI: conservá un registro de archivos ejecutados. Antes de usar luego `supabase db push`, reconciliá el historial con `supabase migration repair` de acuerdo con lo realmente aplicado. Nunca ejecutes un reset remoto.

Si 001–006 ya están aplicadas manualmente, ejecutá solo la nueva 007 antes de probar el frontend actual. El script opcional `supabase/scripts/publish_pending_claims.sql` es independiente: contiene una vista previa de todos los pendientes y un UPDATE comentado para aprobación manual consciente. No es parte de la migración ni del seed; no se ejecuta automáticamente y preserva etapas de gestión, autores y datos existentes.

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
- `claims`: autor, categoría, organismo opcional, ubicación y fechas. Estado operativo y moderación son independientes. Los defaults históricos de tabla siguen siendo `publicado`/`pendiente`, pero desde 007 el cliente no tiene INSERT directo y su RPC fija **`publicado`/`aprobado`** para cada nuevo reclamo. Publicar no equivale a validar, premiar, resolver o derivar. Solo los aprobados son visibles al visitante; pendientes históricos, ocultos y rechazados se conservan sin publicarse por aplicar la migración.
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

Subir primero con Storage y luego asociar mediante la RPC de foto. Se comprueban usuario, propiedad, reclamo/aporte y existencia del objeto. Desde 007, una primera foto principal puede seguir al alta propia aprobada/publicada si aún no tiene validación administrativa ni gestión avanzada; los pendientes históricos conservan ese permiso inicial. Ocultos/rechazados no admiten nuevas fotos. La asociación se serializa con los cambios del reclamo y el cliente no puede reemplazar, borrar o sobrescribir evidencia.

Las lecturas exigen una asociación con reclamo/aporte visibles, salvo propietario o administrador. **El bucket privado no ofrece exclusividad del autor:** las políticas existentes también autorizan a visitantes a leer fotos asociadas a reclamos aprobados y, cuando corresponde, a aportes aprobados. La aprobación automática entra en ese permiso de lectura preexistente; no se amplían políticas ni se crea una galería pública. La UI usa descargas autorizadas y object URLs temporales en el detalle propio, sin `getPublicUrl`. Una URL firmada ya emitida puede seguir válida hasta vencer aunque se oculte un reclamo; la app no las emite. Los huérfanos requieren limpieza confiable con Storage API, no borrado manual de metadata.

Los tests locales verifican configuración y políticas SQL, no el rechazo HTTP de MIME/tamaño incorrectos ni el contenido binario. El cargador existe en el formulario de creación, pero Storage real y la publicación remota con 007 deben probarse manualmente con una cuenta elegida por el usuario.

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

`test:db` ejecuta las migraciones versionadas hasta 007, carga el seed dos veces y prueba RLS/RPC/Storage y el perfil Auth con PostgreSQL WASM (PGlite), roles reales de PostgreSQL e identidades de prueba. Los fixtures se revierten. Además de las reglas previas, la actualización comprueba publicación automática por RPC, autoría fija, ausencia de puntos por el alta, primera foto compatible y exclusión pública de pendientes históricos/ocultos/rechazados. Los resultados de esta entrega deben tomarse del reporte final de tests.

Auth y Storage se representan con contratos mínimos en el runner: no se prueba su HTTP real, JWT ni cuentas remotas. El frontend usa respuestas controladas para formularios, sesión, envío, reintentos, paginación y lectura pública. La lectura REST histórica de los nueve ejemplos no verifica la publicación automática ni Storage actuales; esta entrega no repitió conexiones remotas y requiere la prueba manual de [claims-setup.md](claims-setup.md).

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
