# Agente de planilla — Etapa 1: entender la planilla y capturar contra ella

## Contexto

Costia hoy le impone su estructura al usuario: etapas y partidas, exactamente dos niveles, con esos nombres. Funciona para quien llega sin nada armado. No funciona para el constructor que ya lleva años con su planilla y no la va a soltar.

La visión completa (ver el documento de diseño del agente) es que **Costia guarde la verdad y la planilla de cada constructor sea una expresión de esa verdad con su propia forma**. El agente lee la planilla, la entiende, y desde ahí se encarga del planilleo: el usuario sólo carga información y el agente la ubica donde corresponde.

Esta etapa construye la mitad de **comprensión y captura**. No escribe una sola celda en ninguna planilla y no toca Google. Eso es deliberado: separa el problema de *entender* del problema de *escribir*, y la comprensión transfiere completa a la etapa siguiente mientras que escribir en `.xlsx` no transfiere (en Google Sheets insertar una fila reajusta las fórmulas solo; en un `.xlsx` habría que reescribirlas a mano).

El objetivo real de la etapa es responder barato la pregunta que hunde el proyecto si la respuesta es no: **¿entiende el agente de verdad la planilla de un constructor cualquiera?** Con cinco o seis planillas reales se responde en días, sin construir integración alguna.

## Caso de referencia

Todo lo que sigue se validó contra `Casa BB · Administración de Obra · JS` (JS Arquitecturas, 13 meses, 6.882 UF). Hojas: `Costos Directos`, `Resumen`, `Itemizado`, `Carta Gantt Financiera`, `Rendiciones`, `Informe Cliente`, `LISTAS`.

De ahí salieron los tres hechos que gobiernan el diseño:

1. **La jerarquía tiene tres niveles**, no dos: 7 centros de nivel 1 → ~35 sub-centros → ~200 ítems con unidad, cantidad y precio unitario. El esquema actual de Costia no puede expresarla.
2. **La mano de obra es hermana del árbol de materiales, no un nodo dentro de él.** `Valor total neto = Materiales e insumos (3.334,71 UF) + Costos directos (2.448,39 UF)`, y los costos directos se descomponen en mano de obra + administración.
3. **Los hitos de pago se calculan sobre los costos directos, no sobre el proyecto total.** Anticipo 10% + 13 cuotas + retención 5% suman exactamente los costos directos brutos. Es un contrato por administración: los honorarios se pagan en cuotas y los materiales se reembolsan contra rendición. Son dos flujos de dinero distintos.

## Alcance

Tres paquetes de trabajo. Son secuenciales: B depende de A, C depende de A.

- **A — Árboles de clasificación.** Reemplaza etapa/partida por jerarquías de profundidad libre con nombres definidos por proyecto: una para costos y otra para ingresos.
- **B — Lectura de planilla y onboarding conversacional.** El agente lee un `.xlsx`, arma el perfil, propone ambos árboles, cuadra contra los totales de la propia planilla, audita las fórmulas y corrige conversando.
- **C — Captura de movimientos e ingresos, y vista financiera.** Cargar costos e ingresos contra la estructura aprendida, con su respaldo, e informar los totales calculados por Costia.

### Fuera de alcance

- Escribir en Google Sheets o en cualquier planilla (etapa 2).
- Leer de vuelta filas tipeadas a mano en la planilla (etapa 3).
- Agente de consulta y bitácora (etapa 4).
- Modificar fórmulas de la planilla del usuario. **Nunca**, en ninguna etapa.
- Campos personalizados libres fuera del catálogo. Ver «Riesgos aceptados».

---

## Paquete A — Árbol de centros de costo

### Por qué va primero

Sin esto, la validación del paquete B es falsa: el agente tendría que aplastar toda planilla a dos niveles y concluiríamos «funciona», cuando en realidad sólo habríamos probado que funciona con planillas que se parecen a Costia.

### Esquema

Dos tablas nuevas. `niveles_clasificacion` guarda cómo se llaman los niveles en ese proyecto; `centros_costo` es el árbol.

