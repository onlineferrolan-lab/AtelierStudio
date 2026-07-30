# PDF de orden de trabajo

Este documento explica cómo Atelier Studio genera el PDF de **orden de trabajo**: qué
contiene, cuándo y cómo se produce con jsPDF a partir del estado de la cotización, las
convenciones de unidades y formato que respeta, y cómo extenderlo sin romper nada. Está
pensado para quien mantenga o amplíe `src/pdf/ordenTrabajo.ts` (desarrollo), no para el
usuario final de la herramienta.

La orden de trabajo es un **documento interno para taller y archivo** (§1 de la
especificación): no es la factura ni el presupuesto al cliente.

> **Contenido pendiente de validación (§6.11).** El contenido definitivo del PDF sigue
> sin estar validado por taller y comercial. A petición directa (2026-07-24) el documento
> **ya no lleva ningún aviso visible de "provisional"**: se prioriza que se vea terminado
> en el uso diario. El seguimiento vive solo en `PENDIENTES.md` (punto 11) — no lo
> reintroduzcas en el documento.

## Qué contiene el documento

El PDF es A4 vertical y se maqueta en este orden, una sección tras otra
(`construirPdfOrdenTrabajo` en `src/pdf/ordenTrabajo.ts`):

| Sección | Contenido |
|---|---|
| Cabecera | Logo de Ferrolan (o el texto «FERROLAN» si no carga), título «ATELIER STUDIO», subtítulo «Orden de trabajo — documento interno», fecha/hora de generación en formato largo `es-ES` y el **código de orden** `OT-AAAAMMDD-HHMM` (`codigoOrdenTrabajo`, mismo sello que el nombre del archivo: sin él la hoja impresa no se podía citar). |
| **Material** | Foto/textura del material en una caja de 30 × 30 mm (o placeholder «Sin imagen»), descripción, referencia, marca, formato de la baldosa en cm, insignia «ENTRADA MANUAL» si el material es manual, origen (`stock` — facturación por piezas, o `pedido` — cajas completas) y precio aplicado (€/m² o €/unidad). Si el comercial editó el precio, se muestran **ambos**: «Precio aplicado … (editado por el comercial)» y «Tarifa original …». |
| **Pieza** | Nombre de la figura, tabla de medidas con las etiquetas de la configuración (sin el sufijo «(cm)») y sus valores en cm, cantidad («1 pieza» / «N piezas»), pintado (solo si la figura `tienePintado`) y suplementos activos por nombre (o «ninguno»). A la derecha, el **croquis de la sección** a escala con el fondo y el alto acotados (`dibujarCroquisSeccion`): el taller necesita ver la FORMA, porque las Figuras 1–3 solo se distinguen por el grueso de la nariz. Sale de `datos.seccion` — la misma sección que extruye el visor 3D (`src/piezas/seccionPieza.ts`), así que dibujo y modelo no pueden discrepar. Si `seccion` es `null` el PDF se genera igual, sin croquis. |
| **Producción** | Componentes de **una** pieza (id de la receta y medidas largo × ancho en cm) y ocupación en baldosa (`ocupación de dimensión útil · N cortes`, con «baldosa girada 90°» si aplica). Después, **en dos columnas** (`filasEnDosColumnas`): piezas/baldosa, baldosas, baldosas con merma (con el % aplicado), unidades facturadas, cajas facturadas y m² facturados. Van en dos columnas porque son cifras cortas y apiladas empujaban el total con IVA a una segunda página casi vacía. |
| **Cotización** | Desglose con importes alineados a la derecha: Material, Manipulación (en negrita, con sus líneas de detalle sangradas — tarifa de la figura y suplementos), Arranque de máquina, Total sin IVA (negrita), IVA con el porcentaje de `parametros.ivaPorcentaje`, y el **Total con IVA** dentro de una caja roja de marca para que sea inequívoco. El cierre (regla + los dos totales + la caja) reserva su alto **junto** con un solo `asegurarEspacio`: así el total con IVA nunca queda huérfano en la página siguiente. |

Al pie, un **bloque de control** (`pieControl`): «Cortado por · Fecha · Revisado
por» con líneas para rellenar A MANO sobre la hoja impresa. La app no guarda esos
datos — el flujo de estados de órdenes queda fuera del alcance de la v1 (§8).

