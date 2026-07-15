import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildContextoAprendizaje, aplicarAprendizajeDeterministico } from '@/lib/aprendizaje'
import { calcularCruce, debeActivarFallback, esRazonablementeSimilar } from '@/lib/confianzaDocumento'
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
- precio_unitario: precio en pesos chilenos (sin puntos ni símbolos)
- subtotal: cantidad × precio_unitario
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
- proveedor: nombre del proveedor
- rut: RUT del proveedor
- fecha: fecha en formato YYYY-MM-DD
- moneda: "CLP" (default)
- total: monto total de la boleta

Además, evalúa la calidad del documento completo y devuelve un objeto adicional "documento":
{
  "documento": {
    "confianza_documento": número entre 0 y 1 (confianza global en la extracción completa, no solo un ítem),
    "calidad_imagen_percibida": número entre 0 y 1 (qué tan legible percibes la imagen)
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

    const confianzaOriginal: number = resultadoOriginal.documento?.confianza_documento ?? 0
    const { cruce_valido: cruceOriginalValido } = calcularCruce(resultadoOriginal.items ?? [], resultadoOriginal.total ?? 0)

    let resultadoFinal = resultadoOriginal
    if (debeActivarFallback(confianzaOriginal, cruceOriginalValido)) {
      resultadoFinal = await ejecutarFallback(resultadoOriginal, userContent, systemPrompt)
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
  documento?: { confianza_documento?: number; calidad_imagen_percibida?: number }
  confianza_documento?: number
  verificado_por_reescritura?: boolean
  requiere_atencion?: boolean
  [key: string]: unknown
}

async function ejecutarFallback(
  resultadoOriginal: ResultadoExtraccion,
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
    const { cruce_valido: cruceFallbackValido } = calcularCruce(resultadoFallback.items ?? [], resultadoFallback.total ?? 0)

    if (cruceFallbackValido) {
      const similar = esRazonablementeSimilar(
        { proveedor: resultadoOriginal.proveedor ?? '', total: resultadoOriginal.total ?? 0 },
        { proveedor: resultadoFallback.proveedor ?? '', total: resultadoFallback.total ?? 0 }
      )
      return similar
        ? { ...resultadoOriginal, confianza_documento: 0.90, verificado_por_reescritura: true, requiere_atencion: false }
        : { ...resultadoFallback, confianza_documento: 0.65, verificado_por_reescritura: true, requiere_atencion: false }
    }

    // Cruce sigue sin cuadrar — no se reintenta más. Se usa el resultado del
    // fallback como definitivo: es el intento más limpio disponible, viene
    // de una transcripción de texto independiente de la lectura original.
    return { ...resultadoFallback, confianza_documento: 0.25, verificado_por_reescritura: true, requiere_atencion: true }
  } catch (err) {
    console.error('[analizar-boleta] fallback falló', err)
    // El fallback mismo falló/no parseó — degradar sin romper la request.
    // Se mantiene la extracción ORIGINAL (no hay dato de fallback usable).
    return { ...resultadoOriginal, confianza_documento: 0.25, verificado_por_reescritura: false, requiere_atencion: true }
  }
}
