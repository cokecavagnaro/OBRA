# Hormigasto — Prompt maestro para Claude Code

Pega esto completo al inicio de tu sesión en Claude Code antes de cualquier otra cosa.

---

## CONTEXTO DEL PROYECTO

Estoy construyendo una app web mobile-first llamada **Hormigasto**. Es una herramienta de gestión de gastos para empresas constructoras chilenas. El usuario fotografía boletas y facturas con la cámara del celular, la IA (Claude) extrae cada ítem individual de la boleta y los clasifica automáticamente.

Tengo un prototipo funcional en React que ya contiene toda la lógica de negocio y los flujos de UI. Vamos a construir la versión real con Next.js y Supabase siguiendo exactamente esa lógica.

---

## STACK TECNOLÓGICO

- **Framework**: Next.js 14 con App Router y TypeScript estricto
- **Estilos**: Tailwind CSS mobile-first (ancho base 390px)
- **Base de datos**: Supabase (PostgreSQL + Auth + Storage)
- **IA**: Anthropic API — modelo `claude-sonnet-4-6` con visión (análisis de imágenes)
- **Exportación**: librería `xlsx` (SheetJS)
- **Deploy futuro**: Vercel

---

## REGLAS GENERALES — SEGUIR SIEMPRE

- Todo el diseño es **mobile-first**. Ancho máximo 390px centrado en pantalla.
- Fuente: Inter. Fondo blanco. Estilo profesional y serio, sin gradientes ni sombras decorativas.
- TypeScript estricto en todos los archivos.
- Cada página y componente debe tener manejo de errores y estados de carga.
- Los textos de la app van **siempre en español chileno** con terminología del rubro de la construcción (partidas, HH, gl, m², m³, enfierradura, moldaje, etc.).
- La imagen original de cada boleta debe guardarse siempre en **Supabase Storage**.
- Monedas soportadas: **CLP y UF**.

---

## LÓGICA DE NEGOCIO CENTRAL

### Estructura de centros de costos
Cada gasto pertenece a una jerarquía de tres niveles:
```
Obra → Etapa → Partida
```
Ejemplo: `Casa Familia González → Terminaciones → Pintura`

### System prompt por obra
Cada obra tiene un `system_prompt` propio — instrucciones permanentes que la IA aplica en **todas** las boletas de esa obra. Ejemplos reales:
- *"Las maderas se usan exclusivamente para cubierta de techo"*
- *"Los clavos: 1/3 se contabiliza para techo y 2/3 para piso"*
- *"El hormigón siempre va a la partida Fundaciones aunque no se indique"*

### Contexto por boleta
Además del system prompt de obra, el usuario puede escribir un contexto específico para cada boleta antes de escanear. Ejemplo: *"Las planchas de OSB de esta boleta son para el baño del piso 2"*.

### Dos capas de contexto para la IA
Cuando se analiza una boleta, la IA recibe **siempre**:
1. `system_prompt` de la obra (instrucciones permanentes)
2. `contexto_boleta` (instrucciones específicas de ese escaneo)

### Extracción de ítems
La IA debe extraer **cada ítem individual** de la boleta, nunca solo el total. Por ítem extrae:
- descripción, cantidad, unidad, precio unitario, subtotal
- categoría, etiquetas (array de strings)
- confianza (0 a 1) — si es menor a 0.7, el ítem va a revisión pendiente

### Revisión y confirmación
- Ítems con confianza ≥ 0.7 → vienen pre-confirmados (checkbox marcado)
- Ítems con confianza < 0.7 → van a bandeja de pendientes con badge de advertencia
- El usuario puede confirmar, editar etiquetas o rechazar cada ítem individualmente

### Datos del proveedor
Siempre se extrae RUT y razón social del proveedor (requerido para efectos tributarios chilenos).

---

## SCHEMA DE BASE DE DATOS SUPABASE

Ejecuta este SQL en el editor de Supabase:

