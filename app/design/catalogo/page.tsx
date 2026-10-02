'use client'

import { useState } from 'react'
import Button from '@/components/ds/Button'
import Card from '@/components/ds/Card'
import Chip from '@/components/ds/Chip'
import InputMonto from '@/components/ds/InputMonto'
import InputTexto from '@/components/ds/InputTexto'
import BottomSheet from '@/components/ds/BottomSheet'
import Header from '@/components/ds/Header'
import BadgeRequerido from '@/components/ds/BadgeRequerido'
import AntLogo from '@/components/AntLogo'
import {
  CameraIcon,
  EyeIcon,
  EngranajeIcon,
  LapizIcon,
  TachoIcon,
  RelojIcon,
  CheckIcon,
  XIcon,
  MasIcon,
  CampanaIcon,
  ChevronIcon,
} from '@/components/ds/icons'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase text-gris-texto font-bold">{titulo}</h2>
      {children}
    </section>
  )
}

const iconos = [
  { nombre: 'Cámara', Icon: CameraIcon },
  { nombre: 'Ojo', Icon: EyeIcon },
  { nombre: 'Engranaje', Icon: EngranajeIcon },
  { nombre: 'Lápiz', Icon: LapizIcon },
  { nombre: 'Tacho', Icon: TachoIcon },
  { nombre: 'Reloj', Icon: RelojIcon },
  { nombre: 'Check', Icon: CheckIcon },
  { nombre: 'X', Icon: XIcon },
  { nombre: 'Más', Icon: MasIcon },
  { nombre: 'Campana', Icon: CampanaIcon },
  { nombre: 'Chevron', Icon: ChevronIcon },
]

export default function CatalogoPage() {
  const [monto, setMonto] = useState('')
  const [chipsActivos, setChipsActivos] = useState<Record<string, boolean>>({ Terminaciones: true })
  const [sheetAbierta, setSheetAbierta] = useState(false)

  return (
    <div className="min-h-dvh bg-crema font-mono text-tinta pb-16">
      <Header title="Catálogo de componentes" backLabel="Inicio" onBack={() => history.back()} />

      <div className="p-[18px] flex flex-col gap-8">
        <Seccion titulo="Logo">
          <div className="flex items-center gap-4">
            <AntLogo size={64} />
            <AntLogo size={44} />
            <AntLogo size={20} className="text-error" />
          </div>
        </Seccion>

        <Seccion titulo="Botones">
          <Button variant="primary">Sí, guardar</Button>
          <Button variant="secondary">Sacar de nuevo</Button>
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </Seccion>

        <Seccion titulo="Tarjetas (sombras)">
          <div className="flex flex-col gap-4">
            <Card shadow="hard-sm">
              <p className="text-sm">shadow hard-sm — filas, chips</p>
            </Card>
            <Card shadow="hard">
              <p className="text-sm">shadow hard — tarjetas, botones (default)</p>
            </Card>
            <Card shadow="hard-xl">
              <p className="text-sm">shadow hard-xl — hero / marco</p>
            </Card>
          </div>
        </Seccion>

        <Seccion titulo="Chips">
          <div className="flex flex-wrap gap-2">
            {['Terminaciones', 'Obra gruesa', 'Instalaciones'].map((etapa) => (
              <Chip
                key={etapa}
                active={!!chipsActivos[etapa]}
                onClick={() => setChipsActivos((s) => ({ ...s, [etapa]: !s[etapa] }))}
              >
                {etapa}
              </Chip>
            ))}
            <Chip active onRemove={() => {}}>
              cemento
            </Chip>
          </div>
        </Seccion>

        <Seccion titulo="Inputs">
          <div className="flex flex-col gap-3">
            <div>
              <BadgeRequerido label="Presupuesto" />
              <div className="mt-1.5">
                <InputMonto value={monto} onChange={setMonto} placeholder="$ 0" />
              </div>
            </div>
            <div>
              <BadgeRequerido label="¿Qué compraste?" requerido />
              <div className="mt-1.5">
                <InputTexto placeholder="Ej: Cemento" />
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Header con volver">
          <Card shadow="hard-sm" className="!p-0 overflow-hidden">
            <Header title="Ficha de boleta" backLabel="Boletas" onBack={() => {}} />
          </Card>
        </Seccion>

        <Seccion titulo="Hoja inferior">
          <Button variant="secondary" onClick={() => setSheetAbierta(true)}>
            Abrir hoja &quot;¿Dónde lo guardamos?&quot;
          </Button>
          <BottomSheet open={sheetAbierta} onClose={() => setSheetAbierta(false)} title="¿Dónde lo guardamos?">
            <div className="flex flex-wrap gap-2">
              {['Casa Container', 'Casa Chago'].map((obra) => (
                <Chip key={obra} active={obra === 'Casa Container'}>
                  {obra}
                </Chip>
              ))}
            </div>
          </BottomSheet>
        </Seccion>

        <Seccion titulo="Íconos de línea">
          <div className="grid grid-cols-4 gap-4">
            {iconos.map(({ nombre, Icon }) => (
              <div key={nombre} className="flex flex-col items-center gap-1 text-[11px] text-gris-texto">
                <Icon size={28} />
                {nombre}
              </div>
            ))}
          </div>
        </Seccion>
      </div>
    </div>
  )
}
