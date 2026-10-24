import { useEffect, useRef, useState } from 'react'
import { createClaimsRepository, type ClaimScope, type ClaimsRepository } from './repository'
import type { ClaimCursor, OwnClaim } from './model'
import { useAuth } from '../auth/AuthProvider'

export function useObjectUrl(blob: Blob | null) {
  const [value,setValue]=useState<{blob:Blob;url:string}|null>(null)
  useEffect(()=>{
    if (!blob) {setValue(null);return}
    const url=URL.createObjectURL(blob);setValue({blob,url})
    return()=>URL.revokeObjectURL(url)
  },[blob])
  return value?.blob===blob?value?.url:null
}
export function useOwnClaims(userId: string, refresh: number, repository: ClaimsRepository) {
  const {getCurrentUserId}=useAuth()
  const current=useRef(userId);current.current=userId
  const [state,setState]=useState<{owner:string;rows:OwnClaim[];loading:boolean;more:boolean;loadingMore:boolean;error:string|null;cursor?:ClaimCursor}>(
    {owner:userId,rows:[],loading:true,more:false,loadingMore:false,error:null})
  const [attempt,setAttempt]=useState(0)
  const active=useRef<{scope:ClaimScope;controller:AbortController}|null>(null)
  const loadingMore=useRef(false)
  useEffect(()=>{
    const controller=new AbortController()
    const scope={userId,signal:controller.signal,isCurrent:()=>current.current===userId&&getCurrentUserId()===userId&&!controller.signal.aborted}
    active.current={scope,controller};loadingMore.current=false
    setState({owner:userId,rows:[],loading:true,more:false,loadingMore:false,error:null})
    repository.list(scope).then(page=>{if(scope.isCurrent())setState({owner:userId,rows:page.rows,loading:false,more:page.more,cursor:page.cursor,loadingMore:false,error:null})})
      .catch(()=>{if(scope.isCurrent())setState(s=>({...s,loading:false,error:'No pudimos cargar tus reclamos. Revisá la sesión y reintentá.'}))})
    return()=>{controller.abort();active.current=null}
  },[userId,refresh,attempt,repository,getCurrentUserId])
  async function loadMore() {
    const context=active.current
    if(!context||loadingMore.current||!state.more||state.loading)return
    loadingMore.current=true;setState(s=>({...s,loadingMore:true,error:null}))
    try {
      const page=await repository.list(context.scope,state.cursor)
      if(context.scope.isCurrent())setState(s=>({...s,rows:[...new Map([...s.rows,...page.rows].map(row=>[row.id,row])).values()],more:page.more,cursor:page.cursor,loadingMore:false}))
    }catch{if(context.scope.isCurrent())setState(s=>({...s,loadingMore:false,error:'No pudimos cargar la siguiente página. Podés reintentar sin perder la lista.'}))}
    finally{if(active.current===context)loadingMore.current=false}
  }
  return {...(state.owner===userId?state:{...state,rows:[],loading:true,error:null}),loadMore,retry:()=>setAttempt(a=>a+1)}
}
// A stable repository instance per private workspace; no extra Supabase client.
export function useClaimsRepository(provided?: ClaimsRepository) {
  const [repository]=useState(()=>provided??createClaimsRepository())
  return repository
}