```sql
-- Obras
create table obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  system_prompt text default '',
  created_at timestamptz default now()
);

-- Etapas
create table etapas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete cascade,
  nombre text not null,
  orden int default 0
);

-- Partidas
create table partidas (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid references etapas(id) on delete cascade,
  nombre text not null
);

-- Usuarios (extiende auth.users de Supabase)
create table usuarios (
  id uuid primary key references auth.users(id),
  nombre text,
  rol text check (rol in ('admin','operario','visor')) default 'operario'
);

-- Gastos (una boleta = un gasto)
create table gastos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id),
  etapa_id uuid references etapas(id),
  partida_id uuid references partidas(id),
  proveedor text,
  rut_proveedor text,
  fecha_boleta date,
  moneda text check (moneda in ('CLP','UF')) default 'CLP',
  total numeric default 0,
  imagen_url text,
  contexto_boleta text default '',
  created_by uuid references auth.users(id),
  estado text check (estado in ('confirmado','pendiente')) default 'confirmado',
  created_at timestamptz default now()
);

-- Ítems de cada gasto
create table items_gasto (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid references gastos(id) on delete cascade,
  descripcion text,
  cantidad numeric,
  unidad text,
  precio_unitario numeric,
  subtotal numeric,
  categoria text,
  etiquetas text[] default '{}',
  confianza_ia numeric default 1,
  estado text check (estado in ('confirmado','pendiente','rechazado')) default 'confirmado',
  created_at timestamptz default now()
);

-- RLS básico (habilitar en cada tabla desde el dashboard de Supabase)
alter table obras enable row level security;
alter table etapas enable row level security;
alter table partidas enable row level security;
alter table gastos enable row level security;
alter table items_gasto enable row level security;

-- Políticas básicas (ajustar según roles luego)
create policy "usuarios autenticados leen todo" on obras for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados leen todo" on etapas for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados leen todo" on partidas for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados leen todo" on gastos for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados insertan" on gastos for insert with check (auth.role() = 'authenticated');
create policy "usuarios autenticados leen items" on items_gasto for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados insertan items" on items_gasto for insert with check (auth.role() = 'authenticated');
```

---

## ESTRUCTURA DE CARPETAS

```
hormigasto/
├── app/
│   ├── layout.tsx              ← layout principal con BottomNav
│   ├── page.tsx                ← pantalla de inicio (lista de gastos)
│   ├── scan/
│   │   └── page.tsx            ← flujo de escaneo (3 pasos)
│   ├── pendientes/
│   │   └── page.tsx            ← ítems pendientes de revisión
│   ├── config/
│   │   └── page.tsx            ← configuración de obras y system prompts
│   └── api/
│       └── analizar-boleta/
│           └── route.ts        ← API route que llama a Claude Vision
├── components/
│   ├── BottomNav.tsx
│   ├── CamaraScanner.tsx
│   ├── SystemPromptBox.tsx     ← box púrpura que muestra el system prompt
│   ├── ItemCard.tsx            ← card de ítem con checkbox y etiquetas
│   └── Badge.tsx
├── lib/
│   ├── supabase.ts             ← cliente de Supabase
│   ├── types.ts                ← tipos TypeScript de toda la app
│   └── exportar.ts             ← lógica de exportación a Excel
├── hooks/
│   ├── useObras.ts
│   └── useGastos.ts
└── .env.local
```

---

