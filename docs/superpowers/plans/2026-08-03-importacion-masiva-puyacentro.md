# Importación masiva de boletas Puya Centro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un script de una sola vez que descarga las facturas pagadas de Santiago Leon desde el portal de Puya Centro, las parsea de forma determinística (sin IA), pide una vez la etiqueta de cada producto distinto, y las inyecta como gastos reales en un proyecto nuevo "Casa Chago Lion" de Hormigasto.

**Architecture:** Cada factura tiene una URL con `access_token` que devuelve un PDF de texto real (no escaneado) sin necesitar sesión. Un módulo puro (`lib/importacion/parsearFacturaPuya.ts`) parsea ese texto con regex + los parsers de montos que ya existen en el proyecto (`lib/montos.ts`). Una serie de scripts standalone (`scripts/importar-puyacentro/*.ts`, ejecutados con `tsx`) orquestan: descargar PDFs → parsear → deduplicar productos para preguntar etiquetas → aplicar etiquetas → insertar en Supabase con el cliente admin (`service_role`, mismo patrón que `scripts/qa/env.js`).

**Tech Stack:** TypeScript, `tsx` (runner, nuevo), `pdf-parse` (extracción de texto de PDF, nuevo), `@supabase/supabase-js` (ya en el proyecto), Vitest (tests ya existentes).

## Global Constraints

- Fuente: `https://www.puyacentro.cl/my/invoices?sortby=date`. Solo se importan documentos `FAC` con "Importe adeudado: $0". `N/C` y `BEL` quedan fuera de esta pasada.
- No se usa Claude Vision — todo el parseo es determinístico sobre el texto del PDF.
- Los ítems se guardan **sin `etapa_id` ni `partida_id`** (quedan `null`), solo con sus etiquetas.
- `interpretacion_precios: 'bruto'`, `iva_impreso` tomado directo del PDF, sin heurística de reconciliación.
- `estado_aprobacion: 'aprobado'` automático (requiere que el usuario admin tenga `rol` `'admin'` o `'super_admin'`, nunca `'usuario'` — ver `saveGasto` en `lib/supabase/db.ts:729`).
- Proyecto destino: **"Casa Chago Lion"** (se crea si no existe).
- No se modifica ninguna pantalla ni componente de la app (`app/`, `components/`) — solo se agregan `lib/importacion/*` y `scripts/importar-puyacentro/*`.
- Todo lo que toque red o base de datos real se verifica primero contra **2 facturas**, no contra las ~80, antes de escalar.

---

## Nota sobre el visor de la ficha de boleta

`components/FichaBoleta.tsx:233` usa `<img src={gasto.imagen_url}>` para mostrar la foto. Vamos a subir el **PDF** de cada factura como `imagen_url` (no una imagen), así que esa miniatura va a salir rota para estas boletas — el link de descarga sigue funcionando (el usuario puede abrir/descargar el PDF igual), pero no hay preview inline. Es una limitación conocida y aceptada: no se toca `FichaBoleta.tsx` para resolverlo (va contra la restricción de no tocar pantallas de la app), y no afecta los datos (montos, ítems, etiquetas) que sí quedan correctos y consultables normalmente.

---

### Task 1: Dependencias + capturar texto real de una factura de muestra

**Files:**
- Modify: `package.json` (agrega `tsx`, `pdf-parse`, `@types/pdf-parse` a `devDependencies`)
- Create: `scripts/importar-puyacentro/probarExtraccion.ts`
- Create: `scripts/importar-puyacentro/muestras/` (carpeta, con la primera factura de prueba dentro)

**Interfaces:**
- Produces: confirmación de qué texto exacto devuelve `pdf-parse` para una factura real de Puya Centro (necesario para escribir el parser del Task 2 contra datos reales, no contra una suposición).

- [ ] **Step 1: Instalar dependencias**

```bash
cd "/Users/jcavagnaro/Documents/Carpeta de Coke/CODE/Hormigasto"
npm install --save-dev tsx pdf-parse @types/pdf-parse
```

Expected: `package.json` gana las tres entradas en `devDependencies`, `package-lock.json` se actualiza.

- [ ] **Step 2: Descargar una factura de muestra**

Ya se confirmó que esta URL responde con un PDF vía `curl` sin sesión (factura FAC 0057242, la que usamos para explorar el formato):

```bash
mkdir -p scripts/importar-puyacentro/muestras
curl -sL -o scripts/importar-puyacentro/muestras/FAC-0057242.pdf \
  "https://www.puyacentro.cl/my/invoices/739349?access_token=10e841f2-b648-4537-8e32-fd63c7171000&report_type=pdf&download=true"
```

Expected: el archivo `scripts/importar-puyacentro/muestras/FAC-0057242.pdf` existe y pesa ~260KB.

- [ ] **Step 3: Escribir script para imprimir el texto crudo de `pdf-parse`**

```typescript
// scripts/importar-puyacentro/probarExtraccion.ts
import fs from 'fs'
import pdfParse from 'pdf-parse'

async function main() {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('Uso: tsx scripts/importar-puyacentro/probarExtraccion.ts <ruta-al-pdf>')
    process.exit(1)
  }
  const buffer = fs.readFileSync(ruta)
  const data = await pdfParse(buffer)
  console.log('--- TEXTO CRUDO ---')
  console.log(data.text)
  console.log('--- FIN ---')
}

main()
```

- [ ] **Step 4: Ejecutar y guardar el texto crudo real**

```bash
npx tsx scripts/importar-puyacentro/probarExtraccion.ts scripts/importar-puyacentro/muestras/FAC-0057242.pdf
```

