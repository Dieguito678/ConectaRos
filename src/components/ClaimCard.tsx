import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react'
import type { Category, Claim, WorkflowStatus } from '../types/claim'
import { categoryNames } from '../claims/model'
import { getClaimPresentation, type ModerationStatus } from '../lib/claim-status'
import { CategoryIcon } from './CategoryIcon'
import { ClaimStatusBadge } from './ClaimStatusBadge'

// Compatibility for existing consumers; all presentation still uses the single mapper.
export function StatusBadge({ status, workflowStatus }: Pick<Claim, 'status' | 'workflowStatus'>) {
  return <ClaimStatusBadge status={workflowStatus ?? (status === 'Resuelto' ? 'resuelto' : status === 'En proceso' ? 'en_tratamiento' : 'publicado')} />
}

export function ClaimCard({ claim, onOpen }: { claim: Claim; onOpen: (claim: Claim) => void }) {
  return <ClaimCardView title={claim.title} description={claim.description} category={claim.category}
    categoryName={categoryNames[claim.category]} address={claim.address} neighborhood={claim.neighborhood}
    date={claim.date} isExample={claim.isDemo} status={claim.workflowStatus ?? (claim.status === 'Resuelto' ? 'resuelto' : claim.status === 'En proceso' ? 'en_tratamiento' : 'publicado')}
    onClick={() => onOpen(claim)} accessibleLabel={`Ver detalle: ${claim.title}`} />
}

export function ClaimCardView({ title, description, category, categoryName, address, neighborhood, date, isExample,
  status, moderationStatus, onClick, accessibleLabel, headingLevel = 3 }: {
  title: string; description: string; category: Category; categoryName: string; address: string; neighborhood: string;
  date: string; isExample?: boolean; status: WorkflowStatus; moderationStatus?: ModerationStatus;
  onClick: () => void; accessibleLabel: string; headingLevel?: 2 | 3
}) {
  const presentation = getClaimPresentation({ status, moderationStatus })
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const formattedDate = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date(date.length === 10 ? `${date}T12:00:00Z` : date))
  return <button type="button" className="claim-card" onClick={onClick} aria-label={accessibleLabel}>
    <div className="claim-card-head"><span className={`category-icon ${category}`}><CategoryIcon category={category} /></span>
      <ClaimStatusBadge status={status} moderationStatus={moderationStatus} /></div>
    <div className="claim-card-category"><span>{categoryName}</span>{isExample && <span className="example-label">Ejemplo</span>}</div>
    <Heading>{title}</Heading>
    <p className="claim-card-description">{description}</p>
    {presentation.domain === 'moderation' && <p className="claim-status-help">{presentation.helper}</p>}
    <div className="claim-card-meta"><span><MapPin size={15} aria-hidden="true" />{neighborhood}</span><span className="claim-card-address">{address}</span></div>
    <div className="card-footer"><time dateTime={date}><CalendarDays size={14} aria-hidden="true" />{formattedDate}</time>
      <span className="claim-card-action">Ver detalle <ArrowUpRight size={16} aria-hidden="true" /></span></div>
  </button>
}
