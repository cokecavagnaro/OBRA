# Importación masiva de boletas Puya Centro → proyecto "Casa Chago Lion"

## Contexto

Un usuario de Hormigasto (Santiago Leon) le pasó a Jorge muchas facturas de compras de materiales para su proyecto. Esas facturas viven en el portal de clientes de Puya Centro (`puyacentro.cl/my/invoices`), una ferretería con la que Santiago tiene cuenta. En vez de fotografiar ~80 facturas una por una en el flujo normal de escaneo de la app, se decidió construir una herramienta puntual (un script que corre Jorge junto con Claude Code) que:

1. Extrae la información directamente del portal (son documentos digitales, no fotos).
2. Pregunta la etiqueta de cada producto distinto una sola vez (reutilizando el mecanismo de aprendizaje que ya existe en la app).
3. Inyecta las boletas resultantes directo a la base de datos de Hormigasto como gastos reales, en un proyecto nuevo.

No es una funcionalidad de la app — es una herramienta de una sola vez, fuera de la UI, que se apoya en las mismas tablas y en el mismo mecanismo de aprendizaje (`clasificaciones_aprendidas`) que ya usa el flujo normal de escaneo, de modo que el trabajo de etiquetado hecho acá también beneficia futuros escaneos de este proyecto dentro de la app.

## Fuente de datos

- Portal: `https://www.puyacentro.cl/my/invoices?sortby=date` (Odoo). Requiere sesión iniciada por el usuario humano (Jorge) en el navegador — Claude no puede ni debe escribir la contraseña.
- El listado de facturas (2 páginas, ordenado por fecha) mezcla tres tipos de documento: `FAC` (factura), `N/C` (nota de crédito, devoluciones/ajustes) y `BEL` (boleta). Se cuentan ~80 `FAC` con "Importe adeudado: $0" (pagadas), entre marzo 2025 y agosto 2026.
- **Alcance de esta importación: solo las `FAC` pagadas.** Las `N/C` y la `BEL` quedan fuera — no se resuelven en esta pasada. Consecuencia aceptada: el gasto total del proyecto puede quedar levemente sobreestimado en los montos que después fueron devueltos/ajustados por una N/C (la mayor observada es de $59.000).
- Cada fila del listado, al leerla en el navegador (`read_page`), expone un link con la forma `/my/invoices/{id}?access_token={token}`. Agregándole `&report_type=pdf&download=true` a esa misma URL se obtiene el PDF de la factura. **Se confirmó que esa URL responde vía `curl` sin cookies de sesión** (el token basta), así que la descarga masiva de PDFs no necesita pasar por el navegador factura por factura — solo se usa el navegador para juntar la lista de (número, id, token) recorriendo las páginas del listado.

## Parseo — determinístico, sin IA

Cada PDF de Puya Centro tiene **texto real** (no es una foto escaneada), con esta estructura estable (se verificó contra FAC 0057242):

```
Cliente / RUT / Dirección / Fecha / Fecha de vencimiento / Dirección de Entrega / Giro
Descripción                                    Cantidad   Precio IVA Inc.   Subtotal IVA Inc.
[CODIGO] Nombre del producto                   1,00       $ 268.600         $ 268.600
[CODIGO] DESPACHO N°3 **No incluye descarga    1,00       $ 10.000          $ 10.000
Total Neto  $ 234.117
IVA 19%     $ 44.483
Total       $ 278.600
Pagado el ...  $ 278.600
Importe adeudado  $ 0
FACTURA ELECTRÓNICA N°: 57242
Proveedor: COMERCIAL COSTA SUR SPA, RUT 77.482.149-K, ...
```

No se usa Claude Vision para esto: un script en Node/TypeScript descarga cada PDF y extrae su texto con una librería de extracción (`pdf-parse`), luego parsea los campos con expresiones regulares sobre ese texto — mismo principio ya establecido en el proyecto ("la IA transcribe, el servidor calcula"), llevado un paso más allá: acá ni siquiera hace falta que algo transcriba, el documento ya es texto estructurado.

Campos a extraer por factura: número de documento, fecha, cliente, RUT cliente, proveedor + RUT proveedor, y por cada línea: código de producto, descripción, cantidad, precio unitario (IVA incluido), subtotal (IVA incluido); y a nivel de documento: Total Neto, IVA, Total, importe adeudado (debe ser 0).