Expected: imprime el texto extraído del PDF (números, ítems, totales). **Guarda ese texto tal cual (copiado del output) en un archivo `scripts/importar-puyacentro/muestras/FAC-0057242.txt`** — es el fixture real que se usa en el Task 2. Si el texto de `pdf-parse` viene en un orden distinto al que se vio antes con el lector de PDF (por ejemplo, el bloque del proveedor antes o después de los ítems, saltos de línea distintos), no pasa nada: el parser del Task 2 se escribe contra ESTE texto real, no contra la suposición previa.

```bash
npx tsx scripts/importar-puyacentro/probarExtraccion.ts scripts/importar-puyacentro/muestras/FAC-0057242.pdf > scripts/importar-puyacentro/muestras/FAC-0057242-salida.txt
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/importar-puyacentro/
git commit -m "chore: agregar tsx y pdf-parse para importación masiva de facturas"
```

---

### Task 2: Parser determinístico de facturas Puya Centro (TDD)

**Files:**
- Create: `lib/importacion/parsearFacturaPuya.ts`
- Test: `tests/unit/parsearFacturaPuya.test.ts`

**Interfaces:**
- Consumes: `parsearNumero`, `parsearMontoCLP` de `lib/montos.ts` (ya existen: `export function parsearNumero(valor: unknown): number | null`, `export function parsearMontoCLP(valor: unknown): number | null`).
- Produces:
  ```typescript
  export interface ItemFacturaPuya {
    codigo: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    subtotal: number
  }
  export interface FacturaPuya {
    numero: string
    fecha: string // ISO yyyy-mm-dd
    clienteNombre: string
    clienteRut: string
    proveedor: string
    rutProveedor: string
    items: ItemFacturaPuya[]
    totalNeto: number
    iva: number
    total: number
    importeAdeudado: number
  }
  export function canonicalizarDescripcion(descripcion: string): string
  export function parsearTextoFactura(texto: string, numeroEsperado?: string): FacturaPuya
  ```
  Estas son las firmas que usan las Tasks 4 y 5.

- [ ] **Step 1: Escribir el test contra el texto real capturado en el Task 1**

Copia el contenido de `scripts/importar-puyacentro/muestras/FAC-0057242-salida.txt` (entre las marcas `--- TEXTO CRUDO ---` y `--- FIN ---`, sin esas marcas) dentro de la constante `TEXTO_FAC_0057242` de este test. El bloque de abajo usa el texto que se obtuvo con el lector de PDF durante el diseño — **reemplázalo por el texto real de `pdf-parse` del Task 1** si difiere en saltos de línea o espacios; los valores esperados (números) no deberían cambiar.

```typescript
// tests/unit/parsearFacturaPuya.test.ts
import { describe, it, expect } from 'vitest'
import { parsearTextoFactura, canonicalizarDescripcion } from '@/lib/importacion/parsearFacturaPuya'

const TEXTO_FAC_0057242 = `Fecha: 01/08/2026
Cliente: Santiago Leon
RUT: 78051069-2
Dirección: BAJO EL AZUL 801 Navidad PUPUYA 06
3230000 Chile
Fecha de vencimiento: 01/08/2026
Condiciones de Pago: Paga después
Dirección de Entrega: Condominio La Quila
Giro: constructora
Descripción Cantidad Precio IVA Inc. Subtotal IVA Inc.
[EYFEAT-0043] ESTANQUE VERTICAL 3400 LTS | MATRIPLAST 1,00 $ 268.600 $ 268.600
[TRADES-003] DESPACHO N°3 **No incluye descarga 1,00 $ 10.000 $ 10.000
Total Neto $ 234.117
IVA 19% $ 44.483
Total $ 278.600
Pagado el 01/08/2026 $ 278.600
Importe adeudado $ 0
Timbre Electrónico SII
Resolución Nº: 80 de Fecha: 22/08/2014
Verifique documento en www.sii.cl
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 57242
San Antonio
Página: 1/1`

describe('parsearTextoFactura', () => {
  it('extrae cabecera, ítems y totales de una factura real de Puya Centro', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0057242, '57242')

    expect(factura.numero).toBe('57242')
    expect(factura.fecha).toBe('2026-08-01')
    expect(factura.clienteNombre).toBe('Santiago Leon')
    expect(factura.clienteRut).toBe('78051069-2')
    expect(factura.proveedor).toBe('COMERCIAL COSTA SUR SPA')
    expect(factura.rutProveedor).toBe('77.482.149-K')

    expect(factura.items).toHaveLength(2)
    expect(factura.items[0]).toEqual({
      codigo: 'EYFEAT-0043',
      descripcion: 'ESTANQUE VERTICAL 3400 LTS | MATRIPLAST',
      cantidad: 1,
      precio_unitario: 268600,
      subtotal: 268600,
    })
    expect(factura.items[1]).toEqual({
      codigo: 'TRADES-003',
      descripcion: 'Despacho',
      cantidad: 1,
      precio_unitario: 10000,
      subtotal: 10000,
    })

    expect(factura.totalNeto).toBe(234117)
    expect(factura.iva).toBe(44483)
    expect(factura.total).toBe(278600)
    expect(factura.importeAdeudado).toBe(0)
  })

  it('lanza error si el número esperado no coincide con el del PDF', () => {
    expect(() => parsearTextoFactura(TEXTO_FAC_0057242, '99999')).toThrow(/no coincide/)
  })

  it('lanza error si no encuentra ningún ítem', () => {
    expect(() => parsearTextoFactura('texto sin nada útil')).toThrow()
  })
})

describe('canonicalizarDescripcion', () => {
  it('quita el número de pedido de las líneas de despacho', () => {
    expect(canonicalizarDescripcion('DESPACHO N°3 **No incluye descarga')).toBe('Despacho')
    expect(canonicalizarDescripcion('DESPACHO N°15')).toBe('Despacho')
  })

  it('deja intacta la descripción de un producto normal', () => {
    expect(canonicalizarDescripcion('ESTANQUE VERTICAL 3400 LTS | MATRIPLAST')).toBe(
      'ESTANQUE VERTICAL 3400 LTS | MATRIPLAST'
    )
  })
})
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

```bash
npm run test:unit -- parsearFacturaPuya
```

Expected: FAIL — `Cannot find module '@/lib/importacion/parsearFacturaPuya'`.

- [ ] **Step 3: Implementar el parser**

```typescript
// lib/importacion/parsearFacturaPuya.ts
//
// Parser determinístico del PDF de factura de Puya Centro. No usa IA: el
// PDF trae texto real (no es una foto escaneada), así que se extrae todo
// con expresiones regulares sobre ese texto. Reusa los mismos parsers de
// montos que ya usa el resto de la app (lib/montos.ts) para no duplicar la
// lógica de separadores de miles/decimales.
import { parsearNumero, parsearMontoCLP } from '@/lib/montos'

