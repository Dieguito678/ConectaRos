import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local visual fixtures only. This entry never reads .env files, connects to
// Supabase, creates accounts or uploads to a remote service.
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: 'node_modules/.vite-visual-review',
  plugins: [
    {
      name: 'conectaros-isolated-visual-entry',
      configureServer(vite) {
        vite.middlewares.use((request, _response, next) => {
          if (request.url?.split('?')[0] === '/') {
            request.url = `/scripts/visual-fixtures/index.html${request.url.includes('?') ? `?${request.url.split('?').slice(1).join('?')}` : ''}`
          }
          next()
        })
      },
    },
    react(),
    tailwindcss(),
  ],
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
})

await server.listen()
console.log('Revisión visual aislada: http://127.0.0.1:5186/?scenario=home')
console.log('Datos y sesión en memoria. Sin acceso a servicios remotos.')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
