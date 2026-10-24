import { Lightbulb, Trash2, Construction, Footprints, Trees, Droplets, Zap, Flame, Shapes } from 'lucide-react'
import type { Category } from '../types/claim'

const icons = { alumbrado: Lightbulb, residuos: Trash2, baches: Construction, veredas: Footprints, arbolado: Trees, agua: Droplets, electricidad: Zap, gas: Flame, otros: Shapes }
export function CategoryIcon({ category, size = 20 }: { category: Category; size?: number }) {
  const Icon = icons[category]
  return <Icon size={size} aria-hidden="true" />
}
