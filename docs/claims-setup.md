# Crear reclamos y Mis reclamos

## Entrega

- Crear un reclamo con categorías y UUID consultados en Supabase, validación de campos y una fotografía opcional. El acceso anónimo abre el login y conserva la intención mientras la página siga abierta; cancelar el acceso no vuelve a abrirlo automáticamente.
- Reclamos propios con filtro explícito `author_id`, RLS, orden estable y páginas de 12 registros por fecha/UUID. Estados de carga, vacío, error, reintento y carga de más resultados.
- Detalle propio con descripción, ubicación textual, fecha, moderación, gestión, foto privada e historial público permitido. No se consultan notas, derivaciones ni auditoría interna. Un ID ajeno o inexistente no se distingue mediante datos privados.
- Refresco remoto después de crear, sin insertar filas artificialmente en Mi barrio. La consulta pública conserva `moderation_status = aprobado` y no usa datos locales de reemplazo.
- Sin edición, borrado, apoyos, aportes, panel administrativo, mapas, premios ni integraciones oficiales.

Archivos principales: `src/claims/repository.ts` (consultas/RPC/Storage), `submission.ts` (envío y recuperación), `CreateClaimDialog.tsx`, `MyClaims.tsx`, `OwnClaimDetail.tsx`, `hooks.ts`, `model.ts` y su integración en `src/App.tsx`. Se reutilizan el contexto Auth y el cliente único existente; no hay dependencias nuevas.

## Migración nueva: antes de probar

Las cinco migraciones anteriores ya fueron aplicadas manualmente según el contexto del proyecto. No las modifiques ni vuelvas a ejecutarlas. En SQL Editor del proyecto verificado, ejecutá **solo**:

```text
supabase/migrations/20261024000600_claim_submission.sql
```

No se ejecutó SQL remoto durante esta tarea. No ejecutes `db push` ni `reset`: el historial de la CLI no está sincronizado con el SQL Editor. Para una instalación nueva, el orden es 001 esquema → 002 políticas → 003 RPC previas → 004 Storage → 005 perfil Auth → 006 creación → seed. El seed y los datos ficticios existentes no fueron modificados.

Antes de aplicar 006 en una base que pudiera tener fotos previas, inspeccioná posibles duplicados de foto principal con SQL confiable:

```sql
select claim_id, count(*)
from public.claim_attachments
where contribution_id is null
group by claim_id having count(*) > 1;
```

La nueva restricción permite una foto principal por reclamo. Si devuelve filas, detenete e inspeccioná esos datos; no borres evidencia para forzar la migración. El archivo es transaccional y no limpia tablas, buckets ni objetos.

### Contratos de las nuevas RPC

`submit_demo_claim(p_request_id, p_expected_user, p_category_id, p_title, p_description, p_address, p_neighborhood)`:

- `p_request_id` es un UUID estable por intento, usado como PK. Repetir el mismo intento devuelve el mismo reclamo; cambiar su contenido con el mismo UUID se rechaza. Un conflicto de autor no expone el registro.
- `p_expected_user` es únicamente una guarda de sesión: debe coincidir con `auth.uid()`. El autor siempre lo elige el servidor a partir de `auth.uid()`, nunca del payload.
- El servidor fija `moderation_status=pendiente`, `status=publicado`, `is_demo=true` y ningún organismo responsable. No crea movimientos de puntos.
- Título 5–160, descripción 10–5000, dirección 3–240 y barrio 2–100, sin espacios exteriores y sin campos vacíos. Categoría existente obligatoria. El frontend también valida y usa texto libre para barrio, sin inventar un catálogo oficial.

`attach_own_claim_photo(p_claim_id, p_expected_user, p_storage_path)`:

- Verifica sesión actual, autoría, ruta, existencia del objeto y políticas del helper/trigger existentes.
- Reintentar la misma asociación devuelve su ID. Otra foto principal se rechaza; no se sobrescribe evidencia.
- Si el objeto todavía no existe devuelve `P0002`, utilizado internamente para saber que primero debe subirse. No se muestran códigos, rutas ni mensajes crudos al usuario.

Ambas RPC son `SECURITY DEFINER`, fijan `search_path`, califican los objetos y no tienen ejecución pública/anon. Solo `authenticated` puede invocarlas y sus verificaciones se repiten en el servidor. No se amplían permisos de columnas ni de lectura. Los INSERT directos anteriores mantienen sus restricciones; el formulario usa exclusivamente la nueva RPC idempotente.

