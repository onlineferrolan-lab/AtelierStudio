# Visor 3D paramétrico

Este documento describe el visor 3D de Atelier Studio: cómo la figura y las medidas de una
cotización se convierten en geometría three.js, cómo se dibujan las cotas, cómo se monta la
escena, cómo se cargan las texturas del material y cómo se gestionan los recursos GPU. Está
dirigido a quien mantenga o amplíe `src/viewer/`; no explica el motor de cálculo ni el catálogo
(ver «Consulta también»).

## Qué hace el visor

El visor muestra la pieza configurada en los pasos ①–③, aislada y con proporciones reales (§1
«Visor 3D» de la especificación):

- Pieza centrada sobre fondo neutro claro, orbitable con el ratón (rotar + zoom).
- Cotas visibles con el valor de cada medida, siempre legibles.
- Textura del material si hay imagen; si no hay o falla la carga, material gris neutro más el
  aviso «Textura no disponible». **La textura nunca bloquea** el visor.
- Si WebGL no está disponible, muestra un mensaje y el resto de la app sigue funcionando.
- Con `cantidad` > 1 se dibuja una sola pieza y se indica al pie; la vista de varias piezas
  instaladas queda fuera de alcance de la v1 (§8).

El visor es **capa de representación**: las medidas llegan como `Mm` (enteros del dominio) y se
convierten a unidades de escena (1 unidad = 1 cm) como `float` de dibujo. La regla «prohibido
float para geometría» gobierna el cálculo de dominio; el visor solo pinta y nunca alimenta
cotizaciones (`src/viewer/geometria.ts:4`).

## Dónde vive cada cosa

| Archivo | Responsabilidad |
|---|---|
| `src/viewer/VisorPieza.tsx` | Componente React: ciclo de vida, estados vacíos, insignia de textura, botón de cámara |
| `src/viewer/geometria.ts` | Construye la malla de la pieza y los datos de las cotas a partir de la receta |
| `src/viewer/cotas.ts` | Dibuja líneas de cota, extensiones, remates y etiquetas de texto |
| `src/viewer/escena.ts` | Renderer, cámara, luces, `OrbitControls`, encuadre y destrucción de la escena |
| `src/viewer/materiales.ts` | Material neutro, carga de la textura y su aplicación a la malla |
| `src/viewer/recursos.ts` | Liberación de geometrías, materiales y texturas |
| `tests/visor-geometria.test.ts` | Tests del ensamblaje y de las cotas (jsdom, sin WebGL) |

## De la cotización a la geometría

### Contrato del componente

`VisorPieza` (`src/viewer/VisorPieza.tsx:25`) recibe cuatro props:

| Prop | Tipo | Qué es |
|---|---|---|
| `figura` | `Figura \| null` | Figura activa, con su receta `componentes` leída de `figuras.json` |
| `medidasMm` | `Record<string, Mm> \| null` | Medidas ya validadas, en mm enteros; `null` mientras falten o sean inválidas |
| `imagenUrl` | `string \| null` | URL de la textura del material (`material.imagenUrl`) |
| `cantidad` | `number` (opcional, 1) | Solo para el aviso «Se muestra 1 pieza de N» |

Las `medidasMm` salen de `useMedidasValidadas` (`src/ui/state/quote-state.tsx:189`), la misma
validación que alimenta el motor: el visor siempre dibuja medidas válidas o no dibuja nada.

### Cómo se construye la pieza

`construirPieza(figura, medidasMm, grosorMm?)` (`src/viewer/geometria.ts:105`) devuelve una
`PiezaConstruida` (malla, cotas, caja envolvente y dimensión máxima) o `null` si la figura no
tiene receta o falta alguna medida (`faltanMedidasParaPieza`).

- **La receta no se hardcodea.** Cada componente de `figura.componentes` declara de qué medida
  sale su largo (`largoDe`) y su ancho (`anchoDe`) — contrato `ComponenteReceta` en
  `src/domain/config.ts:75`. El ensamblaje se decide por los `id` de componente presentes.
- **Conversión de unidades:** `Mm × 0,1` = unidades de escena (1 ud = 1 cm,
  `UNIDADES_POR_MM` en `src/viewer/geometria.ts:29`).
- **Centrado:** tras montar la malla se calcula su `Box3` y se traslada al origen, para orbitar
  y encuadrar alrededor de la pieza. Las cotas se desplazan con el mismo vector.

