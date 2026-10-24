import { useEffect, useRef, useState } from 'react'
import { CalendarDays, MapPin, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useObjectUrl } from './hooks'
import type { ClaimsRepository } from './repository'
import { CategoryIcon } from '../components/CategoryIcon'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { CardSkeletons } from '../components/Feedback'
import { getClaimPresentation } from '../lib/claim-status'
import { openModal } from '../lib/modal'

export function OwnClaimDetail({id,userId,repository,onClose}:{id:string;userId:string;repository:ClaimsRepository;onClose:()=>void}) {
  const {getCurrentUserId}=useAuth()
  const dialog=useRef<HTMLDialogElement>(null)
  const [data,setData]=useState<Awaited<ReturnType<ClaimsRepository['details']>>>(null)
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null)
  const [blob,setBlob]=useState<Blob|null>(null),[photoError,setPhotoError]=useState(false),[photoLoading,setPhotoLoading]=useState(false)
  const [attempt,setAttempt]=useState(0)
  const url=useObjectUrl(blob)
  useEffect(()=>openModal(dialog.current),[])
  useEffect(()=>{
    const abort=new AbortController()
    const scope={userId,signal:abort.signal,isCurrent:()=>!abort.signal.aborted&&getCurrentUserId()===userId}
    setLoading(true);setError(null);setBlob(null);setData(null);setPhotoError(false)
    void (async()=>{
      try{
        const result=await repository.details(id,scope)
        if(!scope.isCurrent())return
        setData(result);setLoading(false)
        if(result?.path){
          setPhotoLoading(true)
          try{const photo=await repository.photo(result.path,scope);if(scope.isCurrent())setBlob(photo)}
          catch{if(scope.isCurrent())setPhotoError(true)}
          finally{if(scope.isCurrent())setPhotoLoading(false)}
        }
      }catch{if(scope.isCurrent()){setError('No pudimos consultar este reclamo. Revisá tu sesión y reintentá.');setLoading(false)}}
    })()
    return()=>abort.abort()
  },[id,userId,repository,attempt,getCurrentUserId])
  return <dialog ref={dialog} className="claim-dialog own-detail" aria-labelledby="own-detail-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="dialog-heading"><span className="dialog-eyebrow">Tu reclamo</span><button className="close-button" aria-label="Cerrar detalle propio" onClick={onClose}><X size={22} aria-hidden="true"/></button></div>
    {data&&<div className="detail-category"><span className={`category-icon ${data.claim.category.slug}`}><CategoryIcon category={data.claim.category.slug}/></span><span>{data.claim.category.name}</span>{data.claim.is_demo&&<span className="example-label">Ejemplo</span>}</div>}
    <h2 id="own-detail-title">{data?.claim.title??'Detalle del reclamo'}</h2>
    {loading?<div className="detail-loading"><p role="status">Cargando tu reclamo…</p><CardSkeletons count={1}/></div>:error?<div className="auth-message auth-message-error" role="alert"><p>{error}</p><button className="primary-button" onClick={()=>setAttempt(a=>a+1)}>Reintentar detalle</button></div>:!data?<p className="detail-unavailable" role="status">El reclamo no está disponible para esta cuenta o no existe.</p>:<>
      <div className="detail-status-block"><ClaimStatusBadge status={data.claim.status} moderationStatus={data.claim.moderation_status}/>
        <p>{data.claim.moderation_status==='pendiente'?'Estamos revisando tu reclamo antes de compartirlo con la comunidad.':getClaimPresentation({status:data.claim.status,moderationStatus:data.claim.moderation_status}).helper}</p></div>
      <div className="detail-meta"><span><MapPin size={17} aria-hidden="true"/>{data.claim.address} · {data.claim.neighborhood}</span><time dateTime={data.claim.created_at}><CalendarDays size={17} aria-hidden="true"/>{new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(data.claim.created_at))}</time></div>
      {data.claim.moderation_status==='aprobado'&&<dl className="detail-stages"><div><dt>Revisión</dt><dd>Aprobado para la comunidad</dd></div><div><dt>Etapa actual</dt><dd>{getClaimPresentation({status:data.claim.status,moderationStatus:data.claim.moderation_status}).stageLabel}</dd></div></dl>}
      <section className="detail-body" aria-label="Descripción del reclamo"><h3>Qué pasa en este lugar</h3><p className="detail-description">{data.claim.description}</p></section>
      {photoLoading&&<p className="loading-copy" role="status">Cargando fotografía…</p>}{url&&<figure className="claim-photo"><img className="own-photo" src={url} alt="Fotografía adjunta a tu reclamo"/><figcaption>Fotografía de tu reclamo</figcaption></figure>}
      {(photoError||data.attachmentError)&&<div className="auth-message auth-message-error" role="alert"><p>No pudimos cargar la fotografía. Podés volver a intentarlo.</p><button className="secondary-button" onClick={()=>setAttempt(a=>a+1)}>Reintentar imagen</button></div>}
      <section className="detail-history" aria-labelledby="own-history-title"><h3 id="own-history-title">Seguimiento del reclamo</h3>
        {data.historyError?<div className="auth-message auth-message-error" role="alert"><p>No pudimos cargar las novedades de tu reclamo.</p><button className="secondary-button" onClick={()=>setAttempt(a=>a+1)}>Reintentar historial</button></div>:data.history.length?<ol className="timeline">{data.history.map(entry=><li className="timeline-entry" key={entry.id}><strong>{getClaimPresentation({status:entry.new_status}).stageLabel}</strong><time className="timeline-date" dateTime={entry.created_at}>{new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(entry.created_at))}</time><p>{entry.public_note}</p></li>)}</ol>:<p className="history-empty">Las novedades compartidas sobre tu reclamo aparecerán acá.</p>}
      </section>
    </>}
  </dialog>
}
