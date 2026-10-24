# Crear reclamos y Mis reclamos

## Alcance actual

El módulo permite crear reclamos con categorías remotas, una fotografía opcional, envío idempotente y recuperación ante respuestas de red ambiguas. El acceso anónimo abre el login y conserva la intención mientras siga abierta la página; cancelar el acceso no lo vuelve a abrir automáticamente.

**Con la migración 007, un reclamo nuevo queda `moderation_status=aprobado` y `status=publicado`.** Aparece en el listado público con badge rojo **Pendiente**, que indica falta de avance de gestión. No indica una emergencia, una derivación oficial ni una validación administrativa premiada.

Mis reclamos consulta por `author_id` además de RLS, ordena por fecha/UUID y carga páginas de 12 registros. El detalle propio muestra descripción, ubicación textual, fecha, moderación, gestión, fotografía y el historial público permitido. No consulta notas, derivaciones ni auditoría interna. Un identificador ajeno o inexistente no expone datos privados.

Al crear se refrescan las consultas remotas. Mi barrio conserva `moderation_status=aprobado`, sin insertar filas artificialmente ni usar fixtures como fallback. Los pendientes históricos, ocultos y rechazados continúan fuera de ese listado. No se agregan edición, eliminación, apoyos, aportes, panel administrativo, mapas, premios o integraciones oficiales.

Archivos principales: `src/claims/repository.ts`, `submission.ts`, `CreateClaimDialog.tsx`, `MyClaims.tsx`, `OwnClaimDetail.tsx`, `hooks.ts`, `model.ts` y su integración en `src/App.tsx`. Se reutilizan Auth y el cliente único; no se crean clientes duplicados.

## Migraciones: aplicar antes de probar el frontend

El frontend actual requiere **001–007 aplicadas en orden**. Las migraciones anteriores se ejecutaron manualmente en SQL Editor; no se supone que el historial de la CLI esté sincronizado. No uses `db push` ni `reset` sobre el remoto y no vuelvas a ejecutar archivos aplicados.

Si el proyecto ya tiene 001–006, abrí SQL Editor en el proyecto verificado y ejecutá solamente el archivo nuevo completo, incluyendo `begin` y `commit`:

```text
supabase/migrations/20261024000700_automatic_claim_publication.sql
```

Para una instalación nueva:

```text
001 initial_schema
002 policies
003 transactional_functions
004 storage
005 auth_profile_display_name
006 claim_submission
007 automatic_claim_publication
seed.sql
```

La 006 creó la RPC idempotente original con moderación pendiente. La 007 cambia ese contrato a aprobación automática y adapta el helper de primera fotografía para aceptar el reclamo propio recién publicado. No se modifican las migraciones anteriores, no se aprueban registros históricos en bloque y no se alteran el seed ni sus UUID.

La nueva versión del frontend no debe probarse contra el contrato 006 anterior: esa versión seguía creando pendientes y no permitía una primera foto después de aprobar el reclamo.

### Instalaciones que aún no aplicaron 006

La 006 agrega un índice único para una foto principal por reclamo. Antes de aplicarla en una base con evidencia existente, comprobá duplicados desde SQL confiable:

```sql
select claim_id, count(*)
from public.claim_attachments
where contribution_id is null
group by claim_id having count(*) > 1;
```

Si aparecen filas, detenete e inspeccionalas. No borres evidencia para forzar una migración. Los archivos son transaccionales y no limpian tablas, buckets u objetos.

### Publicación opcional de pendientes históricos

`supabase/scripts/publish_pending_claims.sql`, si se desea usar, es una acción administrativa **manual y separada** de las migraciones. Primero revisá su consulta de vista previa y sus filtros, elegí conscientemente qué registros publicar y recién entonces ejecutá el bloque de actualización en SQL Editor. La migración 007 no lo ejecuta. No lo incluyas en instalaciones automáticas ni lo uses para aprobar ocultos o rechazados.

El script muestra primero **todos** los registros con `moderation_status='pendiente'`, ordenados por fecha/UUID; no se limita a un autor ni a `is_demo`. El UPDATE opcional está comentado en un bloque separado y usa ese mismo filtro. Si necesitás publicar solo algunos, acotá y verificá el mismo filtro en la vista previa y en el UPDATE antes de ejecutar. Ocultos y rechazados quedan excluidos.

