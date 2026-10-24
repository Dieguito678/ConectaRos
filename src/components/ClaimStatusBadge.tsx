import { CircleCheck, CircleDashed, CircleX, Clock3, EyeOff } from 'lucide-react'
import { getClaimPresentation, type ModerationStatus } from '../lib/claim-status'
import type { WorkflowStatus } from '../types/claim'

const icons = { pending: CircleDashed, progress: Clock3, resolved: CircleCheck, rejected: CircleX, hidden: EyeOff }

export function ClaimStatusBadge({ status, moderationStatus, showStage = false }: {
  status: WorkflowStatus
  moderationStatus?: ModerationStatus
  showStage?: boolean
}) {
  const presentation = getClaimPresentation({ status, moderationStatus })
  const Icon = icons[presentation.icon]
  return <span className="claim-status-group">
    <span className={`claim-status-badge status-${presentation.tone}`} title={presentation.helper}>
      <Icon size={15} aria-hidden="true" />{presentation.label}
    </span>
    {showStage && presentation.domain === 'management' && <span className="claim-status-stage">{presentation.stageLabel}</span>}
  </span>
}
