# Interfaz y estado — Atelier Studio

Este documento describe la capa de UI de Atelier Studio: el layout de la página (columna de
pasos + bloque Cotización + panel Catálogo/Visor 3D), los cuatro pasos del flujo, el estado
global de la cotización (reducer) y los contextos de apoyo, y el patrón visual Top Studio de
`src/ui/components/primitivas.tsx`. Va dirigido a quien desarrolle o mantenga la interfaz; las
reglas de cálculo que la UI solo *muestra* viven en el motor puro (`src/domain/engine/`) y no se
repiten aquí.

## Estructura de la pantalla

Una sola página, sin login, escritorio primero (§1). El árbol raíz está en `src/App.tsx`:

```text
ProveedorConfig                      ← carga /config (tarifas, figuras, parámetros)
└── Contenido
    ├── pantalla «Cargando configuración…»      (situacion === 'cargando')
    ├── pantalla de error con botón Reintentar  (situacion === 'error')
    └── ProveedorAtelier → ProveedorPanel → ProveedorPasos → ShellAtelier
```

`ShellAtelier` (`src/ui/shell/shell.tsx`) compone el layout definitivo:

- **Cabecera** (`src/ui/shell/cabecera.tsx`): logo de Ferrolan (`ferrolan-logo.png`, servido
  desde `import.meta.env.BASE_URL`), título «Atelier Studio» y subtítulo «Configurador de piezas
  de taller — uso interno».
- **Columna izquierda** (420–480 px en `lg`, `grid-cols-[minmax(420px,480px)_minmax(0,1fr)]`):
  los pasos ① `PasoMaterial`, ② `PasoFigura`, ③ `PasoMedidas`, ④ `PasoSuplementos` y, debajo,
  `PanelCotizacion` siempre visible.
- **Panel derecho**: pestañas Catálogo / Visor 3D y una tarjeta `sticky`
  (`lg:sticky lg:top-6`, altura `lg:h-[calc(100vh-3rem)]`) que no se desplaza con el scroll de la
  columna de pasos.
- En pantallas < `lg` las columnas se apilan.

## Panel derecho: Catálogo y Visor 3D

### Estado de las pestañas (`src/ui/shell/panel.tsx`)

`ProveedorPanel` guarda la pestaña activa (`'catalogo' | 'visor'`) y expone `usePanelDerecho()`
con `pestana`, `setPestana`, `abrirCatalogo()` y `abrirVisor()`. El Catálogo es la pestaña
preseleccionada (decisión de producto). El paso ① usa `abrirCatalogo()` en sus botones
«Seleccionar del catálogo» y «Cambiar».

### Pestaña Catálogo (`src/ui/steps/CatalogoPanel.tsx`)

- Buscador de texto libre + filtro por marca sobre `obtenerFuenteCatalogo()` (capa `src/data/`;
  hoy el índice real del sitemap de ferrolan.es, ver PENDIENTES.md §4.8). La búsqueda tiene un
  *debounce* de 200 ms y devuelve `Material` completos (tarifa y medidas ya autoritativas), sin
  paso de enriquecido al seleccionar.
- Paginación con «Artículos por página» 12 / 24 / 48 (24 por defecto); cambiar texto, marca o
  tamaño vuelve a la página 1. Los resultados tienen **scroll propio** que se reinicia arriba al
  cambiar de página o de búsqueda, para no mover la columna izquierda.
- Cada tarjeta (`TarjetaCatalogo`) muestra foto, descripción, referencia, marca y precio; la
  selección despacha `seleccionarMaterial`. Las tarjetas seleccionadas llevan anillo
  `ring-marca/40` (`aria-pressed`).
