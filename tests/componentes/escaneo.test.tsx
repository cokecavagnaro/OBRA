// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dbPorDefecto, usuario, proyecto, gasto, item, router, navegacion } from './preparar'
import * as db from '@/lib/supabase/db'
import Scan from '@/app/scan/page'

vi.mock('next/navigation', async () => await import('./navegacionMock'))
vi.mock('@/lib/supabase/db')
vi.mock('@/lib/imagen', () => ({
  normalizarImagenParaSubida: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), dataUrl: 'data:image/jpeg;base64,eA==' })),
}))

const RESPUESTA_INGRESO = {
  tipo: 'ingreso', confianza: 0.96,
  ingreso: { remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: 6_000_000, fecha: '2026-09-12' },
}
const itemIA = (o: Record<string, unknown>) => ({ cantidad: 1, unidad: 'un', precio_unitario: 0, confianza: 0.9, ...o })
const RESPUESTA_GASTO = (total = 141_440) => ({
  tipo: 'gasto', proveedor: 'Sodimac Quilicura', rut: '96.928.180-5', fecha: '2026-09-30', moneda: 'CLP', total,
  interpretacion_precios: 'bruto', iva_impreso: null, otros_impuestos: null,
  items: [
    itemIA({ descripcion: 'Pintura látex blanca 20L', subtotal: 100_000, precio_unitario: 100_000, categoria: 'Pinturas', etiquetas: ['pintura', 'látex'] }),
    itemIA({ descripcion: 'Elemento no identificado', subtotal: 41_440, precio_unitario: 41_440, categoria: 'Sin clasificar', etiquetas: [], confianza: 0.45 }),
  ],
})

let respuestaAnalisis: unknown
let cuerpoAnalisis: Record<string, unknown> | null

beforeEach(() => {
  navegacion.params = new URLSearchParams()
  dbPorDefecto(db as unknown as Record<string, unknown>)
  vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('admin') as never)
  vi.mocked(db.getProyectos).mockResolvedValue([proyecto('p1', 'Casa Los Aromos')] as never)
  cuerpoAnalisis = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    if (url === '/api/analizar-boleta') {
      cuerpoAnalisis = JSON.parse(init?.body ?? '{}')
      return { ok: true, json: async () => respuestaAnalisis }
    }
    if (url === '/api/verificar-calidad-imagen') return { ok: true, json: async () => ({ calidad_suficiente: true, motivo: null }) }
    return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }), json: async () => ({}) }
  }))
})

// Recorre los pasos 1 y 2 hasta que la IA devuelve su análisis.
async function escanear(container: HTMLElement) {
  const user = userEvent.setup()
  await screen.findByText('Contexto del documento')
  await user.selectOptions(await screen.findByRole('combobox', { name: '' }).catch(() => screen.getAllByRole('combobox')[0]), 'p1')
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
  await screen.findByText('Fotografiar documento', { selector: 'h2' })
  const inputs = container.querySelectorAll('input[type="file"]')
  fireEvent.change(inputs[1], { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } })
  const analizar = await screen.findByRole('button', { name: 'Analizar con IA' })
  await waitFor(() => expect(analizar).toBeEnabled())
  await user.click(analizar)
  return user
}

