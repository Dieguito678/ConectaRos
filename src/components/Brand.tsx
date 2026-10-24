import { Hexagon } from 'lucide-react'
export function Brand({onClick}: {onClick:()=>void}) {
  return <button type="button" className="brand" onClick={onClick} aria-label="ConectaRos, inicio"><span className="brand-icon"><Hexagon size={27} strokeWidth={1.7} aria-hidden="true"/><span/></span><span className="brand-name">Conecta<span>Ros</span></span></button>
}
