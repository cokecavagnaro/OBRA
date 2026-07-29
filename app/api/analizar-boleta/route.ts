import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildContextoAprendizaje, aplicarAprendizajeDeterministico } from '@/lib/aprendizaje'
import { debeActivarFallback, reconciliarYDeterminarInterpretacion, descripcionCanonicaCargo, type CargoImpreso, type DescuentoImpreso, type InterpretacionPrecio, type FuenteInterpretacion } from '@/lib/confianzaDocumento'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { ClasificacionAprendida, ItemAnalizado } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Haiku extrae; si el cuadre no cierra, se escala UNA vez a Sonnet (lee mejor
// números chicos y boletas arrugadas) — solo las boletas difíciles pagan el
// modelo caro.
const MODELO_EXTRACCION = 'claude-haiku-4-5-20251001'
const MODELO_ESCALADA = 'claude-sonnet-5'

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type, proyecto_id, contexto_boleta } = await req.json()

    if (!imagen_base64 || !proyecto_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clasificaciones_aprendidas')
      .select('*')
      .eq('proyecto_id', proyecto_id)
    const aprendidas = (data ?? []) as ClasificacionAprendida[]

    const contextoAprendizaje = buildContextoAprendizaje(aprendidas)

    // Principio rector del prompt: la IA solo COPIA cifras impresas — toda la
    // aritmética (aplicar descuentos, validar cuadres, derivar netos) la hace
    // el servidor de forma determinística (reconciliarYDeterminarInterpretacion).
    // Pedirle a la IA que "aplique" descuentos fue la causa del bug COPEC:
    // inventó un descuento de $5.000 no impreso y duplicó el cupón como ítem
    // negativo.
    const systemPrompt = `Eres un asistente experto en análisis de boletas y facturas de construcción en Chile.
Tu tarea es TRANSCRIBIR lo que la boleta imprime — copia cifras, no las calcules ni las corrijas. Toda la aritmética la hace el sistema después.

Para cada ítem debes devolver:
- descripcion: texto exacto del producto/servicio
- cantidad: número (usa 1 si no se especifica)
- unidad: "un", "m2", "ml", "kg", "gl", "lt", "hr" u otra unidad apropiada
- precio_unitario: precio unitario tal como aparece impreso, en pesos chilenos (sin puntos ni símbolos)
- subtotal: el monto de esa línea TAL CUAL está impreso en la boleta. Cópialo — NUNCA lo calcules tú, NUNCA le apliques descuentos. Si la línea muestra un precio original tachado y un precio final, usa el precio final impreso. Las líneas de descuento NO son ítems: van en el array "descuentos" del objeto "documento" (ver abajo), nunca acá — ni como ítem negativo ni restadas a un subtotal
- categoria: categoría del ítem (ej: "Materiales", "Herramientas", "Pinturas", "Electricidad", "Gasfitería", etc.)
- etiquetas: array de 1 a 2 etiquetas en minúsculas para agrupar el gasto.
  Reglas:
  1. Si es un MATERIAL de construcción → usa el material y su tipo/familia (ej: zinc, acanalado, madera, pino, cemento). Nunca color, dimensiones, ni grado/terminación (bruto, cepillado, pulido).
  2. Si es una HERRAMIENTA o equipo → usa ["herramienta", "<nombre específico>"] (ej: ["herramienta", "rodillo"], ["herramienta", "martillo"]).
  3. Nunca agregues palabras genéricas redundantes (lámina, plancha, tipo) si el material ya lo deja claro.

  Ejemplos:
  "ZINC ALUM ACANALADO NEGRA 0.85x3660" → ["zinc", "acanalado"]
  "PINO BRUTO 1X6" → ["madera", "pino"]
  "Rodillo lana 23cm" → ["herramienta", "rodillo"]
  "Martillo carpintero 16oz" → ["herramienta", "martillo"]
  "Pintura látex blanca 20L" → ["pintura", "látex"]
- confianza: número entre 0 y 1 indicando qué tan seguro estás del análisis

Además extrae del documento:
- proveedor: nombre del proveedor, tal como aparece impreso. Si la imagen no permite leerlo con confianza razonable (borroso, cortado, ilegible) → devuelve "" (string vacío). Nunca inventes ni "completes" un nombre parecido o plausible — un campo vacío es preferible a un dato incorrecto, porque el usuario lo puede completar a mano pero un nombre inventado puede pasar desapercibido y quedar mal registrado.
- rut: RUT del proveedor, mismo criterio que proveedor — si no se lee con confianza razonable, "" (nunca inventes dígitos).
- fecha: fecha en formato YYYY-MM-DD, mismo criterio — si no se lee con confianza razonable, "" (nunca inventes una fecha).
- moneda: "CLP" (default)
- total: el monto FINAL efectivamente pagado/a pagar, tal como figura impreso como "TOTAL" o "TOTAL A PAGAR" en la boleta. Cópialo tal cual — nunca lo calcules sumando ítems

Además, evalúa la calidad del documento completo y devuelve un objeto adicional "documento":
{
  "documento": {
    "confianza_documento": número entre 0 y 1 (confianza global en la extracción completa, no solo un ítem),
    "calidad_imagen_percibida": número entre 0 y 1 (qué tan legible percibes la imagen),
    "iva_impreso": monto de IVA (impuesto) tal como aparece IMPRESO en la boleta, en pesos chilenos (sin puntos ni símbolos) — número, o null si la boleta no imprime un monto de IVA explícito.
      Las boletas de construcción en Chile varían mucho en formato; busca cualquiera de estos patrones u otros equivalentes:
      - "IVA 19%: $XX.XXX", "I.V.A.: $XX.XXX", "IVA 19% - Impto. Incluido: $XX.XXX"
      - Boletas electrónicas SII con desglose de tres líneas: "Monto Neto" / "IVA" / "Monto Total"
      - "19% incluido: $XX.XXX", "Impuesto: $XX.XXX", "Imp. incluido $XX.XXX", "Total de Impuestos: $XX.XXX"
      Reglas estrictas:
      - Devuelve el monto EXACTO impreso. Nunca lo calcules tú mismo como 19% del neto o del total — si no ves una cifra de IVA impresa, es null.
      - Si aparece la palabra "IVA" sin monto asociado (ej. solo "Precios incluyen IVA") → null.
      - Boletas informales de ferretería sin desglose tributario → null. Es el caso normal, no un error.
    "otros_impuestos_impreso": monto total de impuestos impresos DISTINTOS del IVA — número, o null si no hay.
      Ejemplos: "MONTO IMPUESTOS COMB." (impuesto específico a los combustibles en bencineras), impuestos adicionales de bebidas/tabaco, cualquier línea de impuesto que no sea el IVA. Si hay varios, súmalos con las cifras impresas.
      Mismas reglas estrictas que iva_impreso: solo copiar cifras impresas, nunca calcular. Boletas sin estos impuestos → null (el caso normal).
    "interpretacion_precios": "neto" o "bruto" — lee la boleta buscando evidencia explícita (líneas como "Neto", "IVA 19%", "Subtotal", "Total" desglosados, o "IVA incluido"). Si los precios de los ítems NO incluyen IVA (hay que sumarles IVA para llegar al total) → "neto". Si los precios de los ítems YA incluyen IVA (son el monto final tal cual se paga) → "bruto". No lo calcules con aritmética — es una lectura de lo que la boleta dice o da a entender, no un cálculo.
    "descuentos": array con las líneas de descuento IMPRESAS en la boleta. Cada entrada:
      {
        "descripcion": texto impreso del descuento (ej. "Descuento cupón $50/lt", "10% dcto pronto pago"),
        "monto": la cifra POSITIVA del descuento tal como está impresa (ej. si la boleta imprime "-$2.461" → 2461), o null si el descuento se menciona SIN un monto impreso (ej. "2x1" sin cifra),
        "aplica_a": la descripción del ítem al que pertenece el descuento si la boleta lo deja claro (ej. la línea de descuento aparece inmediatamente bajo ese ítem, o lo menciona por nombre), o null si es un descuento general a toda la compra
      }
      Reglas estrictas:
      - NUNCA calcules un monto de descuento (ni porcentajes, ni "por litro", ni nada) — solo copia la cifra impresa. Sin cifra impresa → monto: null.
      - NUNCA pongas descuentos dentro de "items" (ni como ítem negativo ni restándolos a un subtotal).
      - Si la boleta no imprime ningún descuento → [] (array vacío). NUNCA inventes descuentos que no están impresos.
    "cargos": array con las líneas IMPRESAS que SUMAN al total y no son un producto: envío, despacho, flete, servicio, instalación, recargo. Cada entrada:
      {
        "descripcion": texto impreso del cargo (ej. "Envío a domicilio", "Despacho", "Costo de servicio"),
        "monto": la cifra impresa del cargo (número positivo), o null si se menciona sin monto impreso
      }
      Reglas estrictas:
      - Copia la cifra impresa — NUNCA la calcules ni la deduzcas de la diferencia entre el total y los productos.
      - NUNCA pongas los cargos dentro de "items": el sistema los agrega después como línea propia.
      - Si la boleta no imprime ningún cargo → [] (array vacío). El despacho gratis o no mencionado no es un cargo.
  }
}
Este objeto "documento" es adicional a proveedor, rut, fecha, moneda y total — no los reemplaces ni los anides ahí.

Responde SOLO con JSON válido, sin texto adicional.`

    const userContent: Anthropic.MessageParam['content'] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: media_type || 'image/jpeg',
          data: imagen_base64,
        },
      },
    ]

    const contextLines: string[] = []
    if (contexto_boleta) contextLines.push(`Contexto de la boleta: ${contexto_boleta}`)
    if (contextoAprendizaje) contextLines.push(contextoAprendizaje)
    contextLines.push(`Analiza la boleta y devuelve el JSON con la estructura indicada.`)
    userContent.push({ type: 'text', text: contextLines.join('\n\n') })

    const resultadoOriginal = await extraerConModelo(MODELO_EXTRACCION, systemPrompt, userContent)
    const recOriginal = procesarExtraccion(resultadoOriginal)

    const confianzaOriginal: number = resultadoOriginal.documento?.confianza_documento ?? 0

    let resultadoFinal = resultadoOriginal
    if (debeActivarFallback(confianzaOriginal, recOriginal.cruce_valido)) {
      resultadoFinal = await escalarASonnet(resultadoOriginal, recOriginal.diferencia, systemPrompt, userContent)
    } else {
      resultadoFinal.confianza_documento = confianzaOriginal
      resultadoFinal.verificado_por_reescritura = false
      resultadoFinal.requiere_atencion = false
    }

    if (Array.isArray(resultadoFinal.items)) {
      resultadoFinal.items = aplicarAprendizajeDeterministico(resultadoFinal.items, aprendidas)
    }

    return NextResponse.json(resultadoFinal)
  } catch (err) {
    console.error('[analizar-boleta]', err)
    return NextResponse.json({ error: 'Error al analizar la boleta' }, { status: 500 })
  }
}

