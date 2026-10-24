import { workflowLabels, type WorkflowStatus } from '../types/claim'
import type { DatabaseEnums } from '../types/database.generated'

export type ModerationStatus = DatabaseEnums['moderation_status']
export type ClaimStatusTone = 'red' | 'amber' | 'green' | 'neutral'
export interface ClaimPresentation {
  tone: ClaimStatusTone
  label: string
  stageLabel: string
  helper: string
  domain: 'moderation' | 'management'
  icon: 'pending' | 'progress' | 'resolved' | 'rejected' | 'hidden'
}

/** Presentation only. Moderation takes precedence without changing stored states. */
export function getClaimPresentation({
  status,
  moderationStatus = 'aprobado',
}: {
  status: WorkflowStatus
  moderationStatus?: ModerationStatus
}): ClaimPresentation {
  const stageLabel = workflowLabels[status]
  if (moderationStatus === 'pendiente') {
    return { tone: 'amber', label: 'En revisión', stageLabel, domain: 'moderation', icon: 'progress', helper: 'Todavía no es visible para la comunidad.' }
  }
  if (moderationStatus === 'rechazado') {
    return { tone: 'red', label: 'No aprobado', stageLabel, domain: 'moderation', icon: 'rejected', helper: 'Este reclamo no fue aprobado para aparecer en la comunidad.' }
  }
  if (moderationStatus === 'oculto') {
    return { tone: 'neutral', label: 'No visible', stageLabel, domain: 'moderation', icon: 'hidden', helper: 'Este reclamo no está visible para la comunidad.' }
  }
  if (status === 'resuelto') {
    return { tone: 'green', label: 'Resuelto', stageLabel, domain: 'management', icon: 'resolved', helper: 'La gestión registra una resolución confirmada.' }
  }
  if (status === 'publicado') {
    return { tone: 'red', label: 'Pendiente', stageLabel, domain: 'management', icon: 'pending', helper: 'Visible para la comunidad, sin avances de gestión registrados. El color no indica una emergencia.' }
  }
  return { tone: 'amber', label: 'En proceso', stageLabel, domain: 'management', icon: 'progress', helper: 'Hay avances de gestión registrados; la resolución todavía no está confirmada.' }
}
