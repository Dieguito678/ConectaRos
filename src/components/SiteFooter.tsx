import { MapPin } from 'lucide-react'
import { Brand } from './Brand'
import { sections, type Section } from './SiteHeader'
export function SiteFooter({onSection}:{onSection:(section:Section)=>void}) {
  const year=new Intl.DateTimeFormat('es-AR',{year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date())
  return <footer className="site-footer"><div className="shell"><div className="footer-main"><div><Brand onClick={()=>onSection('Mi barrio')}/><p className="footer-tagline">Conectamos vecinos para mejorar Rosario.</p></div><nav aria-label="Navegación del pie de página">{sections.map(section=><button type="button" key={section} onClick={()=>onSection(section)}>{section}</button>)}</nav></div>
    <div className="footer-bottom"><p>Plataforma comunitaria independiente. No reemplaza los canales oficiales ni los servicios de emergencia.</p><span><MapPin size={15} aria-hidden="true"/>Rosario, Santa Fe, Argentina</span><span>© {year} ConectaRos</span></div>
  </div></footer>
}