**Hay dos árboles por proyecto, no uno**: uno de costos y otro de ingresos, discriminados por `tipo`. Comparten tabla, maquinaria de lectura, herramientas del agente y componentes de interfaz — un árbol es un árbol, y duplicar las tablas duplicaría todo lo que las recorre. La clasificación de un ingreso funciona igual que la de un gasto: se elige un nodo del árbol de ingresos.

```sql
create table niveles_clasificacion (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  tipo text not null check (tipo in ('costo','ingreso')),
  nombre_singular text not null,   -- "Etapa", "Capítulo", "Centro de costo"
  nombre_plural text not null,     -- "Etapas", "Capítulos", "Centros de costo"
  orden int not null,              -- 1 = más alto
  unique (proyecto_id, tipo, orden)
);

create table centros_costo (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  tipo text not null check (tipo in ('costo','ingreso')),
  nivel_id uuid not null references niveles_clasificacion(id),
  padre_id uuid references centros_costo(id) on delete cascade,
  nombre text not null,
  codigo text,                     -- "1.1", "I.", "VI." tal como lo escribe el constructor
  orden int not null,
  presupuesto numeric,             -- CLP neto
  presupuesto_uf numeric,
  unidad text,                     -- sólo hojas: "m3", "un", "gl"
  cantidad numeric,
  precio_unitario numeric,
  es_subcontrato boolean not null default false,
  created_at timestamptz not null default now()
);

-- El mismo centro aparece escrito distinto en cada hoja: "OBRAS PREELIMINARES"
-- en Itemizado, "Obras preeliminares" en Resumen, "VI. INSTALAC. Y URBA"
-- truncado en Rendiciones. Sin esto el agente crea duplicados.
create table centro_costo_alias (
  id uuid primary key default gen_random_uuid(),
  centro_costo_id uuid not null references centros_costo(id) on delete cascade,
  alias text not null,
  unique (centro_costo_id, alias)
);
```

`presupuesto` y `presupuesto_uf` conviven porque Casa BB contrata en UF y paga en CLP; ninguno se deriva del otro sin fijar una UF, y fijarla sería inventar un dato.

### Dónde se clasifica un gasto

**Un ítem apunta a un solo nodo: el más profundo.** Los ancestros se derivan subiendo por `padre_id`.

```sql
alter table items_gasto add column if not exists centro_costo_id uuid references centros_costo(id) on delete set null;
```

Hoy `etapa_id` y `partida_id` viven **tanto en `gastos` como en `items_gasto`** (ver `lib/types.ts` y la inserción en `guardarGastoManoDeObra`, `lib/supabase/db.ts:826`). Esa duplicación permite estados imposibles: una partida cuya etapa no coincide con la etapa del gasto. El puntero único elimina el problema por construcción.

A nivel de `gastos` no se agrega columna: la clasificación de un gasto se deriva de sus ítems, que ya es como opera `app/proyecto/[id]/page.tsx` (agrupa y filtra a nivel de ítem).

### Migración de los datos existentes

Casa BB tiene datos reales en producción. La migración es **aditiva y no destructiva**:

1. Por cada proyecto existente, crear dos filas en `niveles_clasificacion` con `tipo = 'costo'`: orden 1 = «Etapa»/«Etapas», orden 2 = «Partida»/«Partidas». No se crea árbol de ingresos: los proyectos existentes no tienen ingresos registrados. Esto convierte el vocabulario actual de Costia en lo que siempre debió ser — el valor por defecto de quien empieza sin estructura, no una verdad del sistema.
2. Copiar cada fila de `etapas` a `centros_costo` con `nivel_id` = nivel 1, `padre_id` null, conservando `nombre`, `orden` y `presupuesto`.
3. Copiar cada fila de `partidas` a `centros_costo` con `nivel_id` = nivel 2 y `padre_id` = el nodo creado desde su `etapa_id`.
4. Para cada `items_gasto`, setear `centro_costo_id` al nodo copiado desde su `partida_id`; si no tiene partida pero sí etapa, al nodo de la etapa; si no tiene ninguna, queda null (igual que hoy).
5. **Las tablas `etapas` y `partidas` y las columnas `etapa_id`/`partida_id` se dejan en su lugar, sin escribir más en ellas.** Se eliminan en una migración posterior, una vez verificado que nada las lee.