**Toda pieza es la extrusión de su sección transversal.** La sección se define en el plano
(`z` = fondo, `y` = alto) y se extruye a lo largo del largo (`x`) con `extruirPerfil`, así que
cada figura es **una sola malla**. `construirSeccion(figura, medidasMm, grosorMm?)` devuelve esa
sección (`THREE.Shape`) sin construir la malla: es la forma canónica de verificar la geometría.

Ensamblajes soportados hoy (forma según los dibujos de la tarifa PDF vectorizados,
2026-07-29; PROVISIONAL §3 — los dientes son solo representación, no tocan la receta):

| Componentes de la receta | Figuras | Sección |
|---|---|---|
| `tapa` + `frontal` | Figura 1 | L a ras: tapa de un grosor sobre una nariz de UN grosor |
| `tapa` + `frontal` | Figura 2 | La misma L con la nariz de DOS grosores (un diente tras el frontal) |
| `tapa` + `frontal` | Figura 3 | La misma L con la nariz de TRES grosores (dos dientes) |
| `tapa` + `frontal` + `retorno` | Figura 4 | Sin dientes: el retorno engorda la nariz hacia dentro, maciza (nariz = grosor + retorno) |
| … + `frontal-trasero` | Pasamanos 1–3 | La misma sección en espejo (∩): la nariz también en el canto opuesto |
| … + `frontal-trasero` + `retorno` + `retorno-trasero` | Pasamanos 4 | La Figura 4 en espejo: nariz con retorno en ambos cantos |
| `tapa` (sola) | Peldaño romo | Losa de un grosor con el canto delantero **romado**: arco de elipse que recorre el grosor entero y vuela un cuarto de él (`VUELO_ROMADO`), o sea cara frontal casi recta y las dos esquinas matadas. En sección es una «D» de lomo plano, **no** una media caña (2026-07-31, indicación directa) |
| `tapa` (sola), id `pasamanos-romo` | Pasamanos romo | La misma losa con el canto romado también en el trasero |
| `liston` | Rodapiés | Listón de pie (largo × alto, grosor de baldosa) con el canto superior **romado** («Rodapeu romat o bisellat» de la tarifa): el mismo canto tumbado — cruza el grueso entero y sube un cuarto de él |
| `pieza` | Corte | Pieza plana rectangular tumbada, sin canto manipulado |
| Cualquier otra combinación | — | `null`: el visor no inventa ensamblajes (§0) y el componente muestra el estado vacío |

Cuatro decisiones a conocer antes de tocar el ensamblaje:

- **Los dientes van a plena altura y con la base a ras del frontal, no en escalera.** En los
  dibujos de referencia de las Figuras 2 y 3 el borde inferior de la nariz es una sola recta: un
  diente engorda la nariz un grosor, no la escalona. (Corregido 2026-07-29 midiendo los SVG
  vectorizados; antes se dibujaba una escalera descendente.)
- **La Figura 4 no lleva dientes, y su nariz es maciza.** El retorno engorda la nariz hacia dentro
  (`nariz = grosor + retorno`) **sin dejar hueco** entre la tapa y el retorno: en volumen es un
  bloque entero (2026-07-29, indicación directa). Se ve como junta encolada, no como pestaña.
  (Antes se le dibujaban dos dientes *y* el retorno, y luego un ⊏ hueco.)
- **El nº de dientes se decide por `figura.id`** (`DIENTES_POR_FIGURA` en
  `src/viewer/geometria.ts`): las Figuras 1–3 comparten receta `[tapa, frontal]`, así que la
  sección se distingue por id — igual que el doble canto romado del pasamanos romo. Es solo
  representación: la ocupación y la tarifa no cambian. PROVISIONAL hasta el croquis acotado
  oficial de taller (§3). Ver [PENDIENTES.md](../PENDIENTES.md) §2.
- **Los pasamanos repiten la sección de su peldaño equivalente en espejo** (2026-07-29,
  indicación directa): la nariz (y el retorno en Pasamanos 4) también en el canto opuesto; el
  pasamanos romo redondea ambos cantos.

### Suplementos que se ven en la pieza

Los suplementos que se cobran **por cm** recorren la pieza de punta a punta, así
que son rasgos de la sección y la extrusión los reproduce exactos. `VisorPieza`
recibe los ids activos en la prop `suplementos` y `rasgosDeSuplementos`
(`src/viewer/geometria.ts`) los traduce a `SuplementosSeccion`:

