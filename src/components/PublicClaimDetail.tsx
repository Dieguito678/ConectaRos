import { useEffect, useRef } from 'react'
import { CalendarDays, MapPin, X } from 'lucide-react'
import { categoryNames } from '../claims/model'
import { getClaimPresentation } from '../lib/claim-status'
import type { Claim } from '../types/claim'
import { CategoryIcon } from './CategoryIcon'
import { ClaimStatusBadge } from './ClaimStatusBadge'
import { openModal } from '../lib/modal'
export function PublicClaimDetail({claim,onClose}:{claim:Claim;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>openModal(dialog.current),[])
  const status=claim.workflowStatus??(claim.status==='Resuelto'?'resuelto':claim.status==='En proceso'?'en_tratamiento':'publicado')
  const presentation=getClaimPresentation({status})
  return <dialog ref={dialog} className="claim-dialog public-detail" aria-labelledby="public-detail-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
    <div className="dialog-heading"><span className="dialog-eyebrow">Reclamo de la comunidad</span><button className="close-button" aria-label="Cerrar detalle" onClick={onClose}><X size={22} aria-hidden="true"/></button></div>
    <div className="detail-category"><span className={`category-icon ${claim.category}`}><CategoryIcon category={claim.category}/></span><span>{categoryNames[claim.category]}</span>{claim.isDemo&&<span className="example-label">Ejemplo</span>}</div>
    <h2 id="public-detail-title">{claim.title}</h2><div className="detail-status-block"><ClaimStatusBadge status={status}/><p>{presentation.helper}</p></div>
    <div className="detail-meta"><span><MapPin size={17} aria-hidden="true"/>{claim.address} · {claim.neighborhood}</span><time dateTime={claim.date}><CalendarDays size={17} aria-hidden="true"/>{new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(`${claim.date}T12:00:00Z`))}</time></div>
    <dl className="detail-stages"><div><dt>Etapa actual</dt><dd>{presentation.stageLabel}</dd></div><div><dt>Estado de la publicación</dt><dd>Visible para la comunidad</dd></div></dl>
    <section className="detail-body"><h3>Qué pasa en este lugar</h3><p className="detail-description">{claim.description}</p></section>
    {claim.isDemo&&<p className="example-note">Este es un ejemplo ilustrativo. No representa un hecho ni una intervención verificados.</p>}
  </dialog>
}