export interface ItemFacturaPuya {
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface FacturaPuya {
  numero: string
  fecha: string
  clienteNombre: string
  clienteRut: string
  proveedor: string
  rutProveedor: string
  items: ItemFacturaPuya[]
  totalNeto: number
  iva: number
  total: number
  importeAdeudado: number
}

// Fijo: todas las facturas de esta importación vienen de la misma cuenta de
// Puya Centro / mismo emisor. Confirmado contra FAC 0057242.
const PROVEEDOR = 'COMERCIAL COSTA SUR SPA'
const RUT_PROVEEDOR = '77.482.149-K'

function fechaChileAIso(fecha: string): string {
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error(`Fecha con formato inesperado: "${fecha}"`)
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

// La línea de despacho imprime el número de pedido ("DESPACHO N°3",
// "DESPACHO N°15 **No incluye descarga"), que cambia en cada factura y
// rompería el aprendizaje de etiquetas si se guardara tal cual (cada
// despacho parecería un producto distinto). Mismo criterio que
// descripcionCanonicaCargo en lib/confianzaDocumento.ts.
export function canonicalizarDescripcion(descripcion: string): string {
  const limpio = descripcion.trim()
  if (/^DESPACHO\b/i.test(limpio)) return 'Despacho'
  return limpio
}

export function parsearTextoFactura(texto: string, numeroEsperado?: string): FacturaPuya {
  const numeroMatch = texto.match(/FACTURA ELECTRÓNICA\s*N[°º]:\s*(\d+)/)
  if (!numeroMatch) throw new Error('No se encontró el número de factura en el texto del PDF')
  const numero = numeroMatch[1]
  if (numeroEsperado && numero !== numeroEsperado) {
    throw new Error(`Número de factura no coincide: esperaba ${numeroEsperado}, el PDF dice ${numero}`)
  }

  const fechaMatch = texto.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/)
  if (!fechaMatch) throw new Error('No se encontró la fecha en el texto del PDF')

  const clienteMatch = texto.match(/Cliente:\s*(.+?)\s*RUT:/s)
  if (!clienteMatch) throw new Error('No se encontró el cliente en el texto del PDF')

  const rutMatch = texto.match(/RUT:\s*([\d.]+-[\dkK])/)
  if (!rutMatch) throw new Error('No se encontró el RUT del cliente en el texto del PDF')

  const totalesMatch = texto.match(
    /Total Neto\s*\$\s*([\d.,]+)\s*IVA\s*19%\s*\$\s*([\d.,]+)\s*Total\s*\$\s*([\d.,]+)/
  )
  if (!totalesMatch) throw new Error('No se encontraron los totales (Neto/IVA/Total) en el texto del PDF')

  const adeudadoMatch = texto.match(/Importe adeudado\s*\$\s*([\d.,-]+)/)
  if (!adeudadoMatch) throw new Error('No se encontró el importe adeudado en el texto del PDF')

  const items: ItemFacturaPuya[] = []
  const itemRegex = /\[([A-Z0-9-]+)\]\s+(.+?)\s+([\d,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)/g
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(texto)) !== null) {
    const [, codigo, descripcionCruda, cantidadTxt, precioTxt, subtotalTxt] = m
    items.push({
      codigo,
      descripcion: canonicalizarDescripcion(descripcionCruda),
      cantidad: parsearNumero(cantidadTxt) ?? 0,
      precio_unitario: parsearMontoCLP(precioTxt) ?? 0,
      subtotal: parsearMontoCLP(subtotalTxt) ?? 0,
    })
  }
  if (items.length === 0) throw new Error('No se encontró ningún ítem en el texto del PDF')

  return {
    numero,
    fecha: fechaChileAIso(fechaMatch[1]),
    clienteNombre: clienteMatch[1].trim(),
    clienteRut: rutMatch[1],
    proveedor: PROVEEDOR,
    rutProveedor: RUT_PROVEEDOR,
    items,
    totalNeto: parsearMontoCLP(totalesMatch[1]) ?? 0,
    iva: parsearMontoCLP(totalesMatch[2]) ?? 0,
    total: parsearMontoCLP(totalesMatch[3]) ?? 0,
    importeAdeudado: parsearMontoCLP(adeudadoMatch[1]) ?? 0,
  }
}
```

- [ ] **Step 4: Ejecutar los tests hasta que pasen**

```bash
npm run test:unit -- parsearFacturaPuya
```

Expected: PASS los 5 tests. Si alguna regex no matchea contra el texto real de `pdf-parse` (por ejemplo, un salto de línea distinto entre "FACTURA ELECTRÓNICA" y "Nº:"), ajusta la regex correspondiente — no relajes el test.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/importacion/parsearFacturaPuya.ts tests/unit/parsearFacturaPuya.test.ts
git commit -m "feat: parser determinístico de facturas Puya Centro"
```

---

### Task 3: Descarga masiva de PDFs a partir de un listado

