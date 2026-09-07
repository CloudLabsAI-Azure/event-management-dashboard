import { Archive, BookOpen, CalendarClock, Megaphone, Rocket } from 'lucide-react'

export const labUpdateStyles = {
  'new-release': { icon: Rocket, label: 'New Release', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', border: 'border-l-emerald-500' },
  'catalogue-release': { icon: BookOpen, label: 'Catalog release', color: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', border: 'border-l-sky-500' },
  retired: { icon: Archive, label: 'Retired', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', border: 'border-l-rose-500' },
  'planned-retirement': { icon: CalendarClock, label: 'Planned retirement', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', border: 'border-l-amber-500' },
  'manual-update': { icon: Megaphone, label: 'Manual update', color: 'bg-primary/10 text-primary', border: 'border-l-primary' },
}