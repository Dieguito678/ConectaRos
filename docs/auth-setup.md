# Autenticación de ConectaRos

## Qué está implementado y qué se verificó

Registro con correo/contraseña, ingreso, sesión restaurada y reactiva, perfil/roles propios, salida local, formularios accesibles y confirmación por correo con PKCE. Se reutiliza el único cliente de `src/lib/supabase.ts`. No se agregan proveedores sociales, recuperación de contraseña, edición de perfil, publicación de reclamos, puntos o canjes en la UI.

Se ejecutaron 31 pruebas de frontend con Auth **simulado**, pruebas PostgreSQL locales y compilación. La lectura pública real respondió HTTP 200 con los nueve ejemplos del seed. **No se crearon cuentas ni se enviaron correos de prueba. El flujo real de registro/confirmación/login/logout y el acceso autenticado a perfiles todavía no están verificados.**

No se dispone de acceso administrativo para aplicar SQL o cambiar la configuración remota. No se realizó push ni despliegue. Las variables de `.env.local` no se imprimen y el archivo está ignorado por Git.

## 1. Aplicar la nueva migración antes del registro

Si las cuatro migraciones anteriores ya están aplicadas, en SQL Editor del proyecto verificado ejecutá **solo el archivo nuevo**:

```text
supabase/migrations/20261024000500_auth_profile_display_name.sql
```

Pegá el contenido completo, incluyendo `begin` y `commit`. La migración reemplaza únicamente el helper `private.on_auth_user_created()` existente; conserva el trigger y sus permisos restringidos. Toma `display_name` de `raw_user_meta_data` solo si es texto válido de 1 a 80 caracteres, sin controles, y usa `Vecino` como fallback. Inserta un perfil por UUID y no modifica perfiles existentes. Nunca copia `role`, `roles`, correo o contraseñas.

No vuelvas a ejecutar las migraciones iniciales si ya existen sus tablas. Si todavía no hay esquema, aplicá primero los pasos de [supabase-setup.md](supabase-setup.md), ahora con esta quinta migración antes del seed. No desactives RLS ni agregues permisos públicos a perfiles.

**El nombre del registro requiere esta migración remota.** Sin ella, el registro puede quedar con el nombre predeterminado `Vecino`. El frontend no inserta ni repara perfiles. La migración no es un backfill: no sobreescribe nombres de cuentas existentes a partir de metadata editable.

## 2. Configurar Supabase Auth

En Authentication → Providers, habilitá Email con contraseña y mantené **Confirm email activado**. Conservá las políticas de contraseña adicionales del proyecto: el frontend valida un mínimo de 8 caracteres y Supabase decide la validez final. No se omiten reglas de longitud mayor, caracteres o contraseñas filtradas.

En Authentication → URL Configuration:

| Entorno | Site URL | Redirect URLs permitidas |
| --- | --- | --- |
| Proyecto solo local | `http://localhost:5173` | `http://localhost:5173/` y `http://127.0.0.1:5173/` |
| Servidor local en 5174 | El origen local que uses | `http://localhost:5174/` y `http://127.0.0.1:5174/` |
| Producción Vercel | `https://TU-PROYECTO.vercel.app` o tu dominio estable | `https://TU-PROYECTO.vercel.app/` o el dominio estable con `/` |
| Preview específico | Mantener Site URL estable de producción | Agregar la URL exacta del preview aprobado, con `/` |

Si usás el mismo proyecto Supabase para producción y desarrollo, mantené Site URL en producción y añadí explícitamente los orígenes locales a Redirect URLs. Usá el puerto que Vite muestra realmente. Evitá permitir cualquier dominio `*.vercel.app`; autorizá solo tus despliegues. No modifiques plantillas para saltar la verificación: el enlace de confirmación debe usar el flujo oficial, normalmente `{{ .ConfirmationURL }}`.

El registro pasa `emailRedirectTo: window.location.origin + '/'`. No usa un destino ingresado por el usuario ni una variable con una URL de otro entorno. En Vercel deben existir las mismas dos variables **públicas** que usa el proyecto local, configuradas para el entorno correspondiente, y se debe recompilar tras cambiarlas. No publicar `service_role`, claves secretas ni `.env.local`.

### Correo y SMTP

El servicio de correo predeterminado de Supabase puede restringir destinatarios y frecuencia. Configurá un proveedor SMTP autorizado y el remitente/dominio según el proyecto antes de usar cuentas fuera de las permitidas. Revisá los logs de Auth en el Dashboard sin compartir credenciales, enlaces ni tokens. Esta tarea no inspecciona ni modifica SMTP remotamente.

La UI informa límites de solicitudes, límites de envío o restricciones del destinatario cuando Supabase devuelve sus códigos correspondientes. No afirma que un correo haya sido enviado ante un error. La respuesta exitosa de `signUp` puede ser deliberadamente ambigua para proteger cuentas existentes: la UI pide revisar el correo sin asegurar que se creó una cuenta nueva. No se implementa reenvío automático, evitando duplicar envíos o agravar límites.

## 3. Probar manualmente con la cuenta que elijas

Estas acciones crean una cuenta y pueden enviar correo. **Ejecutalas vos con tu cuenta elegida; no las ejecutó el agente.** No compartas contraseñas o enlaces de confirmación en el chat.