La actualización cambia únicamente la moderación a `aprobado`. Conserva autor, organismo, `is_demo` y `claim_status`, y no crea puntos ni validación administrativa; el trigger normal sí actualizará `updated_at`. Por eso un reclamo histórico con una gestión avanzada conserva esa etapa y no necesariamente se mostrará rojo. También cambia la elegibilidad de lectura de su metadata y sus fotos bajo las políticas existentes. Conservá una revisión de las filas afectadas antes de confirmar la transacción.

## Contratos actuales

### `submit_demo_claim(...)`

Parámetros: `p_request_id`, `p_expected_user`, `p_category_id`, `p_title`, `p_description`, `p_address`, `p_neighborhood`.

- `p_request_id` es un UUID estable por intento, usado como PK. Repetir el mismo intento devuelve la misma fila; reutilizarlo con otro contenido se rechaza. Un conflicto de autor no expone el registro.
- `p_expected_user` es una guarda contra cambios de sesión: debe coincidir con `auth.uid()`. No permite elegir autor. El servidor siempre escribe `author_id=auth.uid()`.
- El servidor fija `aprobado`/`publicado`, `is_demo=true` y ningún organismo responsable. El cliente no elige estados privilegiados ni omite autoría.
- La publicación no inserta movimientos de puntos ni una validación administrativa. Las reglas de puntos y sus RPC no se cambian.
- Título 5–160, descripción 10–5000, dirección 3–240 y barrio 2–100, sin espacios exteriores y sin campos vacíos. Categoría existente obligatoria. El barrio es texto libre, no un catálogo oficial inventado.

### `attach_own_claim_photo(...)`

Parámetros: `p_claim_id`, `p_expected_user`, `p_storage_path`.

- Verifica sesión actual, autoría, ruta, existencia del objeto y el helper/trigger de asociación.
- Para una nueva foto principal exige gestión `publicado`, moderación `aprobado` o `pendiente` histórico y ausencia de validación administrativa previa. Ocultos, rechazados y reclamos con gestión avanzada no admiten una nueva foto.
- Repetir la misma asociación devuelve su ID mientras la moderación siga aprobada o pendiente histórica, incluso si la gestión ya avanzó. Una foto principal distinta se rechaza; no se reemplaza ni borra evidencia. Un oculto o rechazado no acepta esta RPC de asociación ni como reintento.
- Si falta el objeto, `P0002` indica internamente que debe subirse primero. La UI no muestra rutas ni mensajes crudos del proveedor.

Las RPC privilegiadas fijan `search_path`, califican objetos y no tienen ejecución pública/anon. Solo `authenticated` puede invocarlas, con comprobaciones de identidad en el servidor. La 007 revoca tanto el permiso de INSERT de tabla como los permisos de INSERT por columna sobre `claims` y retira su política de creación directa: el cliente crea exclusivamente por la RPC. No se desactiva RLS ni se amplían permisos de lectura o de columnas para resolver errores. Los permisos de aportes permanecen independientes.

No se agregan columnas ni enums. Los tipos de filas existentes siguen describiendo el esquema; las proyecciones del módulo están en `src/claims/model.ts`. El generador actual no produce firmas RPC; sus argumentos se mantienen alineados con el SQL y se prueban localmente.

### Registros de ejemplo

Los nuevos envíos de esta aplicación de demostración mantienen `is_demo=true`, siempre con autor autenticado. La excepción de los ejemplos antiguos sin autor no se utiliza. El indicador no permite suplantar usuarios ni modificar estados administrativos; la visibilidad automática la fija la nueva RPC, no un campo oculto. La UI muestra «Ejemplo» como rótulo secundario. Los UUID y datos del seed permanecen sin cambios.

## Storage: privacidad y lectura real

Se utiliza el bucket existente **`claim-photos`**, que sigue siendo privado y admite JPEG, PNG o WebP de hasta 5 MiB. La ruta de este formulario es:

```text
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.jpg
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.png
<auth.uid()>/<claim_id>/claim/<uuid_aleatorio>.webp
```