Ambigüedad resuelta explícitamente: si un ítem tiene `partida_id` cuya etapa no coincide con su `etapa_id` (estado hoy posible), **gana la partida**, por ser el dato más específico. La migración registra esos casos en su salida para revisarlos.

### Impacto en el código

`etapa`/`partida` aparece 609 veces en 13 archivos. Buena parte son etiquetas de interfaz que pasan a leerse desde `niveles_clasificacion`.

| Archivo | Qué cambia |
|---|---|
| `lib/types.ts` | Tipos `NivelClasificacion` y `CentroCosto`; `Etapa`/`Partida` quedan deprecados |
| `lib/supabase/db.ts` | Lectura/escritura del árbol. **No se agrega al archivo**: ver abajo |
| `app/config/page.tsx` | CRUD del árbol en vez de dos listas planas |
| `app/scan/page.tsx` | Selector de nodo en vez de dos selectores encadenados |
| `app/proyecto/[id]/page.tsx` | Agrupación por rama del árbol; export usa nombres de nivel dinámicos |
| `app/pendientes/page.tsx`, `app/mano-obra/page.tsx`, `components/ClasificacionModal.tsx` | Mismo cambio de selector |
| `lib/analizarBoleta.ts`, `lib/aprendizaje.ts` | El prompt ofrece el árbol completo, no dos niveles |

`lib/supabase/db.ts` ya tiene 1.105 líneas y es un cajón donde entra todo. **El acceso a datos del árbol va en `lib/centrosCosto/db.ts`**, no ahí. Los archivos grandes son donde las ediciones se vuelven menos confiables, y este crece en cada etapa del agente.

### Mano de obra: no cambia nada

`'Mano de obra'` aparece **una sola vez** en el proyecto, como `categoria` en `lib/supabase/db.ts:900`, y nadie la lee de vuelta — `categoria` es un descriptor suelto que escribe la IA («Materiales», «Pinturas»), no el eje de clasificación. La decisión de reusar `gastos` + `items_gasto` para mano de obra, documentada en el comentario de `lib/supabase/db.ts:820`, fue correcta y se conserva.

Con el árbol general, «Mano de obra» es simplemente un nodo bajo «Costos directos». El único cambio es reemplazar el string fijo por el `centro_costo_id` que corresponda. Se conservan la persona en vez del proveedor, `exento = true`, el estado confirmado sin clasificación de IA, y el mismo flujo de aprobación: son características reales de un pago de mano de obra y valen para cualquier constructor.

---

## Paquete B — Lectura de planilla y onboarding

### Qué produce la lectura

El usuario sube un `.xlsx`. Una sola pasada de IA sobre el archivo produce cinco cosas:

1. **El perfil de planilla** — la traducción entre las columnas de esa planilla y el catálogo.
2. **Los dos árboles propuestos** —costos e ingresos—, con nombres de nivel, códigos, presupuestos y alias.
3. **El tipo de comportamiento de cada nodo de ingreso**, mapeado a los cinco tipos del catálogo.
4. **Lo aprendido sobre cómo trabaja el constructor**, que va a nivel de cuenta.
5. **La auditoría de fórmulas.**

**Ésta es la única pieza del sistema donde corre IA sobre la estructura.** Todo lo posterior es determinístico leyendo el perfil.

### El catálogo

El catálogo es la lista de conceptos que Costia sabe nombrar. Vive en código, no en base de datos, y es cerrado.

| Concepto | Cómo lo llama JS | Cómo podría llamarlo otro |
|---|---|---|
| `numero_documento` | `N° DOC.` | Folio |
| `proveedor` | `PROVEEDOR / LOCAL` | Casa comercial |
| `monto` | `MONTO $` | Valor |
| `glosa` | `DESCRIPCIÓN / GLOSA` | Detalle |
| `fecha_compra` | `FECHA COMPRA` | Fecha |
| `fecha_pago` | `FECHA PAGO` | Pagado el |
| `estado_pago` | `ESTADO` | — |
| `comprobante` | `COMPROBANTE` | Respaldo |
| `centro_costo` | `PARTIDA` | Ítem |