**Detalle importante — ítems de despacho:** la descripción de la línea de despacho incluye el número de pedido ("DESPACHO N°3", "DESPACHO N°5", ...), que cambia en cada factura. Usar esa descripción tal cual como llave de aprendizaje rompería el "pregúntame una vez, reutiliza siempre", porque cada despacho parecería un producto distinto. Se resuelve así:
- La llave de agrupación/aprendizaje para cada ítem es su **código de producto** (lo que viene entre corchetes, ej. `EYFEAT-0043`, `TRADES-003`), no la descripción libre.
- Al guardar el ítem en la base, la descripción de líneas de despacho se canonicaliza quitando el número de pedido (ej. "DESPACHO N°3" → "Despacho"), con el mismo criterio que ya usa `descripcionCanonicaCargo` en `lib/confianzaDocumento.ts` para boletas fotografiadas.

## Aprendizaje de etiquetas (una vez por producto)

1. El script parsea las ~80 facturas primero, completo, sin interacción.
2. Agrupa todos los ítems de todas las facturas por código de producto único (se espera del orden de 20-40 productos distintos, dado el volumen).
3. Le muestra a Jorge, en una sola lista, cada producto único con su descripción y cuántas veces aparece en el conjunto completo.
4. Jorge responde, en la misma conversación, la etiqueta (o etiquetas) de cada producto de la lista, una sola vez.
5. El script guarda cada respuesta en la tabla existente `clasificaciones_aprendidas` (`proyecto_id` + `descripcion_normalizada` → `categoria` + `etiquetas`), usando el código de producto (no la descripción completa) como base de la clave normalizada para los casos como el despacho.
6. La categoría (Materiales/Herramientas/Despacho/Servicios/etc.) la infiere el propio script/Claude a partir de la descripción del producto — no se le pregunta a Jorge por esto, solo por la etiqueta.
7. Como la tabla `clasificaciones_aprendidas` es la misma que usa el flujo normal de escaneo de la app (`lib/aprendizaje.ts`), este trabajo de etiquetado también queda disponible para futuros escaneos fotografiados de este mismo proyecto.

## Escritura en base de datos

- Se crea un proyecto nuevo: **"Casa Chago Lion"** (sin presupuesto inicial).
- Cada factura `FAC` se guarda como un gasto (`gastos` + `items_gasto`), reutilizando `saveGasto` de `lib/supabase/db.ts` o el mismo patrón de inserción directa con service_role (como ya hace `scripts/qa/env.js`).
- Cada ítem se guarda **sin `etapa_id` ni `partida_id`** (quedan `null`/vacíos, igual que cuando hoy un ítem no se clasifica en el flujo normal) — solo con sus etiquetas aprendidas.
- `interpretacion_precios: 'bruto'` e `iva_impreso` se completan directo con lo impreso en el PDF — no se corre ninguna heurística de reconciliación/cuadre (no hace falta: el documento ya trae el Neto y el IVA calculados por el sistema de Puya Centro, sin ambigüedad de lectura que resolver).
- `estado_aprobacion: 'aprobado'` automáticamente (son documentos tributarios reales y pagados, no fotos que requieran el visto bueno manual pensado para desconfiar de una lectura dudosa).
- `solicitante_id` / atribución: el usuario admin de Jorge en Hormigasto.
- `imagen_url`: se sube el PDF descargado (mismo bucket/mecanismo que ya usa la app para las fotos de boleta) para que la boleta sea revisable desde la ficha, igual que cualquier otra.

## Qué NO se hace en esta pasada

- No se importan `N/C` ni la `BEL` suelta.
- No se asigna etapa ni partida a ningún ítem.
- No se corre Claude Vision — todo el parseo es determinístico sobre el texto del PDF.
- No se modifica ninguna pantalla ni componente de la app — es un script aparte, no una funcionalidad nueva de Hormigasto.

## Verificación

- Correr el script contra un subconjunto chico primero (2-3 facturas) y revisar a mano en el navegador (`/proyecto/<id>` en Hormigasto) que los montos, el IVA y las etiquetas quedaron correctos antes de correrlo contra las ~80 completas.
- Confirmar que la suma de los gastos importados coincide con la suma de los "Total" de las facturas procesadas.
- Revisar en la app que el proyecto "Casa Chago Lion" muestra las boletas, que los ítems tienen sus etiquetas, y que ningún ítem quedó con etapa/partida asignada por error.