El nombre original no forma parte de la ruta. El navegador valida MIME, tamaño y firma inicial; Storage valida el MIME declarado y el tamaño configurados. Esto no equivale a antivirus ni a validación binaria completa en el servidor.

**Bucket privado no significa que las fotos sean exclusivas del autor.** Las políticas de lectura existentes permiten al propietario o administrador acceder a sus objetos asociados y también autorizan a visitantes a leer una foto asociada cuando el reclamo está aprobado; si pertenece a un aporte, ese aporte también debe estar aprobado. La metadata de adjuntos sigue las mismas condiciones de visibilidad. Al publicar automáticamente el reclamo, una foto asociada queda dentro de ese permiso preexistente. No se amplía la política, pero tampoco se promete privacidad exclusiva del autor.

La UI mantiene las fotografías únicamente en el detalle propio mediante descarga autorizada y `Blob`/object URL temporal. No agrega galerías públicas, no cambia el bucket a público, no usa `getPublicUrl` y no guarda ni genera URLs firmadas. No incluyas información sensible en imágenes que puedan asociarse a un reclamo aprobado.

### Flujo y fallos parciales

Orden: **guardar reclamo → comprobar si puede asociarse una subida anterior → subir si falta → registrar asociación**. Storage y PostgreSQL no comparten una transacción.

1. Antes de cada envío se consulta el UUID propio del intento. Una respuesta perdida se reconcilia con la fila; si la consulta falla, no se lanza un INSERT a ciegas.
2. La RPC usa el mismo UUID. Una transacción previa aún en curso no puede generar una segunda fila para ese intento.
3. La ruta de foto es estable y usa `upsert:false`. Primero se intenta asociar una subida anterior para no reemplazar un archivo cuya respuesta se perdió.
4. Si falla la foto, el reclamo continúa publicado. Se ofrece **Reintentar solo la imagen**, sin recrearlo.
5. No se compensa borrando el reclamo ni objetos sin autorización. El cliente no puede borrar o actualizar evidencia. La limpieza de huérfanos requiere un proceso confiable con Storage API, fuera de este módulo.

La primera imagen puede asociarse al reclamo propio recién publicado que todavía no registra gestión ni validación administrativa. Si entre el alta y la foto cambia a un estado no permitido, la foto puede fallar sin perder el reclamo. No se elude esa protección. Una asociación ya existente de la misma ruta puede reconciliarse después de un avance de gestión, pero la RPC la rechaza si el reclamo fue ocultado o rechazado.

## Prueba manual con tu cuenta

Estas acciones escriben datos. **No fueron ejecutadas por el agente.** No se crearon cuentas, enviaron correos, crearon reclamos ni subieron fotos de prueba remotos. El usuario informó haber probado registro/login previamente; esto no demuestra que el nuevo contrato 007 o Storage real funcionen en el remoto.

1. Aplicá las migraciones 001–007 que falten, sin repetir las anteriores. Comprobá Auth y las Redirect URLs, y abrí la app en un origen autorizado.
2. Sin sesión, usá **Crear reclamo**. Debe abrir el acceso. Cancelalo: no debe volver a abrirse automáticamente. Ingresá con tu cuenta confirmada y comprobá que continúa al formulario. La recarga pierde la intención y el borrador en memoria.
3. Verificá categorías remotas, campos cortos/largos/solo espacios y categoría obligatoria. Los errores deben conservar los valores y enfocar el campo correspondiente.
4. Usá datos ficticios sin información sensible. Podés adjuntar una imagen válida de hasta 5 MiB, quitarla o descartar cambios con confirmación.
5. Enviá una sola vez. El éxito debe indicar que el reclamo fue publicado; no debe pedir revisión previa ni mostrar puntos. En **Mis reclamos**, la moderación debe estar aprobada y la gestión inicial debe presentarse como **Pendiente**.
6. Abrí **Mi barrio**, también sin sesión en otra ventana. Después del refresco real, el reclamo nuevo debe aparecer con badge rojo **Pendiente** y rótulo «Ejemplo». Esto no indica emergencia ni intervención oficial.
7. Para probar la foto fallida, bloqueá temporalmente el upload de Storage en DevTools tras guardar el reclamo. El registro debe seguir existiendo y visible. Quitá el bloqueo y usá **Reintentar solo la imagen**: no debe duplicar reclamo ni adjunto.
8. En el detalle propio, comprobá foto y etapa exacta «Publicado». El historial muestra solo eventos públicos realmente disponibles; no se inventa una derivación o avance por publicar.
9. Cerrá sesión o cambiá de cuenta durante una consulta/subida. Formulario, listas, detalle y object URLs anteriores deben desaparecer. Una petición ya emitida puede completarse para el autor original; comprobá Mis reclamos antes de repetirla.
10. Conservá un pendiente histórico, oculto o rechazado como prueba de lectura: no debe aparecer anónimamente por aplicar 007. No lo actualices como parte de la prueba salvo que decidas ejecutar el script opcional de publicación con revisión previa. Nunca lo uses para cambiar ocultos/rechazados.