Las **etiquetas van en gris y los valores en negro y negrita**, no al revés: en
una hoja que se lee de pie en el taller, las cifras tienen que ser lo primero que
salta a la vista.

Nada de esto se calcula en el módulo PDF: se maqueta tal cual llega en el
`ResultadoCotizacion` del motor (`src/domain/types.ts`).

**La orden cabe en una página** y hay un test que lo fija para el caso más largo
(Figura 4: cuatro medidas y tres componentes). Es lo que obliga a `ALTO_FILA = 5`,
a las dos columnas de Producción/Componentes y a que el croquis vaya al hueco de la
derecha en vez de en una banda propia.

## Cuándo y cómo se genera

La generación la dispara el botón **«Generar PDF»** del bloque Cotización
(`alGenerarPdf` en `src/ui/shell/cotizacion.tsx`), siempre que el motor haya devuelto
un resultado válido. El flujo es:

1. La UI reproduce la entrada que produjo el resultado con `construirEntrada(estado, config)`
   (determinista) y recupera la figura con `figuraPorId`. Si falta algo, muestra un error
   en pantalla en lugar de generar un PDF incompleto.
2. Con la entrada y el resultado monta un `DatosOrdenTrabajo` y llama a
   `generarPdfOrdenTrabajo(datos)`.
3. `generarPdfOrdenTrabajo` descarga en paralelo el logo (`${BASE_URL}ferrolan-logo.png` —
   cuelga de la base pública, porque la app se sirve bajo `/atelier-studio/` y con la ruta
   absoluta a la raíz daba 404 en producción y el PDF salía con el texto «FERROLAN») y la foto
   del material (`material.imagenUrl`, si existe) como data URL, llama a
   `construirPdfOrdenTrabajo` y guarda el archivo con `doc.save(nombre)`. Devuelve el
   nombre del archivo guardado.

### Construcción pura, separada de la descarga

El módulo separa dos responsabilidades (`src/pdf/ordenTrabajo.ts`):

- **`construirPdfOrdenTrabajo(datos): jsPDF`** — pura y síncrona. Recibe las imágenes
  **ya cargadas** como data URL (`logoDataUrl`, `imagenMaterialDataUrl`; `null` si no hay
  o falló la carga) y solo maqueta. Sin red ni `save()`: así es testeable en jsdom.
- **`generarPdfOrdenTrabajo(datos): Promise<string>`** — la única parte impura: hace los
  `fetch` de las imágenes y el `save()`. Un fallo de red o de CORS **nunca bloquea** el
  PDF: `cargarImagenComoDataUrl` devuelve `null` y el documento sale sin esa imagen.

### Entrada: `DatosOrdenTrabajo`

Todos los datos entran por un único objeto (`src/pdf/ordenTrabajo.ts:29`): `material`,
`origen`, `figura`, `medidasMm` (mm enteros), `cantidad`, `suplementosActivos` (ids),
`pintado`, `precioMaterialEditadoEuros` (cadena tal cual la tecleó el comercial),
`mermaPorcentaje`, `resultado` (`ResultadoCotizacion` del motor), `config`, `fecha` y,
opcionalmente, las dos imágenes como data URL.

### Nombre de archivo

`nombreArchivoOrdenTrabajo` produce `orden-trabajo_<referencia>_<AAAAMMDD-HHmm>.pdf`,
con la referencia saneada para nombre de archivo (cualquier carácter que no sea
letra/dígito/`_`/`-` pasa a `-`; si queda vacía, `sin-referencia`).

## Unidades y formato

El módulo PDF hereda las reglas irrompibles del dominio (ver `AGENTS.md`):

- **Dinero: céntimos enteros (`Centimos`).** Todos los importes se imprimen con
  `formatearEuros` (`src/domain/money.ts`), que formatea con `Intl.NumberFormat('es-ES',
  { style: 'currency', currency: 'EUR' })` — nunca se divide ni se formatea a mano. La
  única excepción controlada es `precioMaterialEditadoEuros`, que llega como cadena
  tecleada: `formatearPrecioEditado` la parsea (aceptando coma o punto) y la convierte
  con `eurosACentimos` antes de formatearla; si no parsea, se imprime tal cual con « €».
