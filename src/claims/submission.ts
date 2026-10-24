import { checkScope, type ClaimsRepository, type ClaimScope, ClaimError } from './repository'
import { photoTypes, type ClaimDraft } from './model'

export interface SubmissionState {
  stage: 'editing' | 'saving' | 'uploading' | 'uncertain' | 'photo_error' | 'done'
  claimId: string | null
  error: string | null
}
export function createSubmission(repository: ClaimsRepository, scope: ClaimScope, onSaved: (id: string) => void) {
  let state: SubmissionState = {stage:'editing',claimId:null,error:null}
  let attempt: {id:string;draft:ClaimDraft;file:File|null;path:string|null} | null = null
  const listeners = new Set<() => void>()
  const publish = (patch: Partial<SubmissionState>) => {
    if (scope.signal.aborted || !scope.isCurrent()) return
    state={...state,...patch}; listeners.forEach(listener=>listener())
  }
  async function submit(draft: ClaimDraft, file: File | null) {
    if (['saving','uploading','done'].includes(state.stage)) return
    checkScope(scope)
    if (!attempt) {
      const id=crypto.randomUUID()
      attempt={id,draft:{...draft},file,path:file?`${scope.userId}/${id}/claim/${crypto.randomUUID()}.${photoTypes[file.type as keyof typeof photoTypes]}`:null}
    }
    try {
      if (!state.claimId) {
        publish({stage:'saving',error:null})
        const id=await repository.submit(attempt.id,attempt.draft,scope)
        checkScope(scope)
        publish({claimId:id})
        onSaved(id)
      }
      if (attempt.file && attempt.path) {
        publish({stage:'uploading',error:null})
        await repository.attach(attempt.id,attempt.path,attempt.file,scope)
        checkScope(scope)
      }
      publish({stage:'done',error:null})
    } catch (error) {
      if (scope.signal.aborted || !scope.isCurrent()) return
      if (state.claimId) publish({stage:'photo_error',error:'El reclamo se guardó, pero la foto no pudo confirmarse. Podés reintentar solo la imagen.'})
      else if (error instanceof ClaimError && !error.uncertain) {
        attempt=null;publish({stage:'editing',error:error.message})
      } else publish({stage:'uncertain',error:'No pudimos confirmar el envío. Conservamos este intento para comprobarlo antes de reintentar; no crees otro reclamo con los mismos datos.'})
    }
  }
  return {getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},submit}
}
