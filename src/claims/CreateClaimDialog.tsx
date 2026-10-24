import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Camera, CheckCircle2, X } from 'lucide-react'
import { categoryNames, emptyDraft, validateClaim, validatePhoto, type ClaimCategory, type ClaimDraft } from './model'
import { type ClaimsRepository } from './repository'
import { createSubmission } from './submission'
import { useObjectUrl } from './hooks'
import { useAuth } from '../auth/AuthProvider'
import { openModal } from '../lib/modal'

export function CreateClaimDialog({userId,repository,onClose,onSaved,onView}: {
  userId:string;repository:ClaimsRepository;onClose:()=>void;onSaved:(id:string)=>void;onView:(id:string)=>void
}) {
  const {getCurrentUserId}=useAuth()
  const [draft,setDraft]=useState<ClaimDraft>({...emptyDraft})
  const [file,setFile]=useState<File|null>(null)
  const [fileError,setFileError]=useState<string|null>(null)
  const [checkingPhoto,setCheckingPhoto]=useState(false)
  const [errors,setErrors]=useState<Partial<Record<keyof ClaimDraft,string>>>({})
  const [categories,setCategories]=useState<ClaimCategory[]>([])
  const [categoryError,setCategoryError]=useState(false)
  const [loadingCategories,setLoadingCategories]=useState(true)
  const [categoryAttempt,setCategoryAttempt]=useState(0)
  const [discard,setDiscard]=useState(false)
  const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null)
  const photoCheck=useRef(0)
  const onSavedRef=useRef(onSaved);onSavedRef.current=onSaved
  const scopeRef=useRef({active:true})
  const [controller]=useState(()=>new AbortController())
  const [submission]=useState(()=>createSubmission(repository,{userId,signal:controller.signal,isCurrent:()=>scopeRef.current.active&&!controller.signal.aborted&&getCurrentUserId()===userId},id=>onSavedRef.current(id)))
  const state=useSyncExternalStore(submission.subscribe,submission.getSnapshot,submission.getSnapshot)
  const preview=useObjectUrl(state.claimId?null:file)
  const busy=['saving','uploading'].includes(state.stage)
  const locked=busy||state.stage==='uncertain'||!!state.claimId
  const dirty=Object.values(draft).some(value=>value!=='')||!!file||checkingPhoto||!!fileError
  useEffect(()=>{
    scopeRef.current.active=true;const restoreFocus=openModal(dialog.current)
    return()=>{scopeRef.current.active=false;photoCheck.current++;queueMicrotask(()=>{if(!scopeRef.current.active)controller.abort()});restoreFocus()}
  },[controller])
  // Dialogs are keyed by account in App; all drafts/files disappear on logout.
  useEffect(()=>{
    const abort=new AbortController();setLoadingCategories(true);setCategoryError(false)
    repository.categories(abort.signal).then(rows=>{if(!abort.signal.aborted)setCategories(rows)})
      .catch(()=>{if(!abort.signal.aborted)setCategoryError(true)})
      .finally(()=>{if(!abort.signal.aborted)setLoadingCategories(false)})
    return()=>abort.abort()
  },[repository,categoryAttempt])
  useEffect(()=>{
    if(!((dirty&&!state.claimId)||busy||state.stage==='photo_error'||state.stage==='uncertain'))return
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault()}
    window.addEventListener('beforeunload',prevent)
    return()=>window.removeEventListener('beforeunload',prevent)
  },[dirty,busy,state.claimId,state.stage])
  function requestClose() {
    if(busy)return
    if((dirty&&!state.claimId)||state.stage==='photo_error'||state.stage==='uncertain')setDiscard(true)
    else onClose()
  }
  async function selectPhoto(selected:File|undefined) {
    const check=++photoCheck.current
    if(!selected){setFile(null);setFileError(null);return}
    setCheckingPhoto(true)
    try{
      const error=await validatePhoto(selected)
      if(!scopeRef.current.active||check!==photoCheck.current)return
      setFile(error?null:selected);setFileError(error)
    }catch{if(scopeRef.current.active&&check===photoCheck.current){setFile(null);setFileError('No pudimos leer la imagen. Elegí otra.')}}
    finally{if(scopeRef.current.active&&check===photoCheck.current)setCheckingPhoto(false)}
  }
  function submit(event:FormEvent) {
    event.preventDefault();if(busy||checkingPhoto||loadingCategories||categoryError||fileError)return
    const validation=validateClaim(draft,categories);setErrors(validation)
    const first=Object.keys(validation)[0]
    if(first){(form.current?.elements.namedItem(first) as HTMLElement|null)?.focus();return}
    void submission.submit(draft,file)
  }
  return <dialog ref={dialog} className="claim-dialog compose-dialog" aria-labelledby="compose-title" onCancel={event=>{event.preventDefault();requestClose()}}
    onClick={event=>{if(event.target===event.currentTarget)requestClose()}}>
    <div className="flex items-center justify-between"><span className="outline-pill">Tu barrio, tu voz</span><button className="close-button" disabled={busy} onClick={requestClose} aria-label="Cerrar creación de reclamo"><X size={22}/></button></div>
    <h2 id="compose-title">{state.claimId?'Reclamo enviado para revisión':'Crear un reclamo'}</h2>
    {discard?<div className="discard-prompt" role="alert"><h3>¿Cerrar este formulario?</h3><p>{state.claimId?'Tu reclamo seguirá guardado. Si cerrás, no podrás reintentar esta fotografía desde este formulario.':state.stage==='uncertain'?'Es posible que tu reclamo ya se haya enviado. Revisá Mis reclamos antes de crear otro.':'Se perderán los cambios y la fotografía seleccionada.'}</p><div className="auth-access-actions"><button autoFocus className="primary-button" onClick={()=>setDiscard(false)}>Seguir acá</button><button className="auth-login" onClick={onClose}>Cerrar formulario</button></div></div>:
    state.claimId?<section className="submission-result"><CheckCircle2 size={32} aria-hidden="true"/><p role="status">Reclamo enviado para revisión</p><p>Todavía no aparece en el listado público.</p>
      {state.error&&<p role="alert">{/Supabase|migraci|RLS/i.test(state.error)?'No pudimos completar el envío en este momento. Intentá otra vez más tarde.':state.error}</p>}{state.stage==='uploading'&&<p role="status">Subiendo y registrando la fotografía…</p>}
      {state.stage==='photo_error'&&<button className="primary-button" onClick={()=>{void submission.submit(draft,file)}}>Reintentar solo la imagen</button>}
      {!busy&&<button className="auth-login" onClick={()=>onView(state.claimId!)}>Abrir en Mis reclamos</button>}
    </section>:<form ref={form} noValidate onSubmit={submit} aria-busy={busy}>
      <p className="compose-notice">Contanos qué pasa en tu barrio. Revisamos cada reclamo antes de compartirlo con la comunidad.</p>
      <p className="field-hint">No incluyas datos sensibles ni información privada de otras personas en el texto o la fotografía.</p>
      {categoryError&&<div role="alert" className="auth-message auth-message-error">No pudimos cargar las categorías.<button type="button" onClick={()=>setCategoryAttempt(a=>a+1)}>Reintentar categorías</button></div>}
      <fieldset disabled={locked}>
        <DraftField name="title" label="Título" draft={draft} setDraft={setDraft} error={errors.title}/>
        <div className="auth-field"><label htmlFor="claim-categoryId">Categoría</label><select id="claim-categoryId" name="categoryId" value={draft.categoryId} disabled={loadingCategories||categoryError} onChange={e=>setDraft(d=>({...d,categoryId:e.target.value}))} aria-invalid={!!errors.categoryId} aria-describedby={errors.categoryId?'claim-categoryId-error':undefined}><option value="">{loadingCategories?'Cargando categorías…':'Elegí una categoría'}</option>{categories.map(category=><option key={category.id} value={category.id}>{categoryNames[category.slug]}</option>)}</select>{errors.categoryId&&<p id="claim-categoryId-error" className="field-error">{errors.categoryId}</p>}</div>
        <DraftField name="description" label="Descripción" draft={draft} setDraft={setDraft} error={errors.description} multiline/>
        <DraftField name="address" label="Dirección o referencia" draft={draft} setDraft={setDraft} error={errors.address}/>
        <DraftField name="neighborhood" label="Barrio" draft={draft} setDraft={setDraft} error={errors.neighborhood}/>
        <div className="auth-field photo-field"><label htmlFor="claim-photo"><Camera size={16} aria-hidden="true"/> Fotografía opcional</label><input id="claim-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="claim-photo-hint" onChange={e=>{void selectPhoto(e.target.files?.[0])}}/><p id="claim-photo-hint" className="field-hint">Una imagen JPEG, PNG o WebP de hasta 5 MiB.</p>{checkingPhoto&&<p role="status">Comprobando imagen…</p>}{fileError&&<p className="field-error" role="alert">{fileError}</p>}{preview&&<img className="photo-preview" src={preview} alt="Vista previa de la fotografía seleccionada"/>}{(file||fileError)&&<button type="button" className="auth-login" onClick={()=>{photoCheck.current++;setFile(null);setFileError(null);setCheckingPhoto(false);const input=document.getElementById('claim-photo') as HTMLInputElement|null;if(input)input.value=''}}>Quitar fotografía</button>}</div>
      </fieldset>
      {state.error&&<p className="auth-message auth-message-error" role="alert">{/Supabase|migraci|RLS/i.test(state.error)?'No pudimos completar el envío en este momento. Intentá otra vez más tarde.':state.error}</p>}
      <button className="primary-button auth-submit" disabled={busy||checkingPhoto||loadingCategories||categoryError||!!fileError}>{busy?'Guardando reclamo…':state.stage==='uncertain'?'Comprobar y continuar':'Enviar para revisión'}</button>
    </form>}
  </dialog>
}
function DraftField({name,label,draft,setDraft,error,multiline=false}:{name:keyof ClaimDraft;label:string;draft:ClaimDraft;setDraft:React.Dispatch<React.SetStateAction<ClaimDraft>>;error?:string;multiline?:boolean}) {
  const common={id:`claim-${name}`,name,value:draft[name],required:true,'aria-invalid':!!error,'aria-describedby':error?`claim-${name}-error`:undefined,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setDraft(d=>({...d,[name]:e.target.value}))}
  return <div className="auth-field"><label htmlFor={common.id}>{label}</label>{multiline?<textarea {...common} rows={4}/>:<input {...common} type="text"/>}{error&&<p className="field-error" id={`claim-${name}-error`}>{error}</p>}</div>
}