| Suplemento | Cómo se representa |
|---|---|
| Tres ranuras antideslizantes | Tres muescas en la cara de huella, desde el canto delantero hacia dentro |
| Ranura (goterón) | Una muesca en el canto INFERIOR del frontal, centrada en su grueso — por ahí escurre el agua que baja por la contrahuella. En el peldaño romo, que no tiene frontal, va en la cara inferior junto al canto delantero. En los pasamanos, en los dos frontales |
| Material espesado | La tapa se monta con el doble de grosor (una capa más); la nariz sigue siendo de tejuelos del grosor de baldosa. En el peldaño romo engorda la losa entera y con ella su canto romado (el vuelo es una fracción del espesor, así que crece con él) |
| **Angular** | **No se representa**: se cobra por pieza, es un remate del extremo y no se puede expresar en la sección. Ver PENDIENTES.md |

Las medidas de las ranuras y el factor del espesado son **PROVISIONALES**: la
tarifa nombra los trabajos pero no los acota. Solo afectan al dibujo — ni la
ocupación ni la tarifa dependen de ellos. Un id que no esté en el mapa
simplemente no cambia la forma: el visor nunca inventa geometría (§0).

El mismo `construirSeccion` alimenta el croquis del PDF, así que la orden de
trabajo enseña dónde van las ranuras.

Las uniones a 45° entre tapa y frontal (y entre frontal y retorno en la Figura 4) son **juntas
internas** de la pieza encolada, así que no aparecen en el contorno de la sección: se ven en las
miniaturas del paso ② pero no cambian el sólido. Por qué una extrusión y no un apilado de cajas:
la base a ras de los dientes y las uniones salen exactas, no hay caras coincidentes (z-fighting)
y la textura se ajusta una sola vez a la pieza — con varias mallas, `remapearUvAAjuste` estiraba
la imagen completa sobre **cada** caja.
- **`GROSOR_BALDOSA_PROVISIONAL = 10 mm`** (`src/viewer/geometria.ts:37`). Ni `parametros.json`
  ni `Material.formato` recogen el grosor de la baldosa, así que el frontal, los dientes, el
  retorno, el listón y la pieza de corte se dibujan con esta constante de desarrollo.
  **PROVISIONAL**: solo afecta a la representación, nunca al cálculo. Ver PENDIENTES.md §2.

### Estados vacíos

Mientras no haya pieza que dibujar, el componente muestra un mensaje centrado en lugar de la
escena (`src/viewer/VisorPieza.tsx:106`):

| Situación | Mensaje |
|---|---|
| WebGL no disponible | «No se pudo iniciar el visor 3D (WebGL no disponible en este navegador).» |
| Sin material o sin figura | «Selecciona material y figura para ver la pieza» |
| Figura sin receta (`componentes` vacío) | «Esta figura aún no tiene representación 3D (croquis pendiente de taller, §3).» |
| Medidas incompletas o inválidas | «Introduce las medidas para generar la pieza» |

## Cotas

Cada medida presente en la receta genera una cota (`CotaPieza`, `src/viewer/geometria.ts:45`):
id de la medida, valor en `Mm`, eje (`x`/`y`/`z`), plano de apoyo y extremos `desde`/`hasta` en
unidades de escena ya centradas.

`crearGrupoCotas(cotas, cajaLocal, dimensionMaxima)` (`src/viewer/cotas.ts:135`) dibuja por cada
cota:

- La línea de cota, dos extensiones desde la pieza y remates en los extremos — todo en un único
  `THREE.LineSegments` (color `slate-500`).
- Una etiqueta con el valor formateado por `formatearCotaCm` (`src/domain/units.ts:29`: locale
  `es-ES`, máximo 1 decimal; p. ej. «120,5 cm»).

El plano decide dónde se apoya la línea respecto a la caja envolvente (`trazarCota`,
`src/viewer/cotas.ts:79`):

| Plano | Eje | Posición |
|---|---|---|
| `frenteInferior` | X | Delante de la pieza, a la altura de su base (longitud/largo) |
| `lateralDerecho` | Z | A la derecha, a la altura de la base (fondo/ancho) |
| `lateralIzquierdo` | Z | A la izquierda (retorno de la Figura 4, para no chocar con la cota del fondo) |
| `verticalFrontal` | Y | En la esquina delantera derecha (altura del frontal, altura del rodapié) |

Detalles de legibilidad:

- Márgenes, remates y altura de etiqueta escalan con `dimensionMaxima`, acotados para piezas
  pequeñas y grandes (`margen = máx(dim × 0,12; 1,4)`, etiqueta entre 1,6 y 4 unidades).
- Las etiquetas son sprites de canvas con `depthTest: false` a propósito: se leen siempre, gire
  lo que gire la cámara, sin overlays HTML proyectados a mano.
- El texto se rasteriza con supersampling ×4 para verse nítido; sin canvas 2D (tests headless)
  se devuelve un sprite vacío y el resto funciona igual.