describe('Escáner: la IA reconoce un ingreso', () => {
  beforeEach(() => { respuestaAnalisis = RESPUESTA_INGRESO })

  it('muestra la pantalla verde de ingreso con lo que leyó la IA', async () => {
    const { container } = render(<Scan />)
    await escanear(container)
    expect(await screen.findByText('Ingreso de dinero', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('↓ Ingreso detectado')).toBeInTheDocument()
    expect(screen.getByText('Confianza 96%')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Inversiones Rojas SpA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cuenta Vista ···4821')).toBeInTheDocument()
    expect(screen.getByDisplayValue('$ 6.000.000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-09-12')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('bg-ingreso-fondo')
    // No entra al flujo de boleta
    expect(screen.queryByText(/revisar totales/i)).not.toBeInTheDocument()
  })

  it('al guardar sube la foto y registra el ingreso en el proyecto elegido', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: 'Guardar ingreso' }))
    await waitFor(() => expect(db.saveIngreso).toHaveBeenCalledTimes(1))
    expect(db.subirImagenBoleta).toHaveBeenCalledWith('c1', 'p1', expect.any(File))
    expect(db.saveIngreso).toHaveBeenCalledWith(expect.objectContaining({
      proyecto_id: 'p1', remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: 6_000_000,
      fecha: '2026-09-12', origen: 'foto', imagen_url: 'https://almacen/boleta.jpg', creado_por_email: 'admin@prueba.cl',
    }))
    expect(db.saveGasto).not.toHaveBeenCalled()
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/proyecto/p1'))
  })

  it('la persona puede corregir los datos leídos antes de guardar', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    const campo = await screen.findByDisplayValue('Inversiones Rojas SpA')
    await user.clear(campo)
    await user.type(campo, 'Marcela Rojas')
    await user.click(screen.getByRole('button', { name: 'Guardar ingreso' }))
    await waitFor(() => expect(db.saveIngreso).toHaveBeenCalledWith(expect.objectContaining({ remitente: 'Marcela Rojas' })))
  })

  it('un usuario sin permiso para registrar ingresos no puede guardarlo', async () => {
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('usuario') as never)
    const { container } = render(<Scan />)
    await escanear(container)
    expect(await screen.findByText(/no puede registrar ingresos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar ingreso' })).toBeDisabled()
    expect(db.saveIngreso).not.toHaveBeenCalled()
  })

  it('Cancelar pide confirmación; "Seguir aquí" no pierde nada y "Sí, cancelar" descarta todo', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await screen.findByText('Ingreso de dinero', { selector: 'h2' })
    await user.click(screen.getAllByRole('button', { name: /Cancelar/ })[0])
    expect(await screen.findByText('¿Cancelar esta operación?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguir aquí' }))
    expect(router.push).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button', { name: /Cancelar/ })[0])
    await user.click(await screen.findByRole('button', { name: 'Sí, cancelar' }))
    expect(router.push).toHaveBeenCalledWith('/')
    expect(db.saveIngreso).not.toHaveBeenCalled()
    expect(db.saveGasto).not.toHaveBeenCalled()
  })

  it('"¿No es un ingreso?" pasa a cargar un gasto a mano', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: /No es un ingreso/ }))
    expect(await screen.findByText('Gasto · clasificar ítems', { selector: 'h2' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('bg-gasto-fondo')
  })
})