No cambian columnas ni enums. Se regeneraron los tipos de filas desde las migraciones locales para comprobar el contrato; los tipos de proyección/estado del módulo están en `src/claims/model.ts`. El generador actual no genera firmas de RPC; los argumentos usados son los de esta migración y se verifican con pruebas.

### Significado de demo

Los nuevos envíos de esta aplicación de demostración se marcan `is_demo=true`, **siempre con autor autenticado**. No reutilizan la excepción de los ejemplos antiguos sin autor. El indicador nunca permite suplantar usuarios, omitir revisión o aparecer públicamente por el simple envío. Las RPC anteriores no premian reclamos marcados de demo al validarlos/resolverlos; esta entrega tampoco habilita UI de puntos. Los UUID y datos del seed se conservan.

## Storage

Se usa exclusivamente el bucket privado existente **`claim-photos`**, con sus límites de 5 MiB y MIME JPEG/PNG/WebP. No cambies su visibilidad ni desactives sus políticas. La ruta exacta de este formulario es:

```text
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.jpg
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.png
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.webp
```

No se utiliza el nombre original del archivo. El navegador valida MIME, tamaño y firma inicial; Storage valida MIME declarado y tamaño mediante la configuración del bucket. Eso no equivale a un análisis antivirus ni a una validación completa del contenido binario en el servidor.

Orden: **guardar reclamo → comprobar si una subida previa puede asociarse → subir si no existe → registrar asociación**. PostgreSQL y Storage no comparten transacción:

1. Antes de cada envío se consulta el UUID propio del intento. Si hubo una respuesta perdida, se reconcilia con la fila. Si la consulta no puede completarse, no se lanza un INSERT a ciegas.
2. Si aún no existe, la RPC idempotente usa el mismo UUID; una transacción previa en curso no puede crear un duplicado.
3. La imagen usa una ruta estable por intento, `upsert:false`. Al reintentar se prueba primero la asociación, de modo que una subida exitosa con respuesta perdida no se vuelve a subir ni se reemplaza.
4. Si falla la foto, el reclamo permanece guardado. La pantalla ofrece **Reintentar solo la imagen**, sin recrear el registro.
5. No se compensa borrando el reclamo ni se eliminan objetos sin permiso. Las políticas existentes no permiten borrar/actualizar evidencia desde el cliente. Los objetos huérfanos requieren revisión y limpieza confiable con Storage API, fuera de este módulo.

La foto solo se muestra en el detalle propio mediante descarga autorizada y `Blob`/object URL temporal. No se guardan URLs firmadas ni se usa `getPublicUrl`. No se agregan galerías públicas ni nuevas políticas de lectura. La política previa para fotos de reclamos aprobados sigue existiendo sin ampliaciones; esta UI no la utiliza para mostrar fotos públicas.

Un reclamo ya revisado no admite una nueva foto principal bajo las políticas vigentes. Si un administrador lo revisa entre la creación y el upload, la foto puede fallar aunque el reclamo exista. No se evita esa restricción; verificá el detalle y recurrí a un flujo de revisión futuro. Una asociación ya existente puede reconciliarse aunque el registro haya sido revisado.

## Probar manualmente con tu cuenta

Estas acciones escriben datos en el proyecto. **No fueron ejecutadas por el agente.** No se crearon cuentas, se enviaron correos ni se subieron fotos de prueba en esta tarea. El usuario informó previamente que registro/login ya fueron probados con Supabase; eso no demuestra que el nuevo módulo de creación/Storage funcione remotamente.

