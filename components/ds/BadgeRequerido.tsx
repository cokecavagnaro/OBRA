import AntLogo from '@/components/AntLogo'

interface Props {
  label: string
  requerido?: boolean
}

// Regla 12 del handoff: obligatorio = ícono de hormiga en rojo junto al
// label; opcional = la palabra "(opcional)" en gris.
export default function BadgeRequerido({ label, requerido = false }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs uppercase text-gris-texto font-bold">
      {requerido && <AntLogo size={12} className="text-error" />}
      {label}
      {!requerido && <span className="normal-case text-gris-texto">(opcional)</span>}
    </span>
  )
}
