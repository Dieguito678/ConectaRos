import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../../src/App'
import { AuthProvider } from '../../src/auth/AuthProvider'
import { createAuthStore } from '../../src/auth/auth-store'
import { createFixtureAuth,createFixtureRepository,loadFixtureClaims,scenarioOptions,type Scenario } from './fixtures'
import '../../src/styles.css'
import '../../src/auth/auth.css'
import '../../src/claims/claims.css'

// Fail closed: the visual harness must never reach Supabase or another service.
const localFetch=window.fetch.bind(window)
window.fetch=(input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input),window.location.href)
  if(target.origin!==window.location.origin)return Promise.reject(new TypeError('La revisión visual no admite solicitudes externas.'))
  return localFetch(input,init)
}
const requested=new URLSearchParams(window.location.search).get('scenario')
const scenario:Scenario=scenarioOptions.some(([id])=>id===requested)?requested as Scenario:'home'
const withSession=['session','own','empty','own-loading','own-error'].includes(scenario)
const auth=createAuthStore(createFixtureAuth(withSession),window.location.origin)
const repository=createFixtureRepository(scenario)
const loadPublicClaims=loadFixtureClaims(scenario)

function VisualReview(){
  return <>
    <aside className="visual-review-tools" aria-label="Escenarios de revisión visual">
      <span>Revisión visual · datos aislados</span>
      <label>Escenario <select value={scenario} onChange={event=>{window.location.href=`/?scenario=${encodeURIComponent(event.target.value)}`}}>{scenarioOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      {withSession&&<span className="visual-review-hint">Usá Mis reclamos o Crear reclamo para revisar la cuenta.</span>}
    </aside>
    <AuthProvider store={auth}><App claimsRepository={repository} loadPublicClaims={loadPublicClaims}/></AuthProvider>
  </>
}
const style=document.createElement('style')
style.textContent=`.visual-review-tools{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;padding:7px 12px;background:#10291e;color:#f0f5ec;font:12px/1.4 "Segoe UI",Arial,sans-serif}.visual-review-tools label{display:flex;align-items:center;gap:7px}.visual-review-tools select{max-width:220px;border:1px solid #8ea98d;border-radius:5px;background:#fff;color:#173b2a;padding:4px 7px;font:inherit}.visual-review-hint{opacity:.8;font-size:11px}@media(max-width:480px){.visual-review-tools{gap:6px 12px}.visual-review-hint{display:none}}`
document.head.append(style)
ReactDOM.createRoot(document.getElementById('visual-review-root')!).render(<React.StrictMode><VisualReview/></React.StrictMode>)