Sin catálogo cada planilla sería un idioma aparte y el sistema no podría consultar, sumar ni comparar entre obras. El catálogo **no** incluye el árbol (lo define cada planilla) ni las etiquetas que ve el usuario (salen de su planilla).

### El perfil

```sql
create table perfiles_planilla (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  clonado_de uuid references perfiles_planilla(id),
  nombre text not null,
  archivo_origen_url text,          -- el .xlsx tal como lo subió, en storage
  perfil jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  actualizado_por uuid references usuarios(id)
);
```

**El perfil vive en el proyecto**, porque cada obra puede llevarse en una planilla distinta y el perfil describe *ese archivo*: sus hojas, sus rangos, sus columnas.

Al crear un proyecto nuevo se le pregunta al usuario si quiere **usar la misma estructura de otro proyecto** o leer una planilla nueva:

- **Misma estructura** → se clona el perfil y el árbol de la obra elegida, **sin los montos**: los nodos y sus nombres se copian, los presupuestos quedan vacíos para que los confirme. `clonado_de` deja registrado el origen.
- **Planilla nueva** → arranca el proceso de lectura completo.

Lo que sí se queda a nivel de cuenta es el **conocimiento del constructor** (abajo): cómo numera sus rendiciones, si retiene por hito o al final, si sus montos son netos o brutos. Eso es una forma de trabajar, no una propiedad del archivo, y no hay que volver a preguntarlo en cada obra.

`perfil` es `jsonb` y no columnas porque su forma depende de la planilla y va a evolucionar en cada etapa. Contenido mínimo: por cada hoja útil, para qué sirve; dónde empieza la tabla de datos; el mapeo columna → concepto del catálogo; cómo se agrupan las filas; dónde están los totales que **no** hay que tocar.

### Conocimiento de cuenta

Lo que el agente aprende preguntando y que no está en la planilla: cómo numera sus rendiciones, si retiene por hito o al final, si los montos que anota son netos o brutos, cómo le dice a cada cosa.

```sql
create table conocimiento_cuenta (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  clave text not null,
  valor text not null,
  origen text not null check (origen in ('preguntado', 'inferido')),
  created_at timestamptz not null default now(),
  unique (cuenta_id, clave)
);
```

`origen` importa: lo inferido se puede volver a inferir si cambia la planilla; lo preguntado no se vuelve a preguntar.

### Cómo se arma el árbol: el ciclo de cuadre

No es un prompt gigante que devuelve un JSON. Es un agente con herramientas que itera hasta que los números cierran.

**Herramientas:**

| Herramienta | Qué hace |
|---|---|
| `leer_hoja` | Devuelve un rango con valores **y fórmulas** |
| `proponer_nodo` | Agrega un nodo al árbol borrador, en memoria |
| `cuadrar` | Corre las sumas y devuelve dónde falla |
| `preguntar` | Le hace una pregunta al usuario y espera respuesta |
| `guardar_arbol` | Persiste el borrador |

**El ciclo:**

1. **Inventario de hojas.** Clasifica cada una: presupuesto, movimientos, informe, listas auxiliares.
2. **Encuentra la jerarquía por la forma de las filas**, no por la numeración —que no es confiable—: fila con texto y sin cantidad ni precio es encabezado; encabezado con total propio a la derecha es nivel 1; sin total propio es nivel 2; fila con unidad + cantidad + precio unitario es hoja; fila `Subtotal` cierra el grupo abierto.
3. **Contrasta contra las otras hojas** para recolectar alias. Los mismos nombres aparecen completos en la hoja de presupuesto, abreviados en la de movimientos y como desplegable en la de listas.
4. **Cuadra.** La planilla trae su propia hoja de respuestas: los totales que el constructor ya calculó son el control de la lectura. Suma las hojas de cada grupo contra su `Subtotal`; los grupos contra el total de su nivel 1; los niveles 1 contra el total general. **Si reproduce números que no escribió, la lectura es correcta.**
5. **Pregunta sólo lo que no cuadró.** No interroga sobre 200 ítems: pregunta por los tres lugares donde la suma falló. Si cuadra entero, casi no pregunta. Si no cuadra en ninguna parte, leyó mal la estructura y hay que reintentar desde el paso 2 — y eso también es información.
6. **Guarda**, con confirmación del usuario.

