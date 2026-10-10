# COSTIA — Contexto maestro del producto

> Documento de referencia para colaboradores de Costia. Última actualización: 9 de octubre de 2026.

## Qué es Costia

Costia es un SaaS B2B que ayuda a empresas a digitalizar documentos, ordenar ingresos y gastos, y controlar los costos y el margen de sus proyectos. El segmento inicial son pequeñas empresas constructoras en Chile, sin limitar la marca exclusivamente a la construcción.

- **Slogan:** Cada gasto cuenta.
- **Propuesta principal:** Digitaliza tus documentos. Controla tu margen.
- **Descripción:** Costia transforma facturas, boletas y comprobantes en información detallada para entender la rentabilidad de tus proyectos.

## Problema

Los comprobantes llegan por papel, WhatsApp o correo y terminan consolidados manualmente. Las empresas conocen el total de una factura, pero frecuentemente no tienen visibilidad granular de los productos, servicios o partidas en los que se gastó el dinero.

Costia busca reducir esa fragmentación:

1. El usuario carga una foto, factura, boleta, transferencia o comprobante.
2. La extracción asistida identifica proveedor, fecha, total e ítems.
3. Los ítems se revisan, corrigen y etiquetan individualmente.
4. El movimiento se asocia a proyecto, partida y responsable.
5. El equipo revisa y aprueba.
6. El panel consolida ingresos, gastos, presupuesto y margen.

Las capacidades deben comunicarse según el estado real del producto. No presentar como resultado medido una hipótesis que todavía no haya sido validada con clientes.

## Estado del producto y alcance

Existe un MVP desarrollado por uno de los fundadores. Su núcleo conocido es la digitalización de boletas o facturas y la centralización de información que antes se gestionaba de forma fragmentada. La existencia de una función en este documento no significa que ya esté implementada; siempre se debe comprobar el código real.

### Prioridad inicial

- Carga de documentos desde móvil y escritorio.
- Extracción asistida y corrección manual.
- Asociación de gastos a proyectos y categorías.
- Historial y consulta de documentos originales.
- Panel básico de gastos por proyecto.

### Segunda etapa

- Presupuesto versus gasto real.
- Ingresos por proyecto y cálculo de margen.
- Rendiciones y flujos de aprobación.
- Alertas, exportaciones y reportes.

### Expansión sujeta a validación

- Compras, órdenes de compra y proveedores.
- Cuentas por pagar, conciliaciones e integraciones contables.
- Automatizaciones e inteligencia aplicada al control de costos.

No construir un ERP completo antes de validar uso, disposición a pagar y retención.

## Audiencia

- Dueños y socios de pequeñas empresas.
- Gerentes de operaciones.
- Administradores de obra o proyecto.
- Encargados de finanzas.
- Colaboradores que rinden gastos.

## Marca

Costia debe sentirse clara, confiable, práctica, moderna y directa. Evitar jerga innecesaria, lenguaje grandilocuente y promesas no demostradas.

La identidad utiliza una C geométrica con barras ascendentes, una paleta verde con acento amarillo, fondos crema y alto contraste. Debe funcionar en web, aplicación, favicon, redes, presentaciones y documentos.

## Repositorios y objetivos

- `Costia_website`: sitio público de marketing, adquisición y explicación del producto.
- `Costia_App`: aplicación SaaS para usuarios.

Antes de modificar cualquiera de ellos se debe inspeccionar el repositorio real y comprobar framework, dependencias, variables de entorno, autenticación, base de datos, extracción documental y despliegue.

La web debe comunicar rápidamente el problema, mostrar cómo se digitalizan documentos y cómo se controla el margen, convertir visitantes y funcionar correctamente en móviles.

La aplicación debe minimizar pasos para rendir un gasto, facilitar revisión y corrección, mantener trazabilidad, analizar por proyecto y proteger documentos y datos financieros.

## Modelo de negocio

El modelo deseado es una suscripción SaaS B2B recurrente. Los precios todavía no están validados ni son definitivos.

Hipótesis por validar:

- Frecuencia y volumen de documentos.
- Tiempo ahorrado en digitación y revisión.
- Visibilidad de desviaciones por proyecto.
- Usuario comprador y disposición a pagar.
- Activación, uso semanal, retención y costo por documento.

La prioridad comercial es conseguir clientes reales que usen el producto y estén dispuestos a pagar antes de ampliar excesivamente el alcance.

## Principios de producto

- Inspeccionar y validar antes de asumir.
- Separar funciones existentes de roadmap.
- Diseñar primero para móvil y captura en terreno.
- Proteger documentos y datos financieros.
- Reducir pasos y digitación manual.
- Mantener trazabilidad de cada movimiento.
- Evitar construir un ERP completo antes de validar adopción y pago.
- Verificar lint, tipos, pruebas y build disponibles antes de cerrar cambios.
- Mantener actualizados contexto, brand book y tokens cuando se aprueben decisiones.
- No ejecutar migraciones irreversibles, borrados o cambios en producción sin autorización.

## Preguntas abiertas

- Precisión y campos reales de la extracción documental.
- Flujo definitivo de revisión y corrección.
- Administración de empresas, usuarios y permisos.
- Registro real de ingresos y presupuestos.
- Planes y precios.
- Disponibilidad legal de marca y dominio.
- Funciones que están realmente operativas en el MVP.
- Stack y lugar de despliegue definitivo de cada repositorio.
- Datos extraídos y precisión real por tipo de documento.
- Planes y precios de los primeros clientes.
