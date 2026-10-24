import { useEffect, useRef, useState } from 'react'
import { Compass, Gift, Menu, MessageSquare, Plus, X } from 'lucide-react'
import { AuthHeader } from '../auth/AuthHeader'
import type { AuthMode } from '../auth/auth-validation'
import { Brand } from './Brand'

export const sections=['Mi barrio','Mis reclamos','Beneficios'] as const
export type Section=typeof sections[number]
const navIcons=[Compass,MessageSquare,Gift]
export function SiteHeader({section,onSection,onCreate,onAuth,createDisabled}:{section:Section;onSection:(section:Section)=>void;onCreate:()=>void;onAuth:(mode:AuthMode)=>void;createDisabled:boolean}) {
  const [open,setOpen]=useState(false)
  const header=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open)return
    const outside=(event:PointerEvent)=>{if(!header.current?.contains(event.target as Node))setOpen(false)}
    document.addEventListener('pointerdown',outside)
    return()=>document.removeEventListener('pointerdown',outside)
  },[open])
  function select(item:Section){onSection(item);if(open){setOpen(false);toggle.current?.focus()}}
  return <header className="site-header" ref={header} onKeyDown={event=>{
    if(event.key==='Escape'&&open&&!event.defaultPrevented&&!header.current?.querySelector('[role="menu"]')){event.preventDefault();setOpen(false);toggle.current?.focus()}
  }} onBlur={event=>{if(open&&event.relatedTarget&&!header.current?.contains(event.relatedTarget as Node))setOpen(false)}}>
    <div className="shell header-inner"><Brand onClick={()=>select('Mi barrio')}/>
      <div className={`header-panel ${open?'is-open':''}`} id="main-navigation" ref={panel}>
        <nav aria-label="Navegación principal">{sections.map((item,index)=>{const Icon=navIcons[index];return <button type="button" key={item} className={`nav-item ${section===item?'active':''}`} aria-current={section===item?'page':undefined} onClick={()=>select(item)}><Icon size={18} aria-hidden="true"/>{item}</button>})}</nav>
        <AuthHeader onOpen={mode=>{setOpen(false);onAuth(mode)}}/>
      </div>
      <button type="button" className="primary-button create-header" onClick={()=>{setOpen(false);onCreate()}} disabled={createDisabled}><Plus size={18} aria-hidden="true"/>Crear reclamo</button>
      <button type="button" ref={toggle} className="mobile-menu-toggle" aria-label={open?'Cerrar menú':'Abrir menú'} aria-expanded={open} aria-controls="main-navigation" onClick={()=>{
        const next=!open;setOpen(next)
        if(next)requestAnimationFrame(()=>{if(panel.current?.classList.contains('is-open'))panel.current.querySelector<HTMLButtonElement>('.nav-item')?.focus()})
      }}>{open?<X size={22} aria-hidden="true"/>:<Menu size={22} aria-hidden="true"/>}</button>
    </div>
  </header>
}