## Escena three.js

`EscenaVisor` (`src/viewer/escena.ts:16`) encapsula renderer, cámara, luces y controles. La
escena **se crea una vez por montaje** del componente y se destruye entera al desmontar; al
cambiar figura, medidas o textura solo se sustituye el grupo de la pieza.

Configuración de la escena:

- `WebGLRenderer` con antialias, `pixelRatio` limitado a 2 y salida sRGB; fondo `slate-100`.
- Cámara perspectiva (fov 40) y luz de «pieza aislada»: `HemisphereLight` suave + dos
  direccionales (principal 1,9 y relleno 0,65), sin suelo ni sombras.
- `OrbitControls`: rotar + zoom con amortiguación (0,08); desplazamiento lateral desactivado
  para no perder la pieza de vista; distancia máxima 1500.
- `ResizeObserver` sobre el contenedor: al cambiar de tamaño actualiza el `aspect` de la
  cámara y el tamaño del renderer.
- Bucle `requestAnimationFrame` que actualiza controles y renderiza.

`establecerPieza(raiz)` retira el grupo anterior (liberando sus recursos), añade el nuevo y
encuadra la cámara: calcula la `Box3` del grupo (pieza + cotas), coloca la cámara a distancia
`radio / tan(fov/2) × 1,25` en dirección `(1; 0,62; 1,25)`, ajusta `near`/`far` y guarda esa
vista inicial. El botón «Restablecer cámara» del componente llama a `restablecerCamara()`,
que vuelve a esa vista guardada.

Si el constructor lanza (WebGL no disponible), `VisorPieza` lo captura y muestra el estado
vacío correspondiente: el visor roto no bloquea el resto de la app (§1).

## Materiales y texturas

### Material neutro

Toda pieza se construye con el material neutro (`crearMaterialNeutro`,
`src/viewer/materiales.ts:10`): `MeshStandardMaterial` gris `#9aa4b2`, `roughness` 0,85,
`metalness` 0,02. Es el aspecto por defecto y el de reserva cuando no hay textura.

### De dónde sale la imagen

La textura es `material.imagenUrl` (`src/domain/types.ts:51`). Para artículos del cataleg real
la construye `urlImagenPrestashop` (`src/data/fuenteCataleg.ts:64`) como
`<VITE_PRESTASHOP_IMG_BASE>/<referencia>.jpg` (relación `catálogo.codigo =
PrestaShop.reference`); para artículos encontrados en el índice de búsqueda manda la imagen
real de PrestaShop que trae el índice; en la entrada manual es la URL que teclea el comercial.
El convenio `<base>/<referencia>.jpg` es **PROVISIONAL** — el detalle vive en
[README.md](../README.md) («Conexión a datos reales») y en PENDIENTES.md §4.8.

### Carga no bloqueante

El ciclo de la textura en `VisorPieza` es una máquina de cuatro estados
(`sin → cargando → lista | error`):

1. Sin `imagenUrl`, la pieza se queda con el material neutro y estado `sin`.
2. Con `imagenUrl`, `cargarTextura` (`src/viewer/materiales.ts:19`) carga la imagen con CORS
   anónimo (viene del web service de PrestaShop), en sRGB, con `ClampToEdgeWrapping` y
   anisotropía 8.
3. Si la carga tiene éxito, `aplicarTextura` sustituye el material de todas las mallas.
4. Si falla (imagen rota o sin CORS), la promesa rechaza y el componente cae a `error`: material
   neutro + insignia «Textura no disponible». **Nunca bloquea** (§1).

La insignia «Textura no disponible» se muestra en los estados `sin` y `error`. Si la textura
llega tarde (la pieza ya cambió o el componente se desmontó), se descarta con `dispose()` y no
se aplica.

### Ajuste de la textura a la pieza

La textura se **escala para ajustar** a la pieza (indicación del encargo 2026-07-29, que
reemplaza al mapeo a escala real de 2026-07-28): `remapearUvAAjuste`
(`src/viewer/materiales.ts:45`) reescribe los UV de cada malla para que la imagen completa
cubra la caja envolvente de la pieza — uv = (coordenada − mínimo) / dimensión, usando los
dos ejes dominantes de cada cara — con la misma escala en todas las caras y sin repetir.
Heurística solo visual, sin efecto en el cálculo; no depende del `formato` de la baldosa.

## Gestión de recursos

Regla del visor: todo lo que se crea para la pieza se destruye al sustituirla o al desmontar,
para no dejar memoria GPU ni listeners colgados con cambios rápidos de props.