describe('Escáner: la IA reconoce un gasto', () => {
  beforeEach(() => { respuestaAnalisis = RESPUESTA_GASTO() })

  it('sigue el flujo de boleta con pantalla roja y botón Cancelar', async () => {
    const { container } = render(<Scan />)
    await escanear(container)
    expect(await screen.findByText('Gasto · revisar totales', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('Cuadra', { exact: false })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('bg-gasto-fondo')
    expect(screen.getAllByRole('button', { name: /Cancelar/ }).length).toBeGreaterThan(0)
    expect(screen.queryByText('↓ Ingreso detectado')).not.toBeInTheDocument()
  })

  it('"Guardar boleta" salta el etiquetado y el sistema etiqueta los ítems que no tenían', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: 'Guardar boleta' }))
    await waitFor(() => expect(db.saveGasto).toHaveBeenCalledTimes(1))
    const guardado = vi.mocked(db.saveGasto).mock.calls[0][0] as unknown as { items: { descripcion: string; etiquetas: string[]; estado: string }[]; proyecto_id: string; total: number; solicitante_rol: string }
    expect(guardado.proyecto_id).toBe('p1')
    expect(guardado.total).toBe(141_440)
    // el ítem que ya tenía etiquetas se respeta; el otro recibe "varios" (su categoría era "Sin clasificar")
    expect(guardado.items.map((i) => i.etiquetas)).toEqual([['pintura', 'látex'], ['varios']])
    expect(guardado.items.every((i) => i.estado === 'confirmado')).toBe(true)
    // el aprendizaje del proyecto solo recibe lo que eligió la IA/la persona, no lo automático
    expect(db.upsertClasificacionAprendida).toHaveBeenCalledTimes(1)
    expect(db.upsertClasificacionAprendida).toHaveBeenCalledWith(expect.objectContaining({ descripcion: 'Pintura látex blanca 20L', etiquetas: ['pintura', 'látex'] }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'))
  })

  it('un usuario sin permiso de aprobar guarda y envía a aprobación', async () => {
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('usuario') as never)
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: 'Guardar boleta y enviar a aprobación' }))
    await waitFor(() => expect(db.saveGasto).toHaveBeenCalledWith(expect.objectContaining({ solicitante_rol: 'usuario', solicitante_id: 'u-usuario' })))
  })

  it('con descuadre no se puede guardar ni continuar hasta resolverlo', async () => {
    respuestaAnalisis = RESPUESTA_GASTO(150_000)
    const { container } = render(<Scan />)
    await escanear(container)
    await screen.findByText('Gasto · revisar totales', { selector: 'h2' })
    expect(screen.getByRole('button', { name: 'Continuar a clasificar ítems' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar boleta' })).not.toBeInTheDocument()
    expect(screen.getByText(/¿La diferencia es un envío o cargo extra\?/)).toBeInTheDocument()
  })

  it('el camino normal sigue funcionando: clasificar ítem por ítem y guardar', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: 'Continuar a clasificar ítems' }))
    expect(await screen.findByText('Gasto · clasificar ítems', { selector: 'h2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.type(screen.getByPlaceholderText('+ Agregar etiqueta...'), 'ferretería{Enter}')
    await user.click(screen.getByRole('button', { name: 'Guardar boleta' }))
    await waitFor(() => expect(db.saveGasto).toHaveBeenCalledTimes(1))
    const guardado = vi.mocked(db.saveGasto).mock.calls[0][0] as unknown as { items: { etiquetas: string[]; estado: string }[] }
    expect(guardado.items.map((i) => i.etiquetas)).toEqual([['pintura', 'látex'], ['ferretería']])
    expect(db.upsertClasificacionAprendida).toHaveBeenCalledTimes(2)
  })

  it('desde la pantalla del gasto se puede cambiar a ingreso', async () => {
    const { container } = render(<Scan />)
    const user = await escanear(container)
    await user.click(await screen.findByRole('button', { name: 'Es un ingreso' }))
    expect(await screen.findByText('Ingreso de dinero', { selector: 'h2' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('bg-ingreso-fondo')
  })
})

describe('Escáner: re-escaneo de una boleta existente', () => {
  it('siempre pide "solo gasto" a la IA y entra directo a revisar totales', async () => {
    navegacion.params = new URLSearchParams('reescanear=g1')
    respuestaAnalisis = RESPUESTA_GASTO()
    vi.mocked(db.getGastoPorId).mockResolvedValue({ ...gasto({ id: 'g1', proyecto_id: 'p1', total: 141_440, items: [item('i1')] }), imagen_url: 'https://almacen/vieja.jpg', contexto_boleta: '' } as never)
    render(<Scan />)
    expect(await screen.findByText('Gasto · revisar totales', { selector: 'h2' })).toBeInTheDocument()
    expect(cuerpoAnalisis).toMatchObject({ solo_gasto: true, proyecto_id: 'p1' })
  })

  it('un usuario que no es administrador no puede re-escanear', async () => {
    navegacion.params = new URLSearchParams('reescanear=g1')
    vi.mocked(db.getUsuarioActual).mockResolvedValue(usuario('usuario') as never)
    render(<Scan />)
    expect(await screen.findByText('Solo un administrador puede re-escanear boletas.')).toBeInTheDocument()
  })
})