**El cuadre es la condición de salida del ciclo**, no el juicio del modelo sobre si lo hizo bien. Termina cuando cuadra o cuando el usuario acepta explícitamente una diferencia.

Hasta el paso 6 todo vive en un borrador en memoria: si el usuario abandona a mitad, no queda nada creado.

El árbol de ingresos corre el mismo ciclo sobre la hoja de informe o de pagos. Su cuadre es que la suma de los ingresos esperados coincida con el total contratado que declara la planilla.

### Corrección conversacional

El agente cuenta en lenguaje natural qué entendió y **pregunta todo lo que necesite** para entender bien. El usuario corrige hablando: «no, la partida es la columna F». Eso implica que el agente debe poder **reescribir el perfil desde la conversación** — el perfil no es un JSON que la IA escupe una vez, es un objeto que el agente edita. Es lo que hace que se sienta asistente y no formulario.

Cada corrección incrementa `version` y queda registrada en el historial de ediciones (paquete C).

### Auditoría de fórmulas

La IA ya está leyendo el archivo completo, así que revisar rangos sale casi gratis. Busca rangos que se incluyen a sí mismos, filas salteadas al inicio de un rango, referencias rotas y totales que no cuadran con la suma de sus partes.

Entrega un informe **antes** de que se cargue el primer gasto. **Alerta; nunca escribe la corrección.** Que la celda se arregle es decisión del constructor.

En Casa BB habría detectado los dos errores que hoy tiene el informe que ve el mandante:

| Indicador | Fórmula | Muestra | Correcto | Causa |
|---|---|---|---|---|
| `TOTAL DEPOSITADO` | `=SUMA(G15:G35)` | $74.470.901 | $37.235.450 | La fila 35 es el TOTAL: el rango se suma a sí mismo |
| `SALDO DISPONIBLE` | `=SUMA(I16:I35)` | 998,22 UF | 367,44 UF | Se salta el anticipo (fila 15) y vuelve a incluir el TOTAL |

Una advertencia para el prompt: **la numeración de la planilla no es confiable.** En la `Carta Gantt Financiera` de Casa BB hay ítems marcados `3.1` colgando de `5.0` y de `6.0`, por copy-paste. La estructura hay que leerla por indentación y por dónde caen los subtotales, no por el código.

### Criterio de aceptación del paquete

El paquete B está listo cuando el agente propone, para cada planilla que se le dé, un árbol que su dueño reconoce como correcto tras a lo más un par de correcciones conversadas — y cuando el ciclo de cuadre cierra sin diferencias inexplicadas.

**Casa BB sirve para desarrollar, no para validar**: validar contra la planilla que usamos para diseñar sería confirmar nuestro propio sesgo.

**Restricción real al momento de escribir esto: hay dos planillas disponibles**, Casa BB y una segunda de otro constructor. Dos alcanzan para *romper* el sesgo de Casa BB — que es lo más urgente — pero **no alcanzan para afirmar que el agente entiende planillas en general**. Con dos, cualquier coincidencia estructural entre ambas se va a colar al diseño sin que la notemos.

Consecuencia aceptada: al terminar el paquete B se podrá decir «funciona con estas dos», no «funciona». Conseguir tres o cuatro planillas más es la tarea de mayor valor por hora del proyecto entero y **no depende de escribir código**. Si al llegar al paquete B siguen siendo dos, se avanza igual, pero la decisión de pasar a la etapa 2 —construir la integración con Google Sheets sobre este perfil— no debería tomarse sin más evidencia.

