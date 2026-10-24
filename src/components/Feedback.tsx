import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return <div className="claims-grid skeleton-grid" aria-hidden="true">{Array.from({ length:count },(_,i)=><div className="card-skeleton" key={i}>
    <div className="skeleton-top"><span className="skeleton skeleton-icon"/><span className="skeleton skeleton-badge"/></div>
    <span className="skeleton skeleton-short"/><span className="skeleton skeleton-title"/><span className="skeleton skeleton-line"/><span className="skeleton skeleton-line"/><span className="skeleton skeleton-footer"/>
  </div>)}</div>
}
export function EmptyState({ icon, title, description, action, headingLevel=2 }: {icon?:ReactNode;title:string;description:string;action?:ReactNode;headingLevel?:2|3}) {
  const Heading=headingLevel===3?'h3':'h2'
  return <div className="empty-state"><span className="empty-icon">{icon??<MessageSquare size={28} aria-hidden="true"/>}</span><Heading>{title}</Heading><p>{description}</p>{action&&<div className="empty-actions">{action}</div>}</div>
}
