import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildContextoAprendizaje, aplicarAprendizajeDeterministico } from '@/lib/aprendizaje'
import { calcularCruce, debeActivarFallback, esRazonablementeSimilar, aplicarDescuentoGeneral, determinarInterpretacionConIva, type InterpretacionPrecio, type FuenteInterpretacion } from '@/lib/confianzaDocumento'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { ClasificacionAprendida, ItemAnalizado } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const systemPrompt = `Eres un asistente experto en análisis de boletas y facturas de construcción en Chile.
Tu tarea es extraer todos los ítems de la boleta o factura fotografiada y clasificarlos.

Para cada ítem debes devolver:
- descripcion: texto exacto del producto/servicio
- cantidad: número (usa 1 si no se especifica)
- unidad: "un", "m2", "ml", "kg", "gl", "lt", "hr" u otra unidad apropiada
- precio_unitario: precio unitario SIN descuento, en pesos chilenos (sin puntos ni símbolos), tal como aparece impreso
- subtotal: el monto final de esa línea tal como figura en la boleta. Normalmente subtotal = cantidad × precio_unitario, EXCEPTO cuando esa línea específica tiene su propio descuento (ej. precio tachado, "2x1", rebaja puntual) — en ese caso subtotal debe ser el monto YA con el descuento aplicado (menor que cantidad × precio_unitario), y precio_unitario se mantiene sin descuento. No repartas ahí el descuento general de la boleta (ver más abajo) — eso se maneja aparte
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
- total: el monto FINAL efectivamente pagado/a pagar, tal como figura impreso como "TOTAL" o "TOTAL A PAGAR" en la boleta — si la boleta tiene un descuento general aplicado al total, este campo debe ser el monto YA con ese descuento aplicado, nunca la suma de los ítems antes de descuento

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
    "interpretacion_precios": "neto" o "bruto" — lee la boleta buscando evidencia explícita (líneas como "Neto", "IVA 19%", "Subtotal", "Total" desglosados, o "IVA incluido"). Si los precios de los ítems NO incluyen IVA (hay que sumarles IVA para llegar al total) → "neto". Si los precios de los ítems YA incluyen IVA (son el monto final tal cual se paga) → "bruto". No lo calcules con aritmética — es una lectura de lo que la boleta dice o da a entender, no un cálculo.
    "descuento_general": {
      "aplica": true o false — true SOLO si la boleta tiene un descuento aplicado al TOTAL completo (ej. una línea "Descuento", "Dcto", "Rebaja" o "%" que aparece después de sumar los ítems y antes del total final, afectando a toda la compra). false si no hay descuento, o si el único descuento que existe está contenido dentro de una línea de ítem específica (eso ya se refleja en el subtotal de ese ítem, no acá).
      "descripcion": texto breve de cómo se describe el descuento en la boleta (ej. "10% dcto pronto pago"), o null si aplica=false. No calcules el monto del descuento — solo indica si existe y cómo se describe.
    }
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

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Respuesta inesperada de la IA' }, { status: 500 })
    }

    // Extraer JSON — Claude a veces lo envuelve en ```json ... ```
    const raw = textBlock.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const resultadoOriginal = JSON.parse(raw)
    procesarDescuentoGeneral(resultadoOriginal)

    const confianzaOriginal: number = resultadoOriginal.documento?.confianza_documento ?? 0
    const sumaOriginal = (resultadoOriginal.items ?? []).reduce((s: number, i: ItemAnalizado) => s + (i.subtotal ?? 0), 0)
    const ivaImpresoOriginal = resultadoOriginal.documento?.iva_impreso ?? null
    const { interpretacion: interpretacionDecidida, fuente: fuenteDecidida } = determinarInterpretacionConIva(
      sumaOriginal,
      resultadoOriginal.total ?? 0,
      ivaImpresoOriginal,
      resultadoOriginal.documento?.interpretacion_precios
    )
    // El cruce aritmético ahora VALIDA la decisión ya tomada (¿la suma de
    // ítems cuadra con el total bajo esa interpretación?), no la reemplaza.
    const { cruce_valido: cruceOriginalValido } = calcularCruce(resultadoOriginal.items ?? [], resultadoOriginal.total ?? 0, interpretacionDecidida)

    let resultadoFinal = resultadoOriginal
    if (debeActivarFallback(confianzaOriginal, cruceOriginalValido)) {
      resultadoFinal = await ejecutarFallback(resultadoOriginal, interpretacionDecidida, fuenteDecidida, userContent, systemPrompt)
    } else {
      resultadoFinal.confianza_documento = confianzaOriginal
      resultadoFinal.verificado_por_reescritura = false
      resultadoFinal.requiere_atencion = false
      resultadoFinal.interpretacion_precios = interpretacionDecidida
      resultadoFinal.iva_impreso = ivaImpresoOriginal
      resultadoFinal.fuente_interpretacion = fuenteDecidida
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
    descuento_general?: { aplica?: boolean; descripcion?: string | null }
  }
  confianza_documento?: number
  verificado_por_reescritura?: boolean
  requiere_atencion?: boolean
  interpretacion_precios?: InterpretacionPrecio
  iva_impreso?: number | null
  fuente_interpretacion?: FuenteInterpretacion
  descuento_general_monto?: number
  descuento_general_descripcion?: string | null
  [key: string]: unknown
}

// Si la IA marcó que hay un descuento general, reparte ese descuento
// proporcionalmente entre los ítems (para que su suma vuelva a cuadrar con
// el total realmente pagado) y anota el monto/descripción en el propio
// resultado — mutando `resultado.items` in-place.
function procesarDescuentoGeneral(resultado: ResultadoExtraccion): void {
  const aplica = Boolean(resultado.documento?.descuento_general?.aplica)
  const { items, descuentoMonto } = aplicarDescuentoGeneral(resultado.items ?? [], resultado.total ?? 0, aplica)
  resultado.items = items as ItemAnalizado[]
  resultado.descuento_general_monto = descuentoMonto || undefined
  resultado.descuento_general_descripcion = descuentoMonto ? resultado.documento?.descuento_general?.descripcion ?? null : null
}

async function ejecutarFallback(
  resultadoOriginal: ResultadoExtraccion,
  interpretacionOriginal: InterpretacionPrecio,
  fuenteOriginal: FuenteInterpretacion,
  userContent: Anthropic.MessageParam['content'],
  systemPrompt: string
): Promise<ResultadoExtraccion> {
  const imagenBlock = Array.isArray(userContent)
    ? userContent.find((b) => b.type === 'image')
    : undefined

  try {
    if (!imagenBlock) throw new Error('No se encontró la imagen para el fallback')

    // 1) Transcripción cruda — misma imagen, sin interpretar
    const transcripcionResp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system:
        'Transcribe TODO el texto visible en la imagen, línea por línea, exactamente como aparece. ' +
        'No interpretes, no estructures, no corrijas ortografía, no agregues comentarios. ' +
        'Si una palabra o línea es ilegible, escribe literalmente [ilegible] en su lugar. ' +
        'Responde solo con la transcripción, sin explicaciones adicionales.',
      messages: [{ role: 'user', content: [imagenBlock] }],
    })
    const transcripcionBlock = transcripcionResp.content.find((b) => b.type === 'text')
    const transcripcion = transcripcionBlock?.type === 'text' ? transcripcionBlock.text : ''

    // 2) Reestructuración — solo texto, mismo schema de siempre
    const restructResp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Texto transcrito de la boleta (sin imagen disponible):\n\n${transcripcion}\n\nAnaliza este texto y devuelve el JSON con la estructura indicada.`,
      }],
    })
    const restructBlock = restructResp.content.find((b) => b.type === 'text')
    if (!restructBlock || restructBlock.type !== 'text') throw new Error('Respuesta inesperada en fallback')

    const rawFallback = restructBlock.text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const resultadoFallback = JSON.parse(rawFallback)
    procesarDescuentoGeneral(resultadoFallback)

    const sumaFallback = (resultadoFallback.items ?? []).reduce((s: number, i: ItemAnalizado) => s + (i.subtotal ?? 0), 0)
    const ivaImpresoFallback = resultadoFallback.documento?.iva_impreso ?? null
    const { interpretacion: interpretacionFallback, fuente: fuenteFallback } = determinarInterpretacionConIva(
      sumaFallback,
      resultadoFallback.total ?? 0,
      ivaImpresoFallback,
      resultadoFallback.documento?.interpretacion_precios
    )
    const { cruce_valido: cruceFallbackValido } = calcularCruce(resultadoFallback.items ?? [], resultadoFallback.total ?? 0, interpretacionFallback)

    if (cruceFallbackValido) {
      const similar = esRazonablementeSimilar(
        { proveedor: resultadoOriginal.proveedor ?? '', total: resultadoOriginal.total ?? 0 },
        { proveedor: resultadoFallback.proveedor ?? '', total: resultadoFallback.total ?? 0 }
      )
      if (similar) {
        return {
          ...resultadoOriginal, confianza_documento: 0.90, verificado_por_reescritura: true, requiere_atencion: false,
          interpretacion_precios: interpretacionOriginal, iva_impreso: resultadoOriginal.documento?.iva_impreso ?? null, fuente_interpretacion: fuenteOriginal,
        }
      }
      return {
        ...resultadoFallback, confianza_documento: 0.65, verificado_por_reescritura: true, requiere_atencion: false,
        interpretacion_precios: interpretacionFallback, iva_impreso: ivaImpresoFallback, fuente_interpretacion: fuenteFallback,
      }
    }

    // Cruce sigue sin cuadrar — no se reintenta más. Se usa el resultado del
    // fallback como definitivo: es el intento más limpio disponible, viene
    // de una transcripción de texto independiente de la lectura original.
    return {
      ...resultadoFallback, confianza_documento: 0.25, verificado_por_reescritura: true, requiere_atencion: true,
      interpretacion_precios: interpretacionFallback, iva_impreso: ivaImpresoFallback, fuente_interpretacion: fuenteFallback,
    }
  } catch (err) {
    console.error('[analizar-boleta] fallback falló', err)
    // El fallback mismo falló/no parseó — degradar sin romper la request.
    // Se mantiene la extracción ORIGINAL (no hay dato de fallback usable).
    return {
      ...resultadoOriginal, confianza_documento: 0.25, verificado_por_reescritura: false, requiere_atencion: true,
      interpretacion_precios: interpretacionOriginal, iva_impreso: resultadoOriginal.documento?.iva_impreso ?? null, fuente_interpretacion: fuenteOriginal,
    }
  }
}