1. Aplicá la nueva migración y completá la configuración de URLs/Email. Ejecutá `npm run dev` y abrí un origen autorizado.
2. En **Crear cuenta**, probá primero nombre vacío o mayor a 80 caracteres, correo inválido, contraseña corta y repetición distinta. Deben aparecer errores en español, con foco en el primer campo inválido, sin solicitudes de registro. El botón para ver contraseña solo cambia su visibilidad.
3. Completá nombre visible, tu correo, contraseña válida y repetición. Durante la solicitud se deshabilitan los campos y el envío. No hay selector de roles.
4. Con confirmación activada, una respuesta sin sesión muestra **“Revisá tu correo para confirmar tu cuenta”**. No debe aparecer tu nombre en el encabezado ni una sesión activa. Las contraseñas se vacían después de la solicitud. No interpretes esa respuesta como prueba de que una cuenta nueva fue creada: puede ocultar si el correo ya estaba registrado.
5. Abrí el enlace de confirmación **en el mismo navegador y el mismo origen/puerto** donde te registraste. PKCE requiere el verificador guardado por el SDK de Supabase. El cliente intercambia el código una sola vez; se retiran parámetros sensibles de la URL y se muestra un aviso seguro. Un enlace vencido, usado, de otro navegador o con error debe mostrar una explicación sin tokens ni mensajes crudos del proveedor. Si el correo ya se confirmó pero el intercambio no pudo hacerse, probá ingresar con correo y contraseña.
6. Para probar login por separado, cerrá sesión e ingresá con tu cuenta confirmada. Probá una contraseña incorrecta y, con una cuenta aún pendiente, correo sin confirmar. Deben aparecer errores comprensibles y ninguna autenticación ficticia.
7. Con login exitoso, debe leerse el perfil propio y su nombre en el encabezado. Al recargar la página se restaura la sesión mediante el SDK. La carga de roles usa `user_roles` con RLS, nunca metadata.
8. En **Mis reclamos**, sin sesión se solicita acceso. Con sesión se informa que el módulo personal está pendiente; no se muestran reclamos personales simulados. **Mi barrio** permanece público y sigue leyendo Supabase.
9. Pulsá **Cerrar sesión**. Se ocultan de inmediato perfil y roles y se cierra la sesión de este navegador con `scope: 'local'`. No se desconectan automáticamente otros dispositivos. Si Supabase no confirma el cierre, se informa el error y se ofrece reintentarlo, sin declarar éxito ni permitir cambiar de cuenta mientras el cierre sea incierto.
10. Si querés probar otra cuenta, primero cerrá la anterior. El nombre/permisos anteriores deben desaparecer antes de cargar el nuevo perfil. No se deben restaurar por respuestas tardías. Para probar un error de perfil, bloqueá temporalmente en DevTools las solicitudes a `profiles` o `user_roles`: la sesión debe seguir activa y debe ofrecerse **Reintentar perfil**. No desactives RLS para esta prueba.

No hace falta crear administradores para probar autenticación. El alta no asigna `admin` ni `ambassador`, aunque alguien envíe campos adicionales o cambie `user_metadata`. La autoridad sigue en las tablas y RPC existentes.

## Diseño de la sesión

- `AuthProvider`/`useAuth` comparten un store con una sola suscripción activa. Recupera `getSession()` y escucha `onAuthStateChange`; la suscripción se cancela al desmontar.
- El callback de Auth es **síncrono**. La lectura paralela de perfil y roles se inicia en una tarea posterior, fuera del bloqueo del SDK.
- La versión de sesión evita que una restauración inicial tardía sobrescriba eventos nuevos. Cada cambio de usuario cancela la lectura anterior y limpia los datos privados antes de cargar otros.
- La carga de perfil usa cancelación y un identificador de consulta. Un error en `profiles`/`user_roles` no se interpreta como logout y no conserva permisos antiguos.
- El cierre descarta respuestas tardías. Si una salida desde otra pestaña interrumpe un login pendiente, se ignora su sesión tardía y se reconcilia el cierre con el SDK.
- PKCE usa almacenamiento y renovación administrados por Supabase. No hay almacenamiento adicional de contraseñas/tokens, creación de JWT ni logs de credenciales. El retorno se consume antes de renderizar hijos y el intercambio se comparte durante el doble montaje de desarrollo de React StrictMode.
- Solo se admiten retornos PKCE iniciados por esta app; no se adoptan tokens arbitrarios de fragmentos de URL. Los errores de confirmación no destruyen una sesión válida que ya exista.

## Pruebas automatizadas y límites

```sh
npm test
npm run test:db
npm run build
npm run verify:supabase
```

Las 31 pruebas del frontend incluyen formularios en JSDOM, validaciones, errores seguros, estado de confirmación pendiente, login simulado correcto/incorrecto, restauración, suscripción y limpieza, perfil fallido/reintento, cambios de cuenta y carreras de logout/retorno. Las pruebas del listado público siguen verificando error explícito, vacío, mapeo, paginación y ausencia de fallback.

`supabase/tests/03_auth_profile.sql` ejecuta el nuevo trigger contra el contrato local de Auth en PostgreSQL WASM: nombre válido, fallback, Unicode, ausencia de roles desde metadata y lectura propia por RLS. No sustituye un registro real en Supabase Auth. El contrato de pruebas `auth.users` tiene solo los campos necesarios; no contiene contraseñas ni correos reales.

La lectura pública remota se comprobó de verdad: HTTP 200, nueve registros reconocidos del seed y las nueve categorías. Falta verificar con una cuenta elegida por vos: SMTP, entrega del correo, confirmación, política real de contraseña, sesión persistida del SDK, login/logout y permisos autenticados del proyecto. No se afirma que ese recorrido remoto completo funcione todavía.

Referencias oficiales: [registro y respuestas ambiguas](https://supabase.com/docs/reference/javascript/auth-signup), [eventos de sesión](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