1. Aplicá 006; verificá que Auth y las migraciones anteriores están configurados. Iniciá la app en tu origen autorizado.
2. Sin sesión, pulsá **Crear reclamo**: abre Ingresar. Cancelalo y comprobá que no vuelve a abrirse solo. Repetí y entrá con tu cuenta: debe continuar al formulario. Recargar la página pierde la intención y los borradores en memoria; no se guarda información privada en el navegador.
3. Comprobá que las categorías se cargan remotamente. Probá campos cortos, largos, solo espacios y falta de categoría. Los errores deben quedar junto al campo y conservar el formulario.
4. Para un envío de prueba, usá datos ficticios y ninguna información sensible. Adjuntá opcionalmente una imagen válida de hasta 5 MiB. Probá quitarla antes de enviar y cancelar un formulario con cambios: debe pedir confirmación.
5. Enviá. Debe mostrar **Reclamo enviado para revisión**, sin puntos. Abrilo en **Mis reclamos**: moderación pendiente y gestión registrada, con una explicación de que aún no está públicamente visible.
6. Comprobá en **Mi barrio** que ese reclamo no aparece. El listado continúa leyendo únicamente aprobados desde Supabase.
7. Para simular fallo de foto sin tocar permisos ni RLS, bloqueá temporalmente la solicitud de upload a Storage en DevTools después de que el reclamo se haya guardado. Debe informarse que se conserva el reclamo. Quitá el bloqueo y usá **Reintentar solo la imagen**: no debe aparecer otro reclamo ni otro adjunto.
8. En el detalle propio comprobá la fotografía y el historial público si existe. No hay edición, eliminación ni consulta de notas internas. Un pendiente puede no tener historial visible porque la política de historial actual solo permite el de reclamos visibles.
9. Cerrá sesión o cambiá de cuenta durante una consulta/subida. Deben desaparecer formulario, listas, detalle y object URLs de la cuenta anterior. Una petición ya enviada al servidor puede completarse para su autor original; al volver a esa cuenta, revisá Mis reclamos antes de repetir. Las continuaciones del cliente se cancelan o se descartan.
10. Creá suficientes registros solo si necesitás probar **Cargar más** manualmente. No hace falta llenar la base para las pruebas automatizadas de paginación, que usan mocks.

### Comprobar fila y adjunto desde SQL Editor

Usá el UUID de tu propio reclamo y el rol confiable de SQL Editor. No compartas rutas, cabeceras, correos o tokens en capturas:

```sql
select id, author_id, title, moderation_status, status, is_demo, entity_id
from public.claims where id = 'UUID-DEL-RECLAMO'::uuid;
select id, claim_id, owner_id, contribution_id, storage_path
from public.claim_attachments where claim_id = 'UUID-DEL-RECLAMO'::uuid;
select id, bucket_id, name
from storage.objects
where bucket_id = 'claim-photos' and name in (
  select storage_path from public.claim_attachments where claim_id = 'UUID-DEL-RECLAMO'::uuid
);
select count(*) from public.point_movements
where event_id = 'UUID-DEL-RECLAMO'::uuid; -- el envío no crea puntos
```

Debe haber una fila de reclamo, como máximo una foto principal y, si la asociación fue exitosa, el objeto correspondiente. No cambies estados para solucionar errores de upload ni concedas permisos amplios.

## Pruebas y límites de esta entrega

```sh
npm test
npm run test:db
npm run types:db
npm run build
```

- **Mocks/JSDOM (50 casos del frontend):** validaciones, envío, doble clic, conciliación de resultado ambiguo, fallo/reintento de foto, object URLs, carga/vacío/error, acceso anónimo, continuación del login, descarte, filtros por autor, paginación y limpieza al cambiar de usuario/logout, junto con las pruebas previas de Auth y lectura pública. Las respuestas simuladas no prueban Auth/Storage HTTP.
- **SQL local/PGlite:** seis migraciones, seed repetido y cuatro suites. La nueva suite verifica autoría, sesión esperada, idempotencia, categoría, estados fijos, ninguna autoaprobación/puntos, privacidad de pendientes/adjuntos y continuidad del seed público. Auth y Storage se representan con los contratos mínimos del runner, sin cuentas ni contraseñas reales.
- **Remoto:** en el navegador se comprobó que el listado público conserva los nueve ejemplos y que Crear reclamo abre Auth y permite cancelarlo. No se escribieron datos ni se ejecutaron migraciones, `db push` o reset. No se abrió ni imprimió `.env.local`, ni se ejecutó el script `verify:supabase` que lo lee. Los tests de frontend se aislaron con `envDir:false`; la compilación usa la configuración normal de Vite. La prueba real de creación, asociación y descarga de foto queda para tu cuenta.

Limitaciones: no hay borradores persistidos ni recuperación de archivos después de cerrar el formulario/recargar. Un envío ambiguo conserva su UUID y contenido en memoria mientras el formulario permanece abierto. Si lo cerrás, comprobá Mis reclamos antes de crear otro. Después de cerrar un reclamo con imagen fallida se pierde ese archivo/reintento en memoria, no el reclamo; todavía no hay un cargador adicional desde el detalle. El historial carga hasta 100 registros públicos y no consulta tablas privadas. No se promete atomicidad entre Storage y PostgreSQL ni limpieza automática de huérfanos. Los reintentos de peticiones ya emitidas requieren la misma intención en memoria; no se guardan tokens ni borradores fuera del SDK de Auth.

Referencias: [upload de Storage](https://supabase.com/docs/reference/javascript/storage-from-upload), [download autenticado](https://supabase.com/docs/reference/javascript/storage-from-download).