**Files:**
- Create: `scripts/importar-puyacentro/facturas.json` (datos, no código — se completa a mano con lo recolectado del navegador)
- Create: `scripts/importar-puyacentro/descargarFacturas.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (es independiente del parser).
- Produces: PDFs en `scripts/importar-puyacentro/pdfs/{numero}.pdf`, que consume la Task 4.

- [ ] **Step 1: Recolectar del navegador las primeras 2 facturas**

Con la pestaña del navegador ya en `https://www.puyacentro.cl/my/invoices?sortby=date` (sesión iniciada por Jorge), leer los primeros 2 links `FAC` de la tabla (`read_page`, filtro `interactive`) y anotar `numero`, `id` y `access_token` de cada uno. Ya se tiene el primero de ejemplos anteriores:

```json
[
  { "numero": "57242", "id": "739349", "token": "10e841f2-b648-4537-8e32-fd63c7171000" },
  { "numero": "57057", "id": "737267", "token": "4af5f58c-aced-4bc3-8a6a-326c03de29c0" }
]
```

Guardar esto (con los valores reales confirmados en el navegador, no copiados a ciegas de este plan) en `scripts/importar-puyacentro/facturas.json`.

- [ ] **Step 2: Escribir el script de descarga**

```typescript
// scripts/importar-puyacentro/descargarFacturas.ts
import fs from 'fs'
import path from 'path'

interface FacturaListado {
  numero: string
  id: string
  token: string
}

const DIR_PDFS = path.join(__dirname, 'pdfs')

function construirUrlPdf(id: string, token: string): string {
  return `https://www.puyacentro.cl/my/invoices/${id}?access_token=${token}&report_type=pdf&download=true`
}

async function descargarFactura(factura: FacturaListado): Promise<void> {
  const destino = path.join(DIR_PDFS, `${factura.numero}.pdf`)
  if (fs.existsSync(destino)) {
    console.log(`  ${factura.numero}: ya existe, se salta`)
    return
  }
  const url = construirUrlPdf(factura.id, factura.token)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Factura ${factura.numero}: HTTP ${res.status} al descargar ${url}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destino, buffer)
  console.log(`  ${factura.numero}: descargada (${buffer.byteLength} bytes)`)
}