- **Geometría: mm enteros (`Mm`) en el cálculo, cm en la presentación.** Todas las cotas
  (formato de baldosa, medidas, componentes, ocupación) salen de `formatearCotaCm`
  (`src/domain/units.ts`): mm → «90 cm» con un decimal máximo y separador `es-ES`.
- **Las unidades de jsPDF son mm** (`new jsPDF({ unit: 'mm', format: 'a4' })`): las
  constantes de maquetación (`MARGEN_X`, `X_VALOR`, `LIMITE_Y`, …) son milímetros de
  página, no del dominio. No las confundas con las cotas de la pieza.
- **Porcentajes y m²** se formatean con `Intl.NumberFormat('es-ES')` (máx. 2 y 3
  decimales respectivamente).
- **Texto saneado para cp1252** (`sanearTextoPdf`): las fuentes estándar de jsPDF no
  cubren `≤` ni `≥` (presentes en nombres de tarifa de la configuración) y se sustituyen
  por `<=` / `>=`. El resto de caracteres del español (á, ñ, «», §, ×, —, ·) sí están
  cubiertos. Pasa por esta función **todo** texto que provenga de configuración o del
  usuario antes de dibujarlo.

## Extender el PDF sin romper nada

El diseño está pensado para crecer por secciones. Sigue estas pautas:

1. **No calcules nada aquí.** Si el dato no está en `ResultadoCotizacion` o en la
   configuración, corresponde al motor (`src/domain/engine/`), no al PDF. El módulo PDF
   solo maqueta.
2. **Mantén la pureza de `construirPdfOrdenTrabajo`.** Nada de `fetch`, `Date.now()` ni
   `save()` dentro: la fecha llega en `datos.fecha` y las imágenes ya cargadas. Lo impuro
   va en `generarPdfOrdenTrabajo`.
3. **Añade campos nuevos a `DatosOrdenTrabajo`** (tipado estricto) en lugar de leer
   estado global o re-calcular desde parámetros sueltos. Luego pásalos desde
   `alGenerarPdf` en `src/ui/shell/cotizacion.tsx`.
4. **Respeta las primitivas de maquetación existentes**: `tituloSeccion`, `filaDato`,
   `filaCompacta`, `filaImporte` y `asegurarEspacio` (salto de página automático al
   superar `LIMITE_Y`). Con ellas una sección nueva son unas pocas líneas.
5. **Usa siempre los formateadores de dominio** (`formatearEuros`, `formatearCotaCm`,
   `Intl.NumberFormat('es-ES')`) y `sanearTextoPdf` para textos externos.
6. **Respeta la identidad visual**: los colores (`ROJO_MARCA` #C40731, etc.) son los
   mismos valores que `tailwind.config.js → colors.marca`; si cambian allí, cámbialos
   aquí.
7. **Amplía los tests** en `tests/unit/pdf/ordenTrabajo.test.ts`: construyen el
   `ResultadoCotizacion` a mano, llaman a `construirPdfOrdenTrabajo` (con un PNG 1×1 como
   data URL para las imágenes) y verifican el documento sin red ni descarga.
8. **No añadas avisos de «provisional» al documento.** El contenido sigue pendiente de
   validación (§6.11), pero la decisión registrada en `PENDIENTES.md` (punto 11) es que
   el PDF se vea terminado. Si cambias el contenido de forma relevante, actualiza esa
   entrada.

## Consulta también

- [README.md](../README.md) — visión general, comandos y arquitectura del proyecto.
- [PENDIENTES.md](../PENDIENTES.md) — punto 11: validación pendiente del contenido del PDF (§6.11).
- [AGENTS.md](../AGENTS.md) — reglas irrompibles (céntimos/mm enteros, motor puro, config-driven).
- Fuentes: `src/pdf/ordenTrabajo.ts`, `src/ui/shell/cotizacion.tsx` (disparo del PDF),
  `src/domain/types.ts` (`ResultadoCotizacion`, `Mm`, `Centimos`),
  `src/domain/money.ts` y `src/domain/units.ts` (formateadores),
  `tests/unit/pdf/ordenTrabajo.test.ts` (tests del módulo).