### Comprobar desde SQL Editor

Con un UUID propio y el rol confiable del SQL Editor, sin compartir rutas ni credenciales:

```sql
select id, author_id, title, moderation_status, status, is_demo, entity_id
from public.claims where id = 'UUID-DEL-RECLAMO'::uuid;
select id, claim_id, owner_id, contribution_id, storage_path
from public.claim_attachments where claim_id = 'UUID-DEL-RECLAMO'::uuid;
select id, bucket_id, name from storage.objects
where bucket_id = 'claim-photos' and name in (
  select storage_path from public.claim_attachments
  where claim_id = 'UUID-DEL-RECLAMO'::uuid
);
select count(*) from public.point_movements
where event_id = 'UUID-DEL-RECLAMO'::uuid; -- el alta no otorga puntos
```

Esperado: una fila con tu autor, moderación aprobada, gestión publicada, como máximo una foto principal y su objeto si la asociación funcionó. No cambies estados ni permisos para resolver un error de imagen.

## Pruebas y límites

```sh
npm test
npm run test:db
npm run types:db
npm run build
```

Las pruebas de frontend usan mocks/JSDOM y los fixtures de revisión visual son una entrada aislada, nunca fallback de producción. Las pruebas SQL usan PostgreSQL WASM/PGlite con contratos mínimos de Auth/Storage, sin cuentas reales. Cubren autoría, idempotencia, estados fijos del contrato nuevo, ausencia de puntos, rechazo de autoasignaciones y privacidad de pendientes/ocultos/rechazados, además de reintentos, paginación y limpieza de sesión. Los resultados finales de esta entrega deben tomarse del reporte de tests, no de estas instrucciones.

Verificación de esta entrega: **57/57 pruebas de frontend aprobadas**, `npm run build` aprobado y **siete migraciones + cinco suites SQL locales aprobadas**. El runner también prepara un pendiente antes de aplicar 007 para comprobar que la migración estructural no lo modifica. Finalmente ejecuta el archivo opcional real sobre fixtures locales: la vista previa no escribe, el bloque separado solo cambia pendientes, conserva todos los demás campos (salvo `updated_at` por su trigger), devuelve IDs/títulos, no otorga puntos y no modifica filas al repetirse.

No se ejecutaron migraciones o pruebas de escritura remotas, `db push` ni reset. La creación, el upload, la asociación y la descarga reales con el contrato 007 quedan para la prueba manual. Los tests locales y las capturas con fixtures no prueban HTTP real de Auth/Storage ni concurrencia entre conexiones de un proyecto Supabase.

No hay borradores persistidos ni recuperación de archivos después de cerrar o recargar. Un envío ambiguo conserva su UUID y contenido en memoria mientras permanezca abierto. Al cerrarlo, comprobá Mis reclamos antes de crear otro. Cerrar un reclamo con foto fallida pierde el archivo/reintento en memoria, no la fila publicada; aún no hay un cargador adicional desde el detalle. El historial carga hasta 100 registros públicos, sin consultar tablas privadas. No hay atomicidad entre Storage y PostgreSQL ni limpieza automática de huérfanos.

Referencias: [upload de Storage](https://supabase.com/docs/reference/javascript/storage-from-upload), [download autorizado](https://supabase.com/docs/reference/javascript/storage-from-download).