async function main() {
  const listado: FacturaListado[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'facturas.json'), 'utf-8')
  )
  fs.mkdirSync(DIR_PDFS, { recursive: true })
  console.log(`Descargando ${listado.length} facturas...`)
  for (const factura of listado) {
    await descargarFactura(factura)
  }
  console.log('Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export { construirUrlPdf }
```

- [ ] **Step 3: Test de la construcción de URL (única parte pura de este script)**

```typescript
// tests/unit/descargarFacturasPuya.test.ts
import { describe, it, expect } from 'vitest'
import { construirUrlPdf } from '../../scripts/importar-puyacentro/descargarFacturas'

describe('construirUrlPdf', () => {
  it('arma la URL de descarga directa del PDF con el access_token', () => {
    const url = construirUrlPdf('739349', '10e841f2-b648-4537-8e32-fd63c7171000')
    expect(url).toBe(
      'https://www.puyacentro.cl/my/invoices/739349?access_token=10e841f2-b648-4537-8e32-fd63c7171000&report_type=pdf&download=true'
    )
  })
})
```

- [ ] **Step 4: Ejecutar el test**

```bash
npm run test:unit -- descargarFacturasPuya
```

Expected: PASS.

- [ ] **Step 5: Ejecutar el script real contra las 2 facturas**

```bash
npx tsx scripts/importar-puyacentro/descargarFacturas.ts
```

Expected: `Descargando 2 facturas...`, cada una reporta bytes descargados, `Listo.`. Verificar que `scripts/importar-puyacentro/pdfs/57242.pdf` y `.../57057.pdf` existen.

- [ ] **Step 6: Commit**

```bash
git add scripts/importar-puyacentro/facturas.json scripts/importar-puyacentro/descargarFacturas.ts tests/unit/descargarFacturasPuya.test.ts scripts/importar-puyacentro/.gitignore
git commit -m "feat: script de descarga masiva de PDFs de Puya Centro"
```

Nota: antes de este commit, crear `scripts/importar-puyacentro/.gitignore` con el contenido `pdfs/` y `muestras/*.pdf` — los PDFs descargados (información real de facturación de un cliente) no deben quedar versionados en el repo.

---

### Task 4: Parsear todas las facturas descargadas y armar la lista de productos únicos

**Files:**
- Create: `scripts/importar-puyacentro/parsearTodas.ts`

**Interfaces:**
- Consumes: `parsearTextoFactura` de `lib/importacion/parsearFacturaPuya.ts` (Task 2); PDFs de `scripts/importar-puyacentro/pdfs/` (Task 3).
- Produces: `scripts/importar-puyacentro/facturas-parseadas.json` (array de `FacturaPuya`) y `scripts/importar-puyacentro/productos-unicos.json` (`{ codigo, descripcion, apariciones }[]`), que consumen las Tasks 5 y 6.

- [ ] **Step 1: Escribir el script**

```typescript
// scripts/importar-puyacentro/parsearTodas.ts
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import { parsearTextoFactura, FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

const DIR_PDFS = path.join(__dirname, 'pdfs')

interface ProductoUnico {
  codigo: string
  descripcion: string
  apariciones: number
}

function agruparProductosUnicos(facturas: FacturaPuya[]): ProductoUnico[] {
  const porCodigo = new Map<string, ProductoUnico>()
  for (const factura of facturas) {
    for (const item of factura.items) {
      const existente = porCodigo.get(item.codigo)
      if (existente) {
        existente.apariciones += 1
      } else {
        porCodigo.set(item.codigo, { codigo: item.codigo, descripcion: item.descripcion, apariciones: 1 })
      }
    }
  }
  return Array.from(porCodigo.values()).sort((a, b) => b.apariciones - a.apariciones)
}

async function main() {
  const archivos = fs.readdirSync(DIR_PDFS).filter((f) => f.endsWith('.pdf'))
  const facturas: FacturaPuya[] = []

  for (const archivo of archivos) {
    const numero = archivo.replace(/\.pdf$/, '')
    const buffer = fs.readFileSync(path.join(DIR_PDFS, archivo))
    const { text } = await pdfParse(buffer)
    try {
      const factura = parsearTextoFactura(text, numero)
      facturas.push(factura)
      console.log(`  ${numero}: OK — ${factura.items.length} ítems, total $${factura.total}`)
    } catch (err) {
      console.error(`  ${numero}: ERROR — ${(err as Error).message}`)
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'facturas-parseadas.json'),
    JSON.stringify(facturas, null, 2)
  )

  const productos = agruparProductosUnicos(facturas)
  fs.writeFileSync(
    path.join(__dirname, 'productos-unicos.json'),
    JSON.stringify(productos, null, 2)
  )

  console.log(`\n${facturas.length} facturas parseadas, ${productos.length} productos únicos:\n`)
  for (const p of productos) {
    console.log(`  [${p.codigo}] ${p.descripcion}  (${p.apariciones}x)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export { agruparProductosUnicos }
```

- [ ] **Step 2: Test de la agrupación (única parte pura de este script)**

```typescript
// tests/unit/parsearTodasPuya.test.ts
import { describe, it, expect } from 'vitest'
import { agruparProductosUnicos } from '../../scripts/importar-puyacentro/parsearTodas'
import type { FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

function facturaDeEjemplo(overrides: Partial<FacturaPuya> = {}): FacturaPuya {
  return {
    numero: '1',
    fecha: '2026-01-01',
    clienteNombre: 'Santiago Leon',
    clienteRut: '78051069-2',
    proveedor: 'COMERCIAL COSTA SUR SPA',
    rutProveedor: '77.482.149-K',
    items: [],
    totalNeto: 0,
    iva: 0,
    total: 0,
    importeAdeudado: 0,
    ...overrides,
  }
}

describe('agruparProductosUnicos', () => {
  it('cuenta cuántas veces aparece cada código de producto entre varias facturas', () => {
    const facturas: FacturaPuya[] = [
      facturaDeEjemplo({
        numero: '1',
        items: [
          { codigo: 'EYFEAT-0043', descripcion: 'Estanque', cantidad: 1, precio_unitario: 100, subtotal: 100 },
          { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10, subtotal: 10 },
        ],
      }),
      facturaDeEjemplo({
        numero: '2',
        items: [
          { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10, subtotal: 10 },
        ],
      }),
    ]

    const productos = agruparProductosUnicos(facturas)

    expect(productos).toEqual([
      { codigo: 'TRADES-003', descripcion: 'Despacho', apariciones: 2 },
      { codigo: 'EYFEAT-0043', descripcion: 'Estanque', apariciones: 1 },
    ])
  })
})
```

- [ ] **Step 3: Ejecutar el test**

```bash
npm run test:unit -- parsearTodasPuya
```

Expected: PASS.

- [ ] **Step 4: Ejecutar contra las 2 facturas ya descargadas**

```bash
npx tsx scripts/importar-puyacentro/parsearTodas.ts
```

Expected: reporta las 2 facturas parseadas OK con sus totales, y la lista de productos únicos (probablemente 3-4: el producto de cada factura + "Despacho" si se repite). **Revisar a mano** que los totales y montos impresos por consola coinciden con lo que se ve al abrir esas 2 facturas en `https://puyacentro.cl/my/invoices` — esta es la verificación manual que pide la spec antes de escalar.

- [ ] **Step 5: Commit**

```bash
git add scripts/importar-puyacentro/parsearTodas.ts tests/unit/parsearTodasPuya.test.ts
git commit -m "feat: parsear facturas descargadas y agrupar productos únicos"
```

(`facturas-parseadas.json` y `productos-unicos.json` quedan afuera del commit — son datos generados, agregar `*.json` con excepción de `facturas.json` al `.gitignore` de la carpeta, o listarlos explícitamente sin trackear.)

---

### Task 5: Aplicar etiquetas aprendidas

**Files:**
- Create: `lib/importacion/aplicarEtiquetas.ts`
- Test: `tests/unit/aplicarEtiquetas.test.ts`
- Create: `scripts/importar-puyacentro/etiquetas.json` (datos — se completa a mano con las respuestas de Jorge)

**Interfaces:**
- Consumes: `FacturaPuya`/`ItemFacturaPuya` de `lib/importacion/parsearFacturaPuya.ts`; `productos-unicos.json` de la Task 4.
- Produces:
  ```typescript
  export interface ItemConEtiquetas extends ItemFacturaPuya {
    categoria: string
    etiquetas: string[]
  }
  export interface FacturaConEtiquetas extends Omit<FacturaPuya, 'items'> {
    items: ItemConEtiquetas[]
  }
  export function aplicarEtiquetas(
    facturas: FacturaPuya[],
    mapa: Record<string, { categoria: string; etiquetas: string[] }>
  ): FacturaConEtiquetas[]
  ```
  Que consume la Task 6.

- [ ] **Step 1: Mostrarle a Jorge la lista de productos únicos y pedir las etiquetas**

Leer `scripts/importar-puyacentro/productos-unicos.json` (generado en la Task 4 contra las 2 facturas) y preguntarle a Jorge, en la conversación, la etiqueta de cada producto de la lista — una sola vez por código. La categoría (Materiales/Despacho/Herramientas/etc.) se infiere sin preguntar.

- [ ] **Step 2: Guardar las respuestas**

Con las respuestas de Jorge, escribir `scripts/importar-puyacentro/etiquetas.json`, por ejemplo:

```json
{
  "EYFEAT-0043": { "categoria": "Materiales", "etiquetas": ["estanque", "agua"] },
  "TRADES-003": { "categoria": "Despacho", "etiquetas": ["despacho"] }
}
```

- [ ] **Step 3: Escribir el test de `aplicarEtiquetas`**

```typescript
// tests/unit/aplicarEtiquetas.test.ts
import { describe, it, expect } from 'vitest'
import { aplicarEtiquetas } from '@/lib/importacion/aplicarEtiquetas'
import type { FacturaPuya } from '@/lib/importacion/parsearFacturaPuya'

function facturaDeEjemplo(): FacturaPuya {
  return {
    numero: '57242',
    fecha: '2026-08-01',
    clienteNombre: 'Santiago Leon',
    clienteRut: '78051069-2',
    proveedor: 'COMERCIAL COSTA SUR SPA',
    rutProveedor: '77.482.149-K',
    items: [
      { codigo: 'EYFEAT-0043', descripcion: 'Estanque', cantidad: 1, precio_unitario: 268600, subtotal: 268600 },
      { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10000, subtotal: 10000 },
    ],
    totalNeto: 234117,
    iva: 44483,
    total: 278600,
    importeAdeudado: 0,
  }
}

describe('aplicarEtiquetas', () => {
  it('agrega categoría y etiquetas a cada ítem según su código de producto', () => {
    const mapa = {
      'EYFEAT-0043': { categoria: 'Materiales', etiquetas: ['estanque', 'agua'] },
      'TRADES-003': { categoria: 'Despacho', etiquetas: ['despacho'] },
    }

    const [factura] = aplicarEtiquetas([facturaDeEjemplo()], mapa)

    expect(factura.items[0]).toMatchObject({ codigo: 'EYFEAT-0043', categoria: 'Materiales', etiquetas: ['estanque', 'agua'] })
    expect(factura.items[1]).toMatchObject({ codigo: 'TRADES-003', categoria: 'Despacho', etiquetas: ['despacho'] })
  })

  it('lanza error si un código de producto no tiene etiqueta asignada', () => {
    const mapa = { 'EYFEAT-0043': { categoria: 'Materiales', etiquetas: ['estanque'] } }
    expect(() => aplicarEtiquetas([facturaDeEjemplo()], mapa)).toThrow(/TRADES-003/)
  })
})
```

- [ ] **Step 4: Ejecutar y verificar que falla**

```bash
npm run test:unit -- aplicarEtiquetas
```

Expected: FAIL — módulo no existe.

- [ ] **Step 5: Implementar**

```typescript
// lib/importacion/aplicarEtiquetas.ts
import type { FacturaPuya, ItemFacturaPuya } from './parsearFacturaPuya'

export interface ItemConEtiquetas extends ItemFacturaPuya {
  categoria: string
  etiquetas: string[]
}

export interface FacturaConEtiquetas extends Omit<FacturaPuya, 'items'> {
  items: ItemConEtiquetas[]
}

// Falla fuerte (no asigna un default silencioso) si aparece un código de
// producto sin etiqueta: mejor frenar la importación que guardar un ítem
// sin clasificar por un olvido en etiquetas.json.
export function aplicarEtiquetas(
  facturas: FacturaPuya[],
  mapa: Record<string, { categoria: string; etiquetas: string[] }>
): FacturaConEtiquetas[] {
  return facturas.map((factura) => ({
    ...factura,
    items: factura.items.map((item) => {
      const clasificacion = mapa[item.codigo]
      if (!clasificacion) {
        throw new Error(`Sin etiqueta asignada para el código de producto ${item.codigo} (factura ${factura.numero})`)
      }
      return { ...item, categoria: clasificacion.categoria, etiquetas: clasificacion.etiquetas }
    }),
  }))
}
```

- [ ] **Step 6: Ejecutar y verificar que pasa**

```bash
npm run test:unit -- aplicarEtiquetas
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/importacion/aplicarEtiquetas.ts tests/unit/aplicarEtiquetas.test.ts
git commit -m "feat: aplicar etiquetas aprendidas a los ítems parseados"
```

(`etiquetas.json` no se commitea todavía — crece en cada Task 8 con los productos nuevos que aparezcan al escalar a las 80 facturas.)

---

### Task 6: Inyección a la base de datos

**Files:**
- Create: `scripts/importar-puyacentro/inyectarDb.ts`

**Interfaces:**
- Consumes: `createAdminClient` de `scripts/qa/env.js`; `FacturaConEtiquetas` de la Task 5; `aplicarEtiquetas` de la Task 5; `facturas-parseadas.json` de la Task 4; `etiquetas.json` de la Task 5.
- Produces: filas reales en `proyectos`, `gastos`, `items_gasto` de Supabase (mismo proyecto que usa la app en producción).

- [ ] **Step 1: Escribir el script**

```typescript
// scripts/importar-puyacentro/inyectarDb.ts
import fs from 'fs'
import path from 'path'
import { createAdminClient } from '../qa/env'
import { aplicarEtiquetas, FacturaConEtiquetas } from '../../lib/importacion/aplicarEtiquetas'
import type { FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

const NOMBRE_PROYECTO = 'Casa Chago Lion'
const EMAIL_ADMIN = 'jcavagnaro@planok.com'

async function obtenerOCrearProyecto(supabase: ReturnType<typeof createAdminClient>, cuentaId: string, userId: string): Promise<string> {
  const { data: existente } = await supabase
    .from('proyectos')
    .select('id')
    .eq('nombre', NOMBRE_PROYECTO)
    .maybeSingle()
  if (existente) return existente.id

  const { data: creado, error } = await supabase
    .from('proyectos')
    .insert({ nombre: NOMBRE_PROYECTO, system_prompt: '', user_id: userId, cuenta_id: cuentaId, presupuesto: null })
    .select('id')
    .single()
  if (error || !creado) throw new Error(`No se pudo crear el proyecto: ${error?.message}`)
  console.log(`Proyecto creado: ${NOMBRE_PROYECTO} (${creado.id})`)
  return creado.id
}

async function subirPdf(supabase: ReturnType<typeof createAdminClient>, cuentaId: string, proyectoId: string, numero: string, rutaPdf: string): Promise<string> {
  const buffer = fs.readFileSync(rutaPdf)
  const path_ = `${cuentaId}/${proyectoId}/factura-puya-${numero}.pdf`
  const { error } = await supabase.storage.from('boletas').upload(path_, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`No se pudo subir el PDF de la factura ${numero}: ${error.message}`)
  const { data } = supabase.storage.from('boletas').getPublicUrl(path_)
  return data.publicUrl
}

async function yaExiste(supabase: ReturnType<typeof createAdminClient>, proyectoId: string, numero: string): Promise<boolean> {
  const { data } = await supabase
    .from('gastos')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('contexto_boleta', `Importado de Puya Centro - Factura N° ${numero}`)
    .maybeSingle()
  return !!data
}

async function insertarGasto(
  supabase: ReturnType<typeof createAdminClient>,
  proyectoId: string,
  solicitanteId: string,
  factura: FacturaConEtiquetas,
  imagenUrl: string
): Promise<void> {
  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      proyecto_id: proyectoId,
      proveedor: factura.proveedor,
      rut_proveedor: factura.rutProveedor,
      fecha_boleta: factura.fecha,
      total: factura.total,
      imagen_url: imagenUrl,
      contexto_boleta: `Importado de Puya Centro - Factura N° ${factura.numero}`,
      creado_por_email: EMAIL_ADMIN,
      comentario: null,
      interpretacion_precios: 'bruto',
      iva_impreso: factura.iva,
      otros_impuestos: null,
      fuente_interpretacion: 'iva_impreso',
      descuento_general_monto: null,
      descuento_general_descripcion: null,
      estado: 'pendiente',
      estado_aprobacion: 'aprobado',
      solicitante_id: solicitanteId,
      fecha_solicitud: null,
    })
    .select('id')
    .single()
  if (error || !gasto) throw new Error(`No se pudo insertar el gasto de la factura ${factura.numero}: ${error?.message}`)

  const { error: errorItems } = await supabase.from('items_gasto').insert(
    factura.items.map((item) => ({
      gasto_id: gasto.id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: 'un',
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      categoria: item.categoria,
      etiquetas: item.etiquetas,
      confianza_ia: 1,
      etapa_id: null,
      partida_id: null,
      estado: 'pendiente',
      descuento_monto: null,
      descuento_descripcion: null,
      exento: false,
    }))
  )
  if (errorItems) throw new Error(`No se pudieron insertar los ítems de la factura ${factura.numero}: ${errorItems.message}`)

  console.log(`  ${factura.numero}: gasto ${gasto.id} — ${factura.items.length} ítems — $${factura.total}`)
}

async function main() {
  const supabase = createAdminClient()

  const { data: admin, error: errorAdmin } = await supabase
    .from('usuarios')
    .select('id, cuenta_id, rol')
    .eq('email', EMAIL_ADMIN)
    .single()
  if (errorAdmin || !admin) throw new Error(`No se encontró el usuario admin ${EMAIL_ADMIN}: ${errorAdmin?.message}`)
  if (admin.rol === 'usuario') {
    throw new Error(`El usuario ${EMAIL_ADMIN} tiene rol 'usuario' — las boletas quedarían pendientes de aprobación en vez de aprobadas automáticamente. Se esperaba 'admin' o 'super_admin'.`)
  }

  const proyectoId = await obtenerOCrearProyecto(supabase, admin.cuenta_id, admin.id)

  const facturas: FacturaPuya[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'facturas-parseadas.json'), 'utf-8')
  )
  const etiquetas = JSON.parse(fs.readFileSync(path.join(__dirname, 'etiquetas.json'), 'utf-8'))
  const facturasConEtiquetas = aplicarEtiquetas(facturas, etiquetas)

  console.log(`Insertando ${facturasConEtiquetas.length} facturas en el proyecto "${NOMBRE_PROYECTO}"...`)
  for (const factura of facturasConEtiquetas) {
    if (await yaExiste(supabase, proyectoId, factura.numero)) {
      console.log(`  ${factura.numero}: ya estaba importada, se salta`)
      continue
    }
    const rutaPdf = path.join(__dirname, 'pdfs', `${factura.numero}.pdf`)
    const imagenUrl = await subirPdf(supabase, admin.cuenta_id, proyectoId, factura.numero, rutaPdf)
    await insertarGasto(supabase, proyectoId, admin.id, factura, imagenUrl)
  }
  console.log('Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Verificar que el usuario admin tiene el rol correcto antes de correr nada**

```bash
node -e "
const { createAdminClient } = require('./scripts/qa/env.js');
createAdminClient().from('usuarios').select('id, email, rol, cuenta_id').eq('email', 'jcavagnaro@planok.com').single()
  .then(({ data, error }) => console.log(error || data));
"
```

Expected: imprime un objeto con `rol: 'admin'` o `rol: 'super_admin'` (nunca `'usuario'`). Si el rol es distinto o no aparece el usuario, avisar antes de seguir — el script del Step 1 ya lo valida y frena solo, pero es mejor confirmarlo primero.

- [ ] **Step 3: Ejecutar contra las 2 facturas de prueba**

```bash
npx tsx scripts/importar-puyacentro/inyectarDb.ts
```

Expected: `Proyecto creado: Casa Chago Lion (<uuid>)`, luego una línea por factura con su `gasto <uuid>`, ítems y total, y `Listo.`. Si algo falla, el mensaje de error indica exactamente qué factura y por qué.

- [ ] **Step 4: Verificar en el navegador**

Abrir la app Hormigasto (`localhost:3001` con el dev server ya corriendo), entrar al proyecto "Casa Chago Lion", y confirmar:
- Aparecen las 2 boletas, con proveedor "COMERCIAL COSTA SUR SPA" y los totales correctos ($278.600 y el de la segunda factura).
- Cada ítem tiene sus etiquetas (las que dio Jorge en la Task 5), y **ningún ítem tiene etapa ni partida asignada**.
- El estado de aprobación es "Aprobada" en ambas, sin haber pasado por el flujo manual de aprobación.
- El neto/IVA mostrado coincide con lo impreso en el PDF original.

- [ ] **Step 5: Correr de nuevo para confirmar que es idempotente**

```bash
npx tsx scripts/importar-puyacentro/inyectarDb.ts
```

Expected: ambas facturas reportan "ya estaba importada, se salta" — no se duplican los gastos.

- [ ] **Step 6: Commit**

```bash
git add scripts/importar-puyacentro/inyectarDb.ts
git commit -m "feat: inyección de facturas parseadas a la base de datos de Hormigasto"
```

---

### Task 7: Escalar a las ~80 facturas completas

Solo después de que Jorge confirme en el navegador que las 2 facturas de prueba (Task 6, Step 4) quedaron bien.

**Files:** ninguno nuevo — se reejecutan los scripts de las Tasks 3, 4, 5 y 6 con el listado completo.

- [ ] **Step 1: Recolectar el listado completo de facturas `FAC` pagadas**

Recorrer las 2 páginas de `https://www.puyacentro.cl/my/invoices?sortby=date` en el navegador (`read_page`, filtro `interactive`, páginas 1 y 2), filtrar solo las filas `FAC` (excluir `N/C` y `BEL`), y completar `scripts/importar-puyacentro/facturas.json` con las ~80 entradas `{ numero, id, token }`.

- [ ] **Step 2: Descargar todos los PDFs nuevos**

```bash
npx tsx scripts/importar-puyacentro/descargarFacturas.ts
```

Expected: las 2 ya descargadas se saltan ("ya existe"), se descargan las ~78 restantes.

- [ ] **Step 3: Parsear todas y regenerar la lista de productos únicos**

```bash
npx tsx scripts/importar-puyacentro/parsearTodas.ts
```

Expected: reporta las ~80 facturas parseadas (revisar la consola por líneas "ERROR" — si alguna factura no parsea, investigar esa antes de seguir en vez de ignorarla). La lista de productos únicos ahora va a tener más códigos que los 2-3 ya etiquetados.

- [ ] **Step 4: Etiquetar los productos nuevos**

Comparar `productos-unicos.json` contra las claves ya presentes en `scripts/importar-puyacentro/etiquetas.json` (Task 5) y preguntarle a Jorge la etiqueta **solo de los códigos nuevos** que no estén ya en el archivo — los ya etiquetados no se vuelven a preguntar. Completar `etiquetas.json` con las respuestas.

- [ ] **Step 5: Inyectar el resto**

```bash
npx tsx scripts/importar-puyacentro/inyectarDb.ts
```

Expected: las 2 primeras se saltan ("ya estaba importada"), se insertan las ~78 restantes.

- [ ] **Step 6: Verificación final**

En el navegador, en `/proyecto/<id>` de "Casa Chago Lion": confirmar que el total del proyecto coincide con la suma de los "Total" de las ~80 facturas `FAC` procesadas, que la cantidad de boletas listadas es la esperada, y que no quedó ningún ítem con etapa/partida asignada por error.

```bash
node -e "
const fs = require('fs');
const facturas = JSON.parse(fs.readFileSync('scripts/importar-puyacentro/facturas-parseadas.json', 'utf-8'));
const suma = facturas.reduce((s, f) => s + f.total, 0);
console.log('Facturas:', facturas.length, '— Suma total:', suma);
"
```

Comparar ese número contra el total que muestra la app para el proyecto.

- [ ] **Step 7: Commit final (solo datos de configuración, no PDFs ni JSON generados)**

```bash
git add scripts/importar-puyacentro/etiquetas.json
git commit -m "chore: etiquetas completas de la importación de Puya Centro"
```

---

## Self-Review

- **Cobertura del spec:** fuente de datos y acceso vía token (Task 3), parseo determinístico sin IA (Task 2), canonicalización de despacho por código de producto (Task 2), aprendizaje de etiquetas una vez por producto reutilizando el mismo mecanismo que la app (Task 5 — nota: se guarda en `etiquetas.json` en vez de escribir directo en `clasificaciones_aprendidas`; si Jorge quiere que además quede en esa tabla para beneficiar futuros escaneos en la app, es un paso adicional simple de agregar a la Task 6 una vez validado — señalarlo al terminar la Task 6), escritura en base de datos con proyecto nuevo, sin etapa/partida, aprobación automática (Task 6), exclusión de N/C y BEL (Task 7, Step 1), validación con 2 facturas antes de escalar (Tasks 1-6 vs. Task 7).
- **Placeholders:** ninguno — todo el código de cada step está completo.
- **Consistencia de tipos:** `FacturaPuya`/`ItemFacturaPuya` (Task 2) → consumidos sin cambios por `agruparProductosUnicos` (Task 4) y `aplicarEtiquetas`/`FacturaConEtiquetas` (Task 5) → consumidos sin cambios por `inyectarDb.ts` (Task 6). Nombres de campos verificados contra el schema real usado por `saveGasto` en `lib/supabase/db.ts`.