---

## Paquete C — Captura, ingresos y vista financiera

### Documento y dirección son ejes independientes

Un comprobante de transferencia puede respaldar tanto un depósito del mandante como el pago de la mano de obra. El tipo de documento no determina la dirección.

- **Documento:** factura · boleta · comprobante de transferencia · cotización · sin documento
- **Dirección:** sale (costo) · entra (ingreso)

### El escaneo pregunta la dirección primero

`app/scan/page.tsx` hoy asume que todo lo que se fotografía es un gasto. Pasa a preguntar **antes de analizar**:

1. **¿Esto entra o sale?**
2. Si **sale** → el flujo actual, sin cambios salvo el selector de nodo del árbol de costos.
3. Si **entra** → se elige el nodo del árbol de ingresos, y de ese nodo se hereda el tipo de comportamiento (`anticipo`, `cuota`, `reembolso`, `adicional`, `retencion`). El usuario puede corregirlo.

La pregunta va primero porque cambia qué se le pide a la IA: un comprobante de transferencia no tiene ítems que desglosar ni IVA que interpretar, y hacerlo pasar por el análisis de boletas produciría basura.

### Los cinco tipos de ingreso

Catálogo del sistema, no del usuario, porque de estos tipos depende que la aritmética sea confiable. No se distinguen por los campos que piden sino por cómo se comportan.

| Tipo | Monto esperado | Comportamiento |
|---|---|---|
| `anticipo` | Conocido | Ocurre una vez, al inicio |
| `cuota` | Conocido | Serie recurrente con fecha esperada; admite pago parcial |
| `reembolso` | Sale de la rendición | No existe hasta que se gasta |

| `adicional` | No tiene | Aparece durante la obra; requiere aprobación del mandante |
| `retencion` | Conocido | **No es plata que entra.** Es plata retenida que se libera si se cumple una condición |

Aplastar los cinco en un tipo genérico rompe los números: un `adicional` sin monto esperado aparece como «pendiente $0» y ensucia el saldo; una `retencion` tratada como cuota se muestra como un pago atrasado, cuando es dinero que el mandante nunca va a depositar salvo que se cumpla la recepción. **Casa BB comete exactamente ese error** — su `Retención 5%` está como una fila más de la tabla de depósitos con estado `PENDIENTE`.

La retención **la declara el usuario** al ingresarla; no se detecta sola. En Casa BB es cuota final, pero otros constructores retienen un porcentaje de cada pago.

**Salvedad sobre `reembolso` en esta etapa:** su monto esperado debería salir del total de una rendición, y la rendición no se implementa acá. Mientras tanto el monto esperado de un reembolso **se ingresa a mano**, como cualquier otro. Cuando la rendición exista como objeto, pasa a derivarse. Se acepta que hasta entonces un reembolso no se valide contra lo efectivamente gastado.

Los cinco tipos son **el comportamiento**; el árbol de ingresos es **la clasificación**. Un nodo del árbol declara con qué tipo se comporta, igual que un gasto tiene su documento y su centro de costo por separado.

```sql
create table ingresos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  centro_costo_id uuid references centros_costo(id) on delete set null,  -- nodo del árbol de ingresos
  tipo text not null check (tipo in ('anticipo','cuota','reembolso','adicional','retencion')),
  concepto text not null,               -- "Hito 4 — Julio 2026"
  moneda_base text not null check (moneda_base in ('UF','CLP')),
  monto_esperado numeric,               -- null para adicionales
  fecha_esperada date,
  uf_del_dia numeric,
  fecha_deposito date,
  monto_recibido numeric,
  comprobante_url text,
  orden int not null,
  creado_por_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);
```

**El estado no se guarda: se deriva** de `monto_recibido` contra `monto_esperado`. Guardarlo sería almacenar un cálculo, que es justo lo que el principio prohíbe.

`moneda_base` es obligatorio y no tiene default. Casa BB contrata en UF y deposita en CLP; asumir una moneda sería inventar un dato.

### Los campos los define la planilla

