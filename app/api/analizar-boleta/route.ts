import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildContextoAprendizaje } from '@/lib/aprendizaje'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type, obra_id, contexto_boleta } = await req.json()

    if (!imagen_base64 || !obra_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const contextoAprendizaje = buildContextoAprendizaje(obra_id)

    const systemPrompt = `Eres un asistente experto en análisis de boletas y facturas de construcción en Chile.
Tu tarea es extraer todos los ítems de la boleta o factura fotografiada y clasificarlos.

Para cada ítem debes devolver:
- descripcion: texto exacto del producto/servicio
- cantidad: número (usa 1 si no se especifica)
- unidad: "un", "m2", "ml", "kg", "gl", "lt", "hr" u otra unidad apropiada
- precio_unitario: precio en pesos chilenos (sin puntos ni símbolos)
- subtotal: cantidad × precio_unitario
- categoria: categoría del ítem (ej: "Materiales", "Herramientas", "Pinturas", "Electricidad", "Gasfitería", etc.)
- etiquetas: array de etiquetas descriptivas en minúsculas (ej: ["pintura", "látex", "interior"])
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

    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[analizar-boleta]', err)
    return NextResponse.json({ error: 'Error al analizar la boleta' }, { status: 500 })
  }
}
