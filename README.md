# ConectaRos

Demo responsive de una plataforma barrial para Rosario, creada con React, Vite, TypeScript y Tailwind CSS (plugin oficial de Vite). Preparada para integrar Supabase y desplegar en Vercel.

## Ejecutar

Requiere Node.js 22.12 o superior (recomendado: Node.js 24 LTS) y npm.

```sh
npm ci
npm run dev
```

Abrí la URL que muestra Vite. **No hacen falta credenciales ni archivo `.env` para ejecutar la demo.** Para la primera instalación sin lockfile se usa `npm install`; el lockfile generado se incluye para instalaciones reproducibles.

```sh
npm run typecheck
npm run build
npm run preview
```

`build` comprueba TypeScript y genera `dist/`. `preview` permite revisar la versión compilada localmente.

## Alcance de la entrega

- **Mi barrio:** nueve reclamos inventados, uno por categoría: alumbrado, residuos, baches, veredas, arbolado, agua, electricidad, gas y otros. Incluye búsqueda, filtros combinables por categoría, barrio y estado, limpieza de filtros y detalle en un diálogo que se cierra con Escape o el botón de cierre.
- **Mis reclamos:** pantalla informativa de una función futura. No se atribuyen reclamos a una persona ni se simula una sesión.
- **Beneficios:** pantalla informativa. No hay puntos, canjes ni beneficios disponibles.
- Datos, direcciones y estados son ejemplos ficticios; no representan reportes o intervenciones reales. La ilustración del barrio no es un mapa geográfico.
- No se envían reclamos, no se guardan cambios ni se realizan solicitudes a Supabase. No hay integración municipal ni con prestadores. No es un canal de emergencias.

## Estructura

```text
public/                 Favicon local
src/
  components/           Tarjeta, estado e iconos de categoría
  data/claims.ts        Datos ficticios de Rosario
  lib/supabase.ts       Fábrica de cliente opcional, sin uso en la demo
  types/claim.ts        Tipos y categorías
  App.tsx               Navegación y pantallas de la demo
  main.tsx              Entrada de React
  styles.css            Tailwind, estilos y diseño responsive
.env.example            Variables públicas para una integración futura
vercel.json             Configuración de compilación y salida
```

## Supabase: próxima etapa

Se instalaron las dependencias y se preparó `createSupabaseClient()`. Devuelve `null` si faltan variables; la demo no la invoca y mantiene sus datos locales incluso si hay credenciales configuradas.

Cuando se implemente la integración, copiá `.env.example` a `.env.local` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Reiniciá Vite después de editar variables. Toda variable `VITE_` queda expuesta en el navegador: **nunca colocar claves `service_role`, secret keys ni contraseñas de base de datos**.

Quedan pendientes el esquema y las migraciones de base de datos, políticas RLS por usuario, autenticación real, bucket de Storage para fotos y sus políticas de acceso, validaciones y conexión de los reclamos al backend. Configurar las variables por sí solo no activa esas funciones.

## Desplegar en Vercel

1. Subí el proyecto a tu repositorio e importalo en Vercel.
2. Usá el preset **Vite**, instalación `npm ci`, compilación `npm run build` y salida `dist` (configurada en `vercel.json`).
3. Desplegá sin variables de entorno para esta demo. En la futura integración, configurá las variables públicas de Supabase en Vercel y volvé a desplegar.

La navegación actual es local dentro de React; no requiere reglas de reescritura. No se creó ningún recurso remoto ni se realizó un despliegue en esta entrega.

Referencias de configuración: [Vite](https://vite.dev/guide/) y [Tailwind CSS con Vite](https://tailwindcss.com/docs/installation/using-vite).