## VARIABLES DE ENTORNO (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
ANTHROPIC_API_KEY=tu_api_key_de_anthropic
```

---

## API ROUTE — ANALIZAR BOLETA

El endpoint `/api/analizar-boleta` recibe POST con:
```json
{
  "imagen": "base64 de la imagen en jpeg",
  "obra": { "nombre": "Casa González", "system_prompt": "Las maderas..." },
  "etapa": { "nombre": "Terminaciones" },
  "partida": "Pintura",
  "contexto_boleta": "contexto específico del usuario"
}
```

Llama a Claude con visión incluyendo las dos capas de contexto y responde:
```json
{
  "proveedor": "Sodimac Quilicura",
  "rut": "96.928.180-5",
  "fecha": "2024-06-10",
  "moneda": "CLP",
  "items": [
    {
      "descripcion": "Pintura látex blanca 20L",
      "cantidad": 4,
      "unidad": "un",
      "precio_unitario": 28990,
      "subtotal": 115960,
      "categoria": "Pinturas",
      "etiquetas": ["pintura", "látex", "terminaciones"],
      "confianza": 0.95
    }
  ],
  "total": 115960
}
```

El prompt al modelo debe especificar:
- Es experto en construcción chilena
- Conoce terminología local: partidas, HH, gl, m², m³, enfierradura, moldaje
- Conoce proveedores chilenos: Sodimac, Easy, Construmart, ferreterías locales
- Aplica primero el system_prompt de la obra, luego el contexto de boleta
- Si el system_prompt dice "clavos 1/3 techo y 2/3 piso", debe crear dos sub-ítems separados con esas proporciones
- Confianza < 0.7 para ítems ambiguos o ilegibles

---

## FLUJO DE LA PANTALLA DE ESCANEO (3 pasos)

**Paso 1 — Contexto:**
- Select de Obra → al elegir, mostrar su `system_prompt` en box púrpura visible
- Select de Etapa (dependiente de obra)
- Select de Partida (dependiente de etapa)
- Textarea "Contexto específico de esta boleta" (opcional)
- Botón Siguiente deshabilitado hasta completar obra/etapa/partida

**Paso 2 — Captura:**
- Componente CamaraScanner (cámara trasera por defecto)
- Preview de la imagen capturada
- Opción de subir desde galería
- Botón "Analizar con IA" → llama al endpoint

**Paso 3 — Revisión:**
- Datos del proveedor extraídos (nombre, RUT, fecha)
- System prompt activo visible en box púrpura
- Lista de ítems con ItemCard:
  - Descripción, cantidad, unidad, precio unitario, subtotal
  - Checkbox "Confirmar" (pre-marcado si confianza ≥ 0.7)
  - Badge amarillo de advertencia si confianza < 0.7
  - Tags editables (agregar/eliminar)
- Total confirmado dinámico (suma solo ítems confirmados)
- Botón "Guardar" → guarda en Supabase + imagen en Storage

---

## PANTALLA DE INICIO

- Header: "Hormigasto" + rol del usuario + botón ⚙ Obras + badge de pendientes
- 2 metric cards: Total registrado en CLP / Número de boletas
- Filtros pills: Por fecha | Por monto | Por obra + select de obra + select de partida
- Lista de gastos (cards): proveedor, RUT, fecha, total, obra › etapa › partida, tags, contador de ítems
- Botón "Exportar Excel" con los gastos filtrados actualmente visibles

---

## COMPONENTE SYSTEMPROMPTBOX

Box siempre visible en color púrpura cuando hay una obra seleccionada:
- Fondo: `#EEEDFE` | Borde: `#AFA9EC` | Texto: `#534AB7`
- Label pequeño: "🤖 Instrucciones de obra — {nombre de la obra}"
- Contenido: el system_prompt en texto
- Si está vacío: texto en gris itálico "Sin instrucciones definidas"
- Link pequeño "✏ Editar" que lleva a la pantalla de configuración

---

## EXPORTACIÓN A EXCEL

Archivo `lib/exportar.ts` con dos hojas:

**Hoja 1 "Resumen"**: fecha, proveedor, RUT, obra, etapa, partida, total CLP

**Hoja 2 "Ítems detalle"**: fecha, proveedor, obra, etapa, partida, descripción, cantidad, unidad, precio unitario, subtotal, categoría, etiquetas

Nombre del archivo: `hormigasto_export_YYYY-MM-DD.xlsx`
Montos formateados con separador de miles chileno.

---

## DATOS DE PRUEBA — insertar en Supabase para testear

```sql
-- Insertar obras de prueba
insert into obras (nombre, system_prompt) values
('Casa Familia González', 'Las maderas se usan exclusivamente para cubierta de techo. Los clavos: 1/3 se contabiliza para techo y 2/3 para piso. El hormigón siempre va a la partida Fundaciones aunque no se indique.'),
('Proyecto Los Alpes 12', 'Las maderas en este proyecto se destinan a tabiquería interior, no a cubierta. Los fierros corrugados siempre van a Enfierraduras. El proyecto tiene dos pisos; si no se especifica, asumir piso 1.');

-- Las etapas y partidas las creas desde la app en /config
```

---

## CÓMO PROBAR EN EL IPHONE SIN DEPLOY

Para acceder desde tu iPhone en la misma red WiFi con cámara funcionando:

```bash
# Opción 1 — HTTPS local (recomendada para cámara)
next dev --experimental-https

# Opción 2 — HTTP local (cámara puede no funcionar en Safari iOS)
next dev

# Luego en tu iPhone, abre Safari y entra a:
# https://192.168.X.X:3000  (tu IP local, la ves con: ipconfig getifaddr en0)
```

---

## ORDEN DE CONSTRUCCIÓN RECOMENDADO

1. Inicializar proyecto Next.js 14 con TypeScript y Tailwind
2. Configurar Supabase (ejecutar SQL del schema)
3. Crear tipos TypeScript (`lib/types.ts`)
4. Crear cliente Supabase (`lib/supabase.ts`)
5. Crear layout con BottomNav
6. Construir CamaraScanner
7. Construir API route `/api/analizar-boleta`
8. Construir pantalla de escaneo (3 pasos)
9. Construir pantalla de inicio
10. Construir pantalla de configuración de obras
11. Construir pantalla de pendientes
12. Agregar exportación a Excel
13. Probar en iPhone con `--experimental-https`