El catálogo define el universo de datos posibles; **la planilla define cuáles se piden, con qué etiqueta y en qué orden**. Si el ítem de mano de obra de esa planilla pide persona, período y monto, el formulario pide esas tres y nada más.

Dos campos se guardan siempre, pida lo que pida la planilla: **quién lo ingresó y cuándo**.

`persona` se queda como concepto del catálogo, no como campo suelto de la planilla: hay personas, tienen RUT, se repiten entre pagos y se quieren totales por persona. La planilla sólo decide si la pide.

### Historial de ediciones

Toda modificación conserva cómo estaba y cómo quedó. Costia ya tiene el patrón en `gasto_eventos` e `item_gasto_eventos` (`lib/types.ts`), pero sólo a nivel de estado. Se generaliza a nivel de campo:

```sql
create table campo_eventos (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  tabla text not null,
  registro_id uuid not null,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  usuario_id uuid references usuarios(id),
  usuario_email text not null,
  created_at timestamptz not null default now()
);
create index campo_eventos_registro on campo_eventos (tabla, registro_id, created_at desc);
```

Cubre gastos, ítems, ingresos y perfiles de planilla. `usuario_email` se desnormaliza igual que en `gasto_eventos`, para que el historial siga siendo legible si el usuario se elimina.

### Vista financiera

Costia calcula los cuatro indicadores del informe **por su cuenta**, desde los datos canónicos: valor total del proyecto, total depositado, materiales rendidos y saldo disponible.

No se escriben en ninguna planilla. Existen para dos cosas: que el constructor tenga los números bien aunque su planilla los muestre mal, y para poder avisar cuando no coinciden.

> «Tu planilla muestra un total depositado de $74.470.901. Según los depósitos registrados son $37.235.450. Conviene revisar la fórmula de esa celda.»

Escribir hechos y dejar que la planilla calcule **protege el archivo del constructor; no hace que sus números estén bien**. Sin este cálculo propio estaríamos alimentando fórmulas rotas con datos correctos.

**La retención no suma al total depositado** mientras no se libere. Es la consecuencia práctica más importante de haberla tipado aparte.

---

## Riesgos y decisiones aceptadas

**Una planilla puede pedir un dato que no está en el catálogo.** Se descartaron los campos libres para mantener la aritmética confiable. Consecuencia aceptada: si aparece un concepto realmente nuevo, hay que agregarlo al catálogo y desplegar. Se espera que sea infrecuente — los constructores comparten vocabulario — pero es probable que el caso aparezca. Si aparece más de dos veces en las seis planillas de validación, hay que reabrir la decisión antes de la etapa 2.

**La IA se va a equivocar leyendo planillas.** La mitigación es la corrección conversacional, no un parser más listo. Por eso el criterio de aceptación se mide en *cuántas correcciones* hacen falta, no en si acierta a la primera.

**El árbol toca el corazón del dominio con datos reales en producción.** La mitigación es que la migración sea aditiva y que las tablas viejas queden en su lugar hasta verificar que nada las lee.

**Qué es opt-in y qué no.** El árbol del paquete A es un cambio de esquema y aplica a **todas** las cuentas: no hay forma de tener dos modelos de clasificación conviviendo sin duplicar la lógica en cada pantalla. Lo que sí es opt-in es **subir una planilla**: una cuenta que nunca lo haga sigue viendo exactamente lo de hoy, con «Etapa» y «Partida» como nombres de un árbol de dos niveles que la migración creó por ella. La prueba de que el paquete A salió bien es que un usuario que no sube planilla **no note nada**.

## Qué NO se hace en esta etapa

- No se escribe en Google Sheets ni en ningún `.xlsx`.
- No se leen filas tipeadas a mano en la planilla.
- No se modifican fórmulas ajenas, ni acá ni nunca.
- No se borran `etapas`, `partidas`, `etapa_id` ni `partida_id`.
- No hay agente de consulta ni bitácora.
- No se implementa la rendición como objeto: sólo queda anotado que se definirá como un subárbol más un rango de fechas.