`liberarObjeto(raiz)` (`src/viewer/recursos.ts:18`) recorre el subárbol liberando de cada nodo
la geometría, los materiales (simples o en array) y sus texturas (`map`).

Los puntos de liberación son:

- `EscenaVisor.establecerPieza`: libera el grupo anterior antes de añadir el nuevo.
- `EscenaVisor.dispose()` (al desmontar): cancela el bucle de animación, desconecta el
  `ResizeObserver`, destruye controles y pieza, y cierra el renderer (`dispose` +
  `forceContextLoss` + retira el canvas del DOM).
- `aplicarTextura` / `sustituirMaterial`: liberan el material neutro al poner la textura.
- `VisorPieza`: libera la textura que llega después de cancelada la carga.

## Cómo la UI integra el visor

El panel derecho del layout (`src/ui/shell/shell.tsx:52`) tiene dos pestañas, **Catálogo** y
**Visor 3D** (primitiva `Pestanas` + estado de `usePanelDerecho`). La pestaña del visor
renderiza `VisorPieza` ocupando la tarjeta entera, sin márgenes:

```tsx
<VisorPieza
  figura={figuraActiva}                      // figuraPorId(config, estado.figuraId)
  medidasMm={medidasMm}                      // useMedidasValidadas(estado, config)
  imagenUrl={estado.material?.imagenUrl ?? null}
  cantidad={/* entero > 0 o undefined */}
/>
```

El panel es `sticky` en escritorio (`lg`), con alto de ventana menos la cabecera. Cuando
`cantidad > 1`, el componente añade al pie la nota «Se muestra 1 pieza de N; la vista de varias
piezas está fuera de alcance.»

## Tests

`tests/visor-geometria.test.ts` cubre el ensamblaje y las cotas. Es lógica pura three.js (sin
renderer ni WebGL), así que corre en jsdom dentro de la suite Vitest (`npm run test`):

- Cada tipo de pieza (L de las Figuras 1–4, ∩ de los Pasamanos 1–4, peldaño romo y pasamanos
  romo, rodapié, corte) se verifica contra su caja envolvente en unidades de escena y sus cotas
  (eje y longitud).
- Además se comprueba el **área de la sección** (`construirSeccion` + `THREE.ShapeUtils.area`):
  es lo que distingue de verdad a las Figuras 1–3, porque su caja envolvente es idéntica. Con
  fondo 30 cm, frontal 5 cm y grosor 1 cm el área es 35, 40 y 45 cm² — cada diente aporta un
  grosor entero de material (5 cm²), que es precisamente lo que se rompería si volviera la
  escalera.
- `construirPieza` devuelve `null` si falta una medida de la receta o la figura no tiene
  componentes.
- Hay un test de determinismo: mismo input, misma caja y mismas cotas.
- `crearGrupoCotas` genera un `LineSegments` único y un sprite por cota.

## Añadir la representación de una figura nueva

1. Define la receta en `public/config/figuras.json` (`componentes` con `largoDe`/`anchoDe`
   apuntando a las medidas de la figura). No hardcodees medidas en el visor.
2. Si la combinación de `id` de componentes ya existe en `ensamblar` (tabla de ensamblajes), no
   hay que tocar código: el visor la dibuja solo.
3. Si es una combinación nueva, añade su función `seccion…` y la rama de `ensamblar` en
   `src/viewer/geometria.ts`, más su test en `tests/visor-geometria.test.ts`. Define la figura
   por su **sección** en (`z`, `y`): la extrusión y el centrado ya están hechos. Hasta hacerlo,
   el visor mostrará el estado vacío «sin representación 3D» a propósito: no inventes
   geometría (§0).
4. Dibuja también su miniatura en `src/ui/steps/MiniaturaFigura.tsx`, que declara la misma
   sección en unidades de dibujo (ver la cabecera de ese módulo).
4. Si necesitas el grosor real de la baldosa, primero hazlo dato de configuración (hoy es la
   constante `GROSOR_BALDOSA_PROVISIONAL`; ver PENDIENTES.md §2).

## Consulta también

- [README.md](../README.md) — puesta en marcha, configuración de negocio y conexión a datos reales.
- [PENDIENTES.md](../PENDIENTES.md) — §2: croquis acotados pendientes y grosor provisional;
  §4.8: índice de búsqueda del catálogo (origen de las imágenes).
- [Arquitectura](./03-arquitectura.md) — visión general de capas (dominio, datos, UI, visor, PDF).
- [Interfaz y estado](./09-interfaz-y-estado.md) — estado global, `useMedidasValidadas` y panel derecho.
