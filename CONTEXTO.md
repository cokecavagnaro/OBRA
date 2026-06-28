# Obra360 — Contexto del proyecto

## Stack
- Next.js 14 App Router + TypeScript strict
- Tailwind CSS mobile-first (max-width 390px)
- Datos mock (sin Supabase aún)
- Deploy: https://obra-ruddy.vercel.app/
- Repo: git@github-personal:cokecavagnaro/OBRA.git (cuenta personal `cokecavagnaro`)

## Estado actual
Frontend 100% completo con mock data. Sin base de datos real ni API conectada.

## Pantallas construidas
| Ruta | Descripción |
|---|---|
| `/` | Inicio — lista de obras con total gastado, boletas, badge pendientes por obra |
| `/obra/[id]` | Detalle obra — galería de boletas, gastos agrupados por partida/etiqueta, exportar Excel (placeholder) |
| `/scan` | Escaneo — 3 pasos: contexto → foto → clasificación ítem a ítem |
| `/pendientes` | Ítems pendientes — filtro por obra, edición inline de etiquetas |
| `/config` | CRUD de obras, etapas, partidas, system prompts (estado local) |

## Flujo de escaneo (paso 3 rediseñado)
- Un ítem a la vez con navegación Anterior / Siguiente
- Barra de progreso por ítem (azul = actual, verde = con etiqueta, gris = sin revisar)
- IA propone etiquetas → usuario acepta, elimina o agrega nuevas
- Input con autocompletado de etiquetas ya usadas en esa obra
- Sin etiquetas → queda como pendiente
- Al guardar: llama a `agregarClasificacionConfirmada()` para retroalimentar futuros escaneos

## Sistema de aprendizaje IA
- `lib/aprendizaje.ts` — `buildContextoAprendizaje(obraId)` genera contexto con clasificaciones previas confirmadas
- Las confirmaciones se acumulan en runtime (en producción vendrán de Supabase)
- Tres capas de contexto para la IA: system_prompt → clasificaciones previas → contexto_boleta

## Archivos clave
```
app/
  page.tsx                  — Inicio
  obra/[id]/page.tsx        — Detalle obra
  scan/page.tsx             — Escaneo (rediseñado hoy)
  pendientes/page.tsx       — Pendientes
  config/page.tsx           — Configuración
  layout.tsx                — Layout + BottomNav
lib/
  types.ts                  — Todos los tipos TypeScript
  mock.ts                   — Datos mock + formatCLP
  aprendizaje.ts            — buildContextoAprendizaje
components/
  BottomNav.tsx
  SystemPromptBox.tsx
  ItemCard.tsx
```

## Variables de entorno necesarias
```
ANTHROPIC_API_KEY=sk-ant-...         # agregar en .env.local y Vercel
NEXT_PUBLIC_SUPABASE_URL=...         # cuando se conecte Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Próximos pasos
1. **API Anthropic** — construir `app/api/analizar-boleta/route.ts` con Claude Vision
   - Recibe: imagen (base64), obra_id, contexto_boleta
   - Llama a `buildContextoAprendizaje(obra_id)` para armar el prompt
   - Devuelve: array de `ItemAnalizado[]` con descripcion, cantidad, unidad, precio_unitario, subtotal, categoria, etiquetas, confianza
   - Conectar en `app/scan/page.tsx` reemplazando `handleAnalizar()` mock

2. **Supabase** — ejecutar schema SQL (ver `obra360-claude-code.md`) y reemplazar mock data

3. **Excel export** — construir `lib/exportar.ts` con `xlsx` o `exceljs`

## SSH / Git
- SSH personal: `~/.ssh/id_ed25519_personal` → Host alias `github-personal`
- Remote: `git@github-personal:cokecavagnaro/OBRA.git`
