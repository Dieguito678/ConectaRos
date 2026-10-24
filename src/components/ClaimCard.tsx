import { ArrowUpRight, MapPin } from 'lucide-react'
import { workflowLabels, type Claim } from '../types/claim'
import { CategoryIcon } from './CategoryIcon'

export function StatusBadge({ status, workflowStatus }: Pick<Claim, 'status' | 'workflowStatus'>) {
  return <span className={`status ${status === 'Resuelto' ? 'resolved' : status === 'En proceso' ? 'progress' : 'pending'}`}><span />{workflowStatus ? workflowLabels[workflowStatus] : status}</span>
}

export function ClaimCard({ claim, onOpen }: { claim: Claim; onOpen: (claim: Claim) => void }) {
  return <button className="claim-card group text-left" onClick={() => onOpen(claim)} aria-label={`Ver detalle: ${claim.title}`}>
    <div className="flex items-center justify-between gap-2"><span className={`category-icon ${claim.category}`}><CategoryIcon category={claim.category} /></span><StatusBadge status={claim.status} workflowStatus={claim.workflowStatus} /></div>
    <p className="category-label">{claim.category}{claim.isDemo && ' · ficticio'}</p>
    <h3>{claim.title}</h3>
    <p className="address"><MapPin size={14} aria-hidden="true" />{claim.address}</p>
    <div className="card-footer"><span>{claim.neighborhood} <span className="dot">·</span> {new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${claim.date}T12:00:00Z`))}</span><ArrowUpRight size={18} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" /></div>
  </button>
}