- **El precio de la tarjeta es de VENTA, con margen** (2026-07-31, indicación directa: «en las
  cerámicas de la derecha no has aplicado los márgenes»). Hasta entonces se enseñaba la tarifa
  pelada, que es coste: el comercial leía un precio en el catálogo y luego otro, más alto, en la
  cotización. El margen se resuelve **por artículo** con `useMargenDeMaterial(config)`, que aplica
  la misma regla que el motor (`resolverMargen`) — no vale el margen del resultado, como en el paso
  ④, porque en el catálogo hay hasta 48 artículos a la vez y cada uno puede ser de otra subfamilia.
  Cambiar de PVP a contratista, o escribir un margen a mano, recalcula todas las tarjetas.
- El artículo cuya subfamilia **no está** en la tabla del ERP (486 de 28.732) no enseña su tarifa:
  pone **«Precio sin margen»** en ámbar, con el motivo y dónde ponerlo en el `title`. Enseñar la
  tarifa ahí sería dar un coste con pinta de precio de venta, que es justo lo que la regla del
  margen prohíbe; el motor se niega igual a cotizarlo. Ver
  [Configuración](./04-configuracion.md#margenesjson--margen-comercial-por-subfamilia-2026-07-31).
- Los fallos de carga de la fuente (red, índice ausente) se muestran como error recuperable con
  botón **Reintentar**, sin romper el resto de la aplicación. Si una búsqueda no da resultados,
  el propio mensaje sugiere la «Entrada manual» del paso ①.

### Pestaña Visor 3D

Renderiza `<VisorPieza/>` (módulo `src/viewer/`) ocupando la tarjeta entera, sin márgenes. Recibe
del estado global:

- `figura`: la figura activa de configuración (o `null` si no hay).
- `medidasMm`: las medidas ya validadas en mm enteros (`useMedidasValidadas`; `null` mientras
  estén incompletas o sean inválidas).
- `imagenUrl`: la textura del material seleccionado (o `null`).
- `cantidad`: solo si es un entero > 0.

## Los cuatro pasos

Cada paso es una `PasoCard` numerada y plegable cuya apertura controla `usePasos()` (ver
«Apertura automática de pasos» más abajo). Ningún paso hardcodea tarifas, figuras ni
suplementos: todo se lee de `useConfig()`.

### ① Material (`src/ui/steps/PasoMaterial.tsx`)

- Sin material: botón grande **«Seleccionar del catálogo»** (abre la pestaña Catálogo).
- Con material: tarjeta-resumen con foto, descripción, referencia, marca, formato en cm, datos
  de caja (piezas y m² por caja, si existen) y precio; insignia **MANUAL** si es de entrada
  manual. Acciones **Cambiar** (abre el catálogo) y **Quitar** (`seleccionarMaterial: null`).
  Los textos de formato/caja/precio salen de `src/ui/steps/materialUtil.ts`. El precio es el
  **mismo que enseña la tarjeta del catálogo** —de venta, con margen (2026-07-31)—: si aquí se
  viera la tarifa, la misma baldosa tendría dos precios distintos en la misma pantalla.
- ~~Origen del material~~ (`ControlSegmentado` Stock/Pedido): **suprimido el 2026-07-30**. Al
  pasar a facturar por cajas completas también en stock dejó de cambiar el importe, así que
  sobraba: fuera del estado, de la pantalla y del PDF. En su hueco de la orden de trabajo va el
  dato de caja, que es lo que explica en taller por qué se facturan más piezas de las necesarias.
- **Entrada manual** (`src/ui/steps/EntradaManual.tsx`): subsección plegable para cerámica que no
  está ni en ERP ni en PrestaShop (§1.①). Campos mínimos: descripción, largo × ancho en cm,
  precio en €/unidad, **piezas por caja**, **subfamilia** e imagen opcional (URL). La subfamilia
  es obligatoria desde 2026-07-31: es la clave del margen comercial. Las piezas por caja son
  obligatorias porque se factura por cajas completas; los m²/caja **no** se piden, se derivan del
  formato (piezas × largo × ancho), que es exacto y evita teclear un par incoherente. Valida los
  campos antes de llamar a `crearMaterialManual` (`src/data/catalogo.ts`) y selecciona el material
  creado, marcado como manual.

### ② Figura (`src/ui/steps/PasoFigura.tsx`)

- Galería visual construida desde `config.figuras` (§3: nunca cosida a la interfaz), en
  `grid-cols-2 sm:grid-cols-3`. Cada tarjeta muestra la miniatura (`MiniaturaFigura`) y el
  nombre.
- Las figuras `estado: 'pendiente'` (§6.5/§6.6) se ven pero están **bloqueadas**: tarjeta
  deshabilitada, insignia **PENDIENTE** y el `motivoPendiente` visible.
- La selección despacha `seleccionarFigura`, y el reductor **reinicia medidas, suplementos y
  pintado** (no son transferibles entre figuras).
- `MiniaturaFigura` (`src/ui/steps/MiniaturaFigura.tsx`) dibuja cada figura como una pieza
  3D isométrica en SVG inline con un estilo único (paleta de marca, 2026-07-29; antes se
  usaban PNG extraídos de la tarifa PDF de taller), fiel al ensamblaje del visor 3D — las
  figuras 'pendiente' usarían una silueta gris (hoy no hay ninguna en la galería).
  El croquis acotado sigue pendiente de taller (§3, ver PENDIENTES.md §2).

### ③ Medidas y cantidad (`src/ui/steps/PasoMedidas.tsx`)

- Campos **dinámicos según `figura.medidas`** de configuración: `EntradaNumero` libre, o
  `ControlSegmentado` cuando la medida solo admite valores concretos (`opcionesCm`, p. ej. altura
  de rodapié 7,2 / 8), más el campo **Cantidad** (entero ≥ 1, empieza en `'1'`). El comercial
  introduce cm; la conversión a mm y la validación viven en el motor.
- Los errores del motor (`useSalidaMotor`, filtrados a `paso === 'medidas'`) se muestran **junto
  a su campo** (`errores[].medida`) con el mensaje concreto — nunca un «configuración no válida»
  genérico (§1.③). Los errores sin medida concreta se listan al final del paso.
- Detalles de UX para no ser molesto:
  - Los errores de medidas no aparecen hasta que el comercial ha tecleado algo en el paso
    (`medidasTecleadas`): recién elegida la figura, «vacío» aún no es un error que enseñar. El
    error de **cantidad sí se enseña siempre** (nunca empieza vacía).
  - Este paso **nunca se cierra solo** al quedar válido: abre el ④ con 700 ms de retraso
    (`usePasoCompletado(3, salida.ok, RETRASO_ABRIR_MS)`; un solo dígito ya puede ser válido sin
    que se haya terminado de teclear) y se queda abierto.

### ④ Suplementos (`src/ui/steps/PasoSuplementos.tsx`)

- Un conmutador (`FilaConmutador`) por cada suplemento aplicable a la figura activa
  (`figura.suplementos`), con nombre y precio leídos **siempre** de `config.suplementos`:
  «+2,00 €/peldaño» para los `porPieza`, «+0,02 €/cm» para los `porCm` (las milésimas se
  convierten a € solo para presentación; el cálculo sigue en enteros en el motor). La unidad
  «€/peldaño» es el ejemplo literal de §2 y está pendiente de confirmar para figuras futuras
  (PENDIENTES.md §4.11).
- Si la figura `tienePintado`, conmutador **Pintado** con tooltip: cambia la tarifa de la figura
  al precio de pintado (rodapiés, §2).
- Cada cambio despacha `alternarSuplemento` / `cambiarPintado` y actualiza la cotización al
  momento vía el estado global.
- Este paso **no cierra ninguna otra tarjeta**. Antes cerraba el ③ al activar un
  suplemento/pintado y al mover el ratón por encima; se quitó (2026-07-29, indicación directa)
  porque cerraba una tarjeta que el comercial estaba usando — y en el caso del ratón, sin que
  hubiera tocado nada.
- Sin figura seleccionada, o si la figura no tiene suplementos ni pintado, muestra un mensaje
  orientativo.

## Bloque Cotización (`src/ui/shell/cotizacion.tsx`)

Siempre visible bajo los pasos. Hasta que el motor devuelve resultado muestra las líneas a «—»
y el texto «La cotización aparecerá al completar los pasos ① Material, ② Figura y ③ Medidas.».

- **Desglose** (`desglose` del motor, con `formatearEuros`): Material · Manipulación (con
  suplementos), con el detalle de `lineasManipulacion` sangrado bajo ella · Arranque de máquina ·
  Total sin IVA · IVA (`config.parametros.ivaPorcentaje` %) · Total con IVA (destacado).
- **Datos logísticos** (solo con resultado): baldosas necesarias, baldosas con merma, piezas
  facturadas, cajas facturadas y m² facturados.
- **Precio del material editable** por el comercial en € (§1 «Cotización»): campo filtrado al
  teclear (`/^\d{0,7}([.,]\d{0,2})?$/`, para que un texto no parseable nunca llegue al motor),
  tarifa original siempre visible junto al editado (`precioMaterialOriginal` del motor, o la
  tarifa del material) y botón **Restablecer a tarifa** cuando hay valor editado. La unidad
  mostrada es €/m², o €/unidad en material manual.
- **Merma sobre baldosas (%)**: visible para el comercial (§4). El valor se **sugiere** a partir
  del formato de la baldosa (lado mayor: 60 cm o menos → 10 %, 120 cm o más → 20 %) más el extra
  de las figuras numeradas, y el estado guarda solo la EDICIÓN del comercial, de modo que la
  sugerencia se recalcula al cambiar de material o de figura. Editable solo si
  `parametros.mermaEditable` (**PROVISIONAL** §6.10, se indica en el tooltip de ayuda).
- **«Parámetros avanzados»** (`src/ui/shell/ParametrosAvanzados.tsx`): sección **plegada** al final
  de la cotización, a propósito fuera de la vista principal (2026-07-31, indicación directa).
  Contiene dos cosas **separadas**:
  1. El **tipo de margen**, MTP (PVP) o MTC (contratista), con PVP por defecto. Al abrirla se
     indica siempre qué margen se aplica y de qué subfamilia sale — plegado no es lo mismo que
     oculto: si el comercial no sabe con qué margen presupuesta, puede equivocarse sin notarlo.
  2. En su **propio bloque**, no debajo del selector (indicación expresa), el **margen a mano**
     para los artículos cuya subfamilia no está en la tabla del ERP. Si falta el margen la sección
     se despliega sola y el campo se marca: es lo único que desbloquea el precio.
- **Errores de validación del motor**: lista `role="alert"` con los mensajes concretos. Los del
  paso ③ se ocultan hasta que hay algo tecleado ahí (`medidasTecleadas`, mismo criterio que
  `PasoMedidas`); el de cantidad se muestra siempre.
- **Generar PDF**: deshabilitado sin resultado válido (ver PENDIENTES.md §4.12). Reconstruye la
  entrada con `construirEntrada` (determinista) y llama a `generarPdfOrdenTrabajo`
  (`src/pdf/ordenTrabajo.ts`); cualquier error se muestra en pantalla sin romper la app.
- **Reiniciar**: despacha `reiniciar` y vuelve al estado inicial conservando el % de merma por
  defecto de configuración.

## Estado global de la cotización (`src/ui/state/quote-state.tsx`)

Un reducer vía `useReducer` + contexto: **una sola pieza configurada por orden** (§1). Los campos
de entrada se guardan como **texto crudo** para validar con mensajes concretos (§1.③); la
conversión a mm/céntimos pasa por el motor, nunca por los componentes.

### Estado (`EstadoAtelier`)

| Campo | Tipo | Valor inicial |
|---|---|---|
| `material` | `Material \| null` | `null` |
| `figuraId` | `string \| null` | `null` |
| `medidas` | `Record<string, string>` (cm crudos, por id de medida) | `{}` |
| `cantidad` | `string` | `'1'` |
| `suplementos` | `Record<string, boolean>` (por id de suplemento) | `{}` |
| `pintado` | `boolean` | `false` |
| `precioMaterialEditadoEuros` | `string` (`''` = usar tarifa) | `''` |
| `mermaPorcentaje` | `string` | `parametros.mermaPorcentajeDefecto` |

### Acciones (`AccionAtelier`)

| Acción | Efecto |
|---|---|
| `seleccionarMaterial` | Fija (o quita, con `null`) el material. |
| `seleccionarFigura` | Fija la figura y **reinicia `medidas`, `suplementos` y `pintado`** (no transferibles). |
| `cambiarMedida` | Actualiza una medida cruda (cm). |
| `cambiarCantidad` | Actualiza la cantidad cruda. |
| `alternarSuplemento` | Activa/desactiva un suplemento por id. |
| `cambiarPintado` | Activa/desactiva el pintado. |
| `cambiarPrecioMaterialEditado` | Precio editado en € (texto); `''` restablece la tarifa. |
| `cambiarMerma` | % de merma (texto). |
| `reiniciar` | Vuelve a `estadoInicial` con el % de merma por defecto de configuración. |

### Selectores y puente con el motor

- `construirEntrada(estado, config)`: traduce el estado crudo a la entrada del motor. Devuelve
  `null` si faltan datos básicos (material, figura activa); una `SalidaMotor` de error si la
  cantidad no es un entero ≥ 1 o si `validarMedidasCrudas` rechaza las medidas; o
  `{ entrada, medidasMm }` listo para `calcularCotizacion`. Aquí se normaliza la coma decimal y se
  convierten € → céntimos (`eurosACentimos`) y el % de merma (vacío = valor por defecto de
  configuración).
- `useSalidaMotor(config)`: ejecuta el motor memoizado sobre el estado actual; `null` = aún no
  hay datos suficientes. Es la única vía por la que la UI lee precios y errores.
- `useMargenDeMaterial(config)`: devuelve una función `(material) => ResolucionMargen` con el
  margen que le toca a un material CUALQUIERA, con la misma regla que usará el motor al cotizarlo.
  La usan las tarjetas del catálogo y la tarjeta-resumen del paso ①, que muestran precio de venta.
- `useMedidasValidadas(estado, config)`: medidas en mm para el visor 3D (`null` mientras no sean
  válidas).
- `medidasTecleadas(estado)`: `true` si hay alguna medida tecleada desde que se eligió la figura;
  gobierna cuándo se muestran los errores de medidas en `PasoMedidas` y `PanelCotizacion`.

## Contextos de apoyo

### Configuración (`src/ui/state/config-context.tsx`)

`ProveedorConfig` carga tarifas, figuras y parámetros al montar
(`crearFuenteConfiguracionJson().cargar()`) y expone una unión discriminada
`EstadoConfig`: `'cargando' | 'error' | 'lista'`. `App.tsx` usa `useEstadoConfig()` para pintar
las pantallas de carga/error; el resto de la app usa `useConfig()`, que devuelve la
`Configuracion` ya lista y **lanza** si se usa antes de tiempo (solo es seguro bajo la rama
`'lista'`).

### Apertura de pasos (`src/ui/state/pasos-context.tsx`)

`ProveedorPasos` guarda qué tarjetas ①-④ están abiertas (empieza solo la 1) y expone
`usePasos()` con `alternar` y `abrir`. Es un estado puramente visual: no toca el motor ni la
cotización.

**El automatismo solo ABRE pasos, nunca cierra ninguno** (2026-07-29, indicación directa).
Cerrar es siempre acción del comercial, con clic en la cabecera de la tarjeta (`alternar`) — por
eso `alternar` es el único camino que cierra, y el contexto ya no expone `avanzar` ni `cerrar`.

Un solo hook guía el flujo (cada `PasoX` define su propia condición de «completo»):

- `usePasoCompletado(numero, completo, retrasoMs?)`: en la transición incompleto → completo, abre
  el paso `numero + 1` y deja todo lo demás como estaba. Pasos ① y ② lo usan sin retraso; el ③
  con 700 ms.

### Atajo del manual de usuario (`src/ui/shell/atajoManual.ts`)

**Ctrl + Alt + H** descarga `public/manual-usuario.pdf`. Va **sin botón visible** a
propósito (indicación directa, 2026-07-29): el manual no es parte del trabajo diario y
no debe ocupar sitio en pantalla. Dos detalles de implementación:

- Se compara `event.code === 'KeyH'`, no `event.key`, para que funcione igual con
  teclado español, catalán o inglés.
- No es Ctrl+H porque esa combinación está reservada por el navegador (historial) y una
  página no la puede interceptar de forma fiable.

El atajo se engancha en `ShellAtelier` con `useAtajoManual()`. El PDF se regenera con
`npm run manual`.

## Patrón visual Top Studio (`src/ui/components/primitivas.tsx`)

Primitivas compartidas que reproducen el patrón de Top Studio: pasos numerados en tarjetas
blancas, campos con etiqueta, tooltips «i», controles segmentados e insignias de estado. La
paleta corporativa se define en `tailwind.config.js` (`marca` `#C40731`, `marca-oscuro`
`#9A0627`, `marca-claro` `#FCE9EE`; fuente Montserrat).

| Primitiva | Qué es |
|---|---|
| `PasoCard` | Tarjeta de paso numerado, plegable. Cabecera botón con círculo `bg-marca`, número, título y ▾/▸ (`aria-expanded`); cuerpo controlado por `usePasos()`. |
| `Campo` | Etiqueta + tooltip opcional + mensaje de error, envolviendo **un** control etiquetable (`<label>`). |
| `EntradaNumero` | `<input type="text" inputMode="decimal">` de texto crudo (la validación vive en el motor); estado `invalido` en rojo. |
| `ControlSegmentado` | Grupo de opciones excluyentes (`role="radiogroup"`): rodapié 7,2/8 cm… |
| `FilaConmutador` | Checkbox con etiqueta y detalle (p. ej. el precio del suplemento). |
| `InfoTooltip` | «i» con globo al hover/focus (`tabIndex=0`, `aria-label` con el texto). |
| `Insignia` | Etiqueta de estado con tonos `provisional`, `pendiente`, `muestra`, `manual`, `info`. |
| `Boton` | Variantes `primario` (`bg-marca`) y `secundario` (borde). |
| `Pestanas` | `role="tablist"`; la usa el panel derecho (Catálogo / Visor 3D). |

Apoyos en `src/ui/steps/` que siguen el mismo patrón:

- `CampoGrupo.tsx`: misma presentación que `Campo` pero con `<div>`, para controles que no son un
  único input (un `<label>` corrompería el nombre accesible de los botones del grupo).
- `ImagenMaterial.tsx`: foto del material con placeholder «Sin imagen» si no hay URL o la carga
  falla; nunca bloquea.
- `MiniaturaFigura.tsx` y `materialUtil.ts`: miniaturas de figuras y textos de formato/caja/precio
  (ver pasos ① y ②).
- `EntradaManual.tsx`: alta manual de materiales (ver paso ①).

## Consulta también

- [Arquitectura general](./03-arquitectura.md) — capas del proyecto y reglas de oro.
- [README.md](../README.md) — puesta en marcha, comandos y configuración de `public/config/`.
- [PENDIENTES.md](../PENDIENTES.md) — dudas abiertas que afectan a la UI (§4.8 catálogo, §4.11
  unidad de suplementos, §4.12 PDF sin cotización válida; §6.9/§6.10 merma).
- [AGENTS.md](../AGENTS.md) — convenciones del repo (dinero en céntimos, nada hardcodeado en
  componentes, textos de UI en español).
