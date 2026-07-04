import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildContextoAprendizaje, aplicarAprendizajeDeterministico } from '@/lib/aprendizaje'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { ClasificacionAprendida } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type, obra_id, contexto_boleta } = await req.json()

    if (!imagen_base64 || !obra_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clasificaciones_aprendidas')
      .select('*')
      .eq('obra_id', obra_id)
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
    const resultado = JSON.parse(raw)

    if (Array.isArray(resultado.items)) {
      resultado.items = aplicarAprendizajeDeterministico(resultado.items, aprendidas)
    }

    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[analizar-boleta]', err)
    return NextResponse.json({ error: 'Error al analizar la boleta' }, { status: 500 })
  }
}