interface ResultadoExtraccion {
  proveedor?: string
  total?: number
  items?: ItemAnalizado[]
  documento?: {
    confianza_documento?: number
    calidad_imagen_percibida?: number
    interpretacion_precios?: InterpretacionPrecio
    iva_impreso?: number | null
    otros_impuestos_impreso?: number | null
    descuentos?: DescuentoImpreso[]
    cargos?: CargoImpreso[]
  }
  confianza_documento?: number
  verificado_por_reescritura?: boolean
  requiere_atencion?: boolean
  interpretacion_precios?: InterpretacionPrecio
  iva_impreso?: number | null
  otros_impuestos?: number | null
  fuente_interpretacion?: FuenteInterpretacion
  descuento_general_monto?: number
  descuento_general_descripcion?: string | null
  [key: string]: unknown
}

async function extraerConModelo(
  modelo: string,
  systemPrompt: string,
  userContent: Anthropic.MessageParam['content']
): Promise<ResultadoExtraccion> {
  const response = await client.messages.create({
    model: modelo,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Respuesta inesperada de la IA')
  // Extraer JSON — Claude a veces lo envuelve en ```json ... ```
  const raw = textBlock.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
  return JSON.parse(raw)
}

// Aunque el prompt lo prohíbe, la IA a veces igual emite descuentos como
// ítems negativos — se rescatan hacia el array de descuentos (sin duplicar
// si ya existe uno con el mismo monto).
function normalizarItemsNegativos(resultado: ResultadoExtraccion): void {
  const items = resultado.items ?? []
  const negativos = items.filter((i) => (i.subtotal ?? 0) < 0)
  if (negativos.length === 0) return

  resultado.items = items.filter((i) => (i.subtotal ?? 0) >= 0)
  const descuentos = resultado.documento?.descuentos ?? []
  for (const n of negativos) {
    const monto = Math.abs(n.subtotal ?? 0)
    if (monto > 0 && !descuentos.some((d) => d.monto === monto)) {
      descuentos.push({ descripcion: n.descripcion || 'Descuento', monto, aplica_a: null })
    }
  }
  resultado.documento = { ...(resultado.documento ?? {}), descuentos }
}

// Convierte un cargo impreso (flete, despacho, servicio) en un ítem normal de
// la boleta. La descripción se acorta a una etiqueta canónica para que el
// aprendizaje del proyecto la reconozca en las próximas boletas — el texto
// impreso suele ser irrepetible (un caso real listaba 13 comunas de reparto).
function materializarCargo(cargo: CargoImpreso, exento: boolean): ItemAnalizado {
  const descripcion = descripcionCanonicaCargo(cargo.descripcion)
  const esDespacho = descripcion === 'Envío' || descripcion === 'Despacho' || descripcion === 'Flete'
  const esServicio = descripcion === 'Servicio' || descripcion === 'Instalación'
  const monto = cargo.monto ?? 0
  return {
    descripcion,
    cantidad: 1,
    unidad: 'un',
    precio_unitario: monto,
    subtotal: monto,
    categoria: esDespacho ? 'Despacho' : esServicio ? 'Servicios' : 'Otros',
    etiquetas: esDespacho ? ['envío'] : esServicio ? ['servicio'] : ['cargo'],
    confianza: 1,
    exento,
  }
}

// Aplica la reconciliación determinística (descuentos + escala bruto/neto)
// sobre el resultado crudo de la IA, mutándolo con los campos finales que
// consume el cliente. Devuelve la validez del cuadre para decidir escalada.
function procesarExtraccion(resultado: ResultadoExtraccion): { cruce_valido: boolean; diferencia: number } {
  normalizarItemsNegativos(resultado)

  const ivaImpreso = resultado.documento?.iva_impreso ?? null
  const otrosImpuestos = resultado.documento?.otros_impuestos_impreso ?? null
  const rec = reconciliarYDeterminarInterpretacion(
    resultado.items ?? [],
    resultado.documento?.descuentos ?? [],
    resultado.total ?? 0,
    ivaImpreso,
    otrosImpuestos,
    resultado.documento?.interpretacion_precios,
    resultado.documento?.cargos ?? []
  )

  // Los cargos confirmados por la aritmética entran como ítems propios: así el
  // flete se etiqueta y se asigna a una partida como cualquier material, en vez
  // de quedar escondido dentro del total.
  resultado.items = [...rec.items, ...rec.cargosAplicados.map((c) => materializarCargo(c, rec.cargosExentos))]
  resultado.interpretacion_precios = rec.interpretacion
  resultado.fuente_interpretacion = rec.fuente
  resultado.iva_impreso = ivaImpreso
  resultado.otros_impuestos = otrosImpuestos
  resultado.descuento_general_monto = rec.descuentoGeneralMonto || undefined
  resultado.descuento_general_descripcion = rec.descuentoGeneralMonto ? rec.descuentoGeneralDescripcion : null

  return { cruce_valido: rec.cruce_valido, diferencia: rec.diferencia }
}

// Escalada: una sola llamada a Sonnet con el mismo prompt/imagen. Si su
// cuadre cierra, gana; si ninguno cierra, gana el de menor diferencia y la
// boleta llega marcada a la compuerta de revisión de totales (que no deja
// pasar al etiquetado sin resolver o confirmar).
async function escalarASonnet(
  resultadoOriginal: ResultadoExtraccion,
  diferenciaOriginal: number,
  systemPrompt: string,
  userContent: Anthropic.MessageParam['content']
): Promise<ResultadoExtraccion> {
  try {
    const resultadoSonnet = await extraerConModelo(MODELO_ESCALADA, systemPrompt, userContent)
    const recSonnet = procesarExtraccion(resultadoSonnet)

    if (recSonnet.cruce_valido) {
      return { ...resultadoSonnet, confianza_documento: 0.9, verificado_por_reescritura: true, requiere_atencion: false }
    }

    const ganador = recSonnet.diferencia < diferenciaOriginal ? resultadoSonnet : resultadoOriginal
    return { ...ganador, confianza_documento: 0.25, verificado_por_reescritura: true, requiere_atencion: true }
  } catch (err) {
    console.error('[analizar-boleta] escalada a Sonnet falló', err)
    return { ...resultadoOriginal, confianza_documento: 0.25, verificado_por_reescritura: false, requiere_atencion: true }
  }
}
