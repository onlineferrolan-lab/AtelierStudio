# Configuración de negocio (`public/config/`)

Referencia de los tres JSON de configuración que sirve Atelier Studio desde
`public/config/`: `tarifas.json` (tarifas de manipulación y suplementos), `figuras.json`
(catálogo de figuras con su receta y regla de tarifa) y `parametros.json` (parámetros de
taller e IVA). Está dirigida a quien edita esos valores (taller/dirección) y a quien
mantenga el cargador (`src/domain/config.ts`). Regla de la especificación: estos datos
nunca se hardcodean en componentes; cambiarlos **no requiere redeploy de código**, solo
sustituir el JSON servido.

> **Aviso de vigencia.** Las tarifas provienen de la *Tarifa Torelos Castellbisbal Juny
> 2023* y varios parámetros son **PROVISIONALES** (marcados abajo). Antes de fiar una
> cotización a producción, confirma la vigencia con taller. El detalle vive en
> [PENDIENTES.md](../PENDIENTES.md).

## Cómo se carga y se valida la configuración

### Ciclo de carga

- La app lee la configuración a través de la interfaz `FuenteConfiguracion`
  (`src/domain/config.ts`), que desacopla el origen de datos: hoy son JSON en `/config`,
  mañana podría ser un Google Sheet (pregunta abierta §6.12) sin tocar motor ni UI.
- `crearFuenteConfiguracionJson()` (`src/domain/config.ts`) descarga en paralelo
  `<base>/config/parametros.json`, `tarifas.json` y `figuras.json`, donde `<base>` es
  `import.meta.env.BASE_URL` (en producción, `/atelier-studio/`).
- En la UI, `ProveedorConfig` (`src/ui/state/config-context.tsx`) dispara la carga **una
  vez al arrancar la página** y expone tres estados: `cargando`, `error` (con el mensaje)
  y `lista`. Los componentes leen la configuración ya validada con `useConfig()`.
- Los tests construyen configuración en memoria con `construirConfiguracion()`, sin red.

### Unidades al cargar (conversiones)

El parseo convierte todo a las unidades enteras del dominio (`src/domain/money.ts`,
`src/domain/units.ts`):

| En el JSON | En el dominio | Conversión |
|---|---|---|
| `eurosPorCm` (tarifas y suplementos) | `Milesimas` (milésimas de €/cm, enteras) | `round(euros × 1000)` — máximo 3 decimales |
| `eurosPorPieza`, `arranqueMaquinaEuros` | `Centimos` (céntimos enteros) | `round(euros × 100)` |
| `umbralCm` (regla `porUmbral`) | `Mm` enteros | `round(cm × 10)` |
| `discoMm`, `toleranciaMm`, `saneadoPorLadoMm` | `Mm` enteros | sin conversión: deben ser **enteros** o la carga falla |

Todos los precios de los JSON son **sin IVA**; el IVA se aplica después según
`parametros.json → ivaPorcentaje`.

### Validación

`validarConfiguracion()` (`src/domain/config.ts`) comprueba las referencias cruzadas tras
el parseo. Si hay errores, `cargar()` lanza y la UI muestra el mensaje en pantalla: la app
no arranca con configuración incoherente. Comprueba, **solo para figuras `activa`**:

- Toda figura activa tiene regla de tarifa.
- Todos los `tarifaId` de la regla existen en `tarifas.json` (error «tarifa desconocida»).
- Todos los ids de `suplementos` existen en `tarifas.json` (error «suplemento desconocido»).
- Todo componente usa medidas declaradas en la propia figura (`largoDe`/`anchoDe`).

Lo que **no** se valida hoy (revísalo a mano al editar): unicidad de ids (un `id`
duplicado en `tarifas.json` pisa silenciosamente al anterior), rangos de los parámetros,
coherencia `minCm`/`maxCm`, y que `longitudTarifa` o la medida de una regla `porUmbral`
apunten a medidas declaradas.

### Caché: `Cache-Control: no-store`

La configuración puede cambiar entre despliegues, así que no debe cachearse:

- En la imagen Docker, nginx sirve `/config/` con `Cache-Control: no-store`
  (`nginx.conf.template`), mientras los assets con hash de Vite llevan caché larga e
  inmutable. El navegador siempre pide la versión actual del JSON.
- En desarrollo, `npm run dev` sirve `public/` directamente; basta recargar la página.
- En el despliegue Plesk el README declara `/config` como `no-store`; si montas otro
  servidor, reproduce esa cabecera o los cambios de tarifa podrían no llegar a los
  navegadores.

En cualquier caso, un cambio de configuración se aplica **recargando la página**: no hay
que recompilar el bundle JavaScript.

## `tarifas.json` — tarifas de manipulación y suplementos

Fuente: `public/config/tarifas.json`. Precios sin IVA. El campo `_nota` es un comentario
libre que el parser ignora (igual en los otros dos JSON).

### `tarifas[]` — tarifa lineal de manipulación

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `id` | string | — | Identificador único; `figuras.json` lo referencia. Renombrarlo exige revisar las figuras. |
| `nombre` | string | — | Etiqueta legible (se muestra en el desglose). |
| `eurosPorCm` | number | € por cm lineal | Hasta 3 decimales; se convierte a milésimas de €. |

Tarifas actuales (€/cm, sin IVA): `f1-frontal-le5` 0,19 · `f1-frontal-gt5` 0,23 ·
`figura-2` 0,23 · `figura-3` 0,25 · `figura-4` 0,29 · `peldano-romo` 0,045 ·
`rodapie-estandar` 0,017 · `rodapie-estandar-pintado` 0,025 · `rodapie-no-estandar` 0,034
· `rodapie-no-estandar-pintado` 0,042 · `corte` 0,017.

Las cuatro de rodapié las comparten las **nueve** figuras de rodapié: se tarifa por
ALTURA (7,2 y 8 van juntas; «a medida» aparte), nunca por canto, porque el canto recto
«no tiene incremento» (2026-07-31, indicación directa). Por eso sus `nombre` no citan
ningún canto: salen tal cual en el desglose y en la orden de trabajo.

### `suplementos[]` — suplementos opcionales del paso ④

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `id` | string | — | Identificador único; las figuras listan los suyos por id. |
| `nombre` | string | — | Etiqueta legible (p. ej. «Tres ranuras antideslizantes»). |
| `tipo` | string | — | `porPieza` (importe fijo por pieza) o `porCm` (por cm lineal). |
| `eurosPorPieza` | number | € por pieza | Solo con `tipo: "porPieza"`; se convierte a céntimos. |
| `eurosPorCm` | number | € por cm lineal | Solo con `tipo: "porCm"`; hasta 3 decimales (milésimas). |

Cada suplemento lleva **uno** de los dos campos de precio, según su `tipo`. Hoy hay dos
familias con precios distintos: `*-f14` (Figuras 1–4) y `*-romo` (peldaño romo).

## `figuras.json` — catálogo de figuras

Fuente: `public/config/figuras.json`. Las recetas de las figuras activas son
**PROVISIONALES**: se deducen de los dibujos de la tarifa PDF mientras taller no entrega
el croquis acotado oficial (§3, ver [PENDIENTES.md](../PENDIENTES.md)).

### Campos de cada figura

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (p. ej. `figura-1`, `peldano-romo`). |
| `nombre` | string | Nombre visible en la galería. |
| `estado` | string | `activa` (usable) o `pendiente` (visible pero bloqueada). |
| `motivoPendiente` | string \| null | Explicación visible cuando `estado` es `pendiente`; `null` en activas. |
| `croquisPendiente` | boolean | `true` mientras el croquis acotado oficial siga pendiente (§3); la galería muestra la insignia «croquis provisional». |
| `medidas` | array | Campos que introduce el comercial en el paso ③ (ver tabla siguiente). |
| `componentes` | array | Receta: piezas que componen la figura (tapa, frontal, retorno…). |
| `tarifa` | objeto \| null | Regla que elige la tarifa lineal (ver abajo); `null` en figuras pendientes. |
| `longitudTarifa` | objeto \| null | A qué longitud se aplica la tarifa (ver abajo); `null` en pendientes. |
| `suplementos` | string[] | Ids de suplementos de `tarifas.json` aplicables a esta figura. |
| `tienePintado` | boolean | `true` si la tarifa depende del conmutador «Pintado» del paso ④ (rodapiés). |
| `medidaPorMetros` | string \| null | Opcional (`null` por defecto). Id de la medida que puede deducirse de los metros pedidos: habilita el segundo modo de cálculo del paso ③ (metros + unidades → largo por pieza). Hoy `"longitud"` en los nueve rodapiés y `null` en el resto. Debe existir en `medidas[]`. |

### `medidas[]` — campos de entrada en cm

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `id` | string | — | Nombre de la medida usado por la receta (`longitud`, `fondo`, `alturaFrontal`…). |
| `etiqueta` | string | — | Etiqueta de UI, p. ej. `Largo (cm)`. Es lo único que ve el comercial: los `id` internos pueden no coincidir (el id `longitud` se rotula «Largo (cm)» y `fondo`, «Ancho (cm)»; 2026-07-30). El ORDEN del array es el orden en que se piden en el paso ③ y en el PDF — hoy el ancho antes que el largo. |
| `minCm` | number | cm | Mínimo admitido (admite decimales, p. ej. `7.2`). |
| `maxCm` | number \| null | cm | Opcional; máximo admitido. Si se omite, queda `null` (sin tope). |
| `opcionesCm` | number[] \| null | cm | Opcional; si está presente, la medida solo puede tomar uno de esos valores (se dibuja como control segmentado). **Hoy no lo usa ninguna figura**: la altura de los rodapiés dejó de ser una elección el 2026-07-31 y pasó a ir en el nombre de la figura. |
| `valorFijoCm` | number \| null | cm | Opcional; medida que NO teclea el comercial porque la fija la propia figura (altura de los rodapiés de 7,2 y de 8). La UI la enseña en solo lectura y el motor la da por puesta. Tiene que cumplir el `minCm`/`maxCm`/`opcionesCm` del propio campo (lo valida `validarConfiguracion` al cargar). |

### `componentes[]` — receta de la figura

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Nombre del componente (`tapa`, `frontal`, `retorno`, `liston`, `pieza`). |
| `largoDe` | string | Id de la medida de la que sale el largo del componente. |
| `anchoDe` | string | Id de la medida de la que sale el ancho del componente. |
| `canto` | string \| null | Opcional, solo el componente `liston`: `recto`, `microbiselado` o `romado`. Cambia el remate superior que se dibuja en la miniatura, el visor 3D y el croquis del PDF; **nunca** la tarifa. Sin declarar (`null`) se dibuja romado. |

`largoDe` y `anchoDe` deben existir en `medidas[]` de la misma figura (lo valida
`validarConfiguracion`).

### `tarifa` — regla de selección de tarifa

Tres tipos, discriminados por `tipo`:

| `tipo` | Campos | Cuándo se usa |
|---|---|---|
| `fija` | `tarifaId` | Una sola tarifa lineal (Figuras 2–4, peldaño romo, corte). |
| `porUmbral` | `medida`, `umbralCm`, `tarifaIdMenorOIgual`, `tarifaIdMayor` | La tarifa depende de una medida. Figura 1: `alturaFrontal` ≤ 5 cm → `f1-frontal-le5`; > 5 cm → `f1-frontal-gt5`. |
| `pintable` | `tarifaId`, `tarifaIdPintado` | Tarifa base y tarifa alternativa si el paso ④ marca «Pintado» (rodapiés). |

Todos los `tarifaId*` deben existir en `tarifas.json`.

### `longitudTarifa` — base de la tarifa lineal

| `tipo` | Campos | Significado |
|---|---|---|
| `medida` | `medida` | La tarifa se aplica a esa medida de la pieza (habitualmente `longitud`). |
| `perimetro` | `largoDe`, `anchoDe` | Se tarifa el perímetro completo 2·(largo+ancho). Lo usan `corte` y el zócalo de la `tabica`; es **PROVISIONAL** (¿o solo los cortes nuevos? — [PENDIENTES.md](../PENDIENTES.md) §4.3). |

### `tarifaAdicional` — figuras compuestas (2026-07-31)

Campo **opcional**: solo lo lleva la `tabica`, que es «una figura 1 con un corte debajo a
modo de zócalo, y el precio es el de las dos combinadas». Contiene su propia `tarifa` y su
propia `longitudTarifa`, con la misma forma que las principales:

```json
"tarifaAdicional": {
  "tarifa": { "tipo": "fija", "tarifaId": "corte" },
  "longitudTarifa": { "tipo": "perimetro", "largoDe": "longitud", "anchoDe": "alturaZocalo" }
}
```

Genera una **línea de manipulación propia**, no se funde con la principal: así el desglose
enseña de qué se compone el precio, y cada parte redondea una sola vez por pieza en vez de
encadenar un redondeo sobre otro. `validarConfiguracion` comprueba también sus referencias,
de modo que una tarifa mal escrita aquí se detecta como error de configuración y no revienta
al calcular.

La tabica comparte el **largo** entre las dos partes (es el único parámetro común) y trata el
zócalo como un componente más de la misma pieza, así que entra en la ocupación de la baldosa
(veta §4) y puede hacer que la pieza no quepa.

### Figuras `pendiente`: qué significa

Una figura con `estado: "pendiente"` aparece en la galería pero **bloqueada**: sin tarifa
confirmada no se puede cotizar (§6.5, §6.6). Convención:

- `tarifa` y `longitudTarifa` van a `null`; `medidas`, `componentes` y `suplementos` van
  vacíos; `motivoPendiente` explica el motivo.
- `validarConfiguracion` las ignora: no exigen regla de tarifa ni referencias válidas.

Figuras pendientes hoy: **ninguna** — Figura 5, vierteaguas y rodapié recto se retiraron
de la galería (2026-07-29, a petición de dirección) y su seguimiento vive en
[PENDIENTES.md](../PENDIENTES.md) §1.5–§1.6. Para dar una de alta,
rellena su receta y regla de tarifa y añádela como `activa` — no se inventa nada que
taller no haya confirmado (regla §0).

Los pasamanos (`pasamanos-1`…`pasamanos-4`, `pasamanos-romo`) ya están activos (2026-07-29,
a petición del maestro): misma receta que su peldaño equivalente con la manipulación en el
lado opuesto (`frontal-trasero`, `retorno-trasero`, doble media caña). Su tarifa repite
**PROVISIONALMENTE** el precio del peldaño equivalente hasta que taller confirme (§6.6).

## `margenes.json` — margen comercial por subfamilia (2026-07-31)

**Generado, no editable a mano.** `npm run margenes -- <csv>` convierte el CSV de
subfamilias del ERP (`datos-fuente/marge-subfami.csv`) a `public/config/margenes.json`.
El CSV viene en **cp1252**, no en UTF-8: leerlo como UTF-8 parte las Ñ y los acentos, y el
script lo decodifica explícitamente.

```json
{
  "longitudSubfamilia": 4,
  "subfamilias": { "9411": { "nombre": "CASA INFINITA", "pvp": 6600, "contratista": 6600 } }
}
```

- La **clave es la subfamilia**: los **4 primeros dígitos de la referencia** del artículo.
  La referencia `94111301` es de la subfamilia `9411`. Cubre el 98,3 % de los 28.732
  artículos del índice.
- `pvp` es **MTP** y `contratista` es **MTC**, en **centésimas de punto enteras**
  (44,93 % → 4493). En las 726 filas MTC ≤ MTP.
- Es un margen **sobre coste**: `precio = coste × (1 + m/100)`. Se deduce del dato — hay
  subfamilias con MTP de 100 y hasta 200, y un margen sobre precio de venta del 100 %
  sería una división por cero.
- Las filas con `ACTIVA` distinto de `T` se **omiten**: si el ERP dio de baja una
  subfamilia, no debe cotizarse con su margen sin que nadie lo revise.

Si un artículo no tiene subfamilia en la tabla, **no se cotiza**: la herramienta lo dice y
el margen se indica a mano en «Parámetros avanzados». Ver
[PENDIENTES.md](../PENDIENTES.md) §6.

## `parametros.json` — parámetros de taller

Fuente: `public/config/parametros.json`. Los valores **PROVISIONAL** están pendientes de
taller o dirección: no son valores reales confirmados (ver [PENDIENTES.md](../PENDIENTES.md)).

| Campo | Tipo | Unidad | Valor actual | Descripción |
|---|---|---|---|---|
| `discoMm` | number entero | mm | 3 — **PROVISIONAL** (§6.2) | Ancho del disco de corte; se descuenta en el cálculo de ocupación. |
| `toleranciaMm` | number entero | mm | 2 — **PROVISIONAL** (§6.3) | Tolerancia de fabricación por fila de colocación. |
| `saneadoPorLadoMm` | number entero | mm | 5 — **PROVISIONAL** (§6.4) | Saneado por lado de la baldosa; hoy se aplica 2× por fila de colocación. Cuándo aplica está pendiente. |
| `mermaPorcentajeDefecto` | number | % | 10 | Solo de reserva: se usa cuando aún no hay material elegido y por tanto no hay formato del que deducir la merma. |
| `mermaEditable` | boolean | — | `true` — **PROVISIONAL** (§6.10) | Si es `false`, el campo de merma se muestra bloqueado al comercial. |
| `mermaLadoMenorCm` / `mermaPorcentajeLadoMenor` | number | cm / % | 60 / 10 | Extremo bajo del tramo: con ese lado mayor o menos, esa merma. |
| `mermaLadoMayorCm` / `mermaPorcentajeLadoMayor` | number | cm / % | 120 / 20 | Extremo alto: con ese lado mayor o más, esa merma. En medio se interpola. |
| `mermaExtraFiguraPuntos` | number | puntos % | 5 | Lo que SUMAN las figuras de la lista de abajo (10 → 15, no 10,5). |
| `mermaFigurasConExtra` | string[] | — | `figura-1..4`, `pasamanos-1..4` | Qué figuras llevan el extra. En configuración, no en código (§0). |

### Merma sugerida por formato (2026-07-31)

La merma ya no es un número fijo: se **propone** a partir del formato de la baldosa y el
comercial puede sobrescribirla, igual que el precio del material. La regla —indicación
directa— es una interpolación **lineal sobre el lado mayor** de la baldosa:

```
lado mayor ≤ 60 cm   → 10 %
lado mayor ≥ 120 cm  → 20 %
en medio             → proporcional (90 cm → 15 %)
```

Ojo con un caso que despista: una baldosa de **60x60 se queda en el 10 %**, igual que la de
30x60, porque lo que manda es el lado mayor y no la superficie. Está anotado en
[PENDIENTES.md](../PENDIENTES.md) §7 por si la intención era otra.

Vive en `src/domain/engine/merma.ts` y calcula en centésimas de punto **enteras**, para que
un tramo que caiga en 16,666… % dé un valor estable y no un float arrastrado.
| `arranqueMaquinaEuros` | number | € sin IVA | 60 | Arranque de máquina por orden de trabajo (§2); se convierte a céntimos. Cuándo aplica exactamente sigue abierto ([PENDIENTES.md](../PENDIENTES.md) §4.2). |
| `ivaPorcentaje` | number | % | 21 | IVA aplicado al total. |

Los tres campos en mm deben ser enteros: `mm()` rechaza decimales y la carga falla con
mensaje claro.

## Cambiar una tarifa sin redeploy de código

Ejemplo: subir la tarifa del peldaño romo de 0,045 a 0,05 €/cm.

1. Abre el `tarifas.json` que sirve la app: en producción (Plesk), el de
   `atelier-studio/config/tarifas.json` dentro del docroot; en local,
   `public/config/tarifas.json`.
2. Cambia solo el número de `eurosPorCm` de la entrada `peldano-romo`, con punto decimal
   y como máximo 3 decimales. No toques `id` ni `nombre`.
3. Guarda el archivo. Comprueba que el JSON sigue siendo válido (sin comas finales ni
   comillas simples); si dudas, pásalo por un validador JSON.
4. Recarga la página de la app (Ctrl+F5 si el navegador se resiste). Cotiza un peldaño de
   prueba y verifica el nuevo importe en el desglose.

Precauciones:

- **No renombres ni borres ids** referenciados desde `figuras.json`: la validación lo
  detecta («tarifa desconocida '…'») y la app no arranca hasta corregirlo.
- **No dupliques ids** dentro de `tarifas.json`: el último pisa al anterior sin avisar.
- Los cambios aplican a cotizaciones nuevas; los PDF ya emitidos no se recalculan.
- Si editas la copia del repositorio (`public/config/`), recuerda subir ese archivo al
  servidor: lo que vale es la copia servida. En Docker, los JSON viajan dentro de la
  imagen (`/usr/share/nginx/html/config/`).
- Lo mismo aplica a `figuras.json` y `parametros.json`, con una cautela extra: los mm
  deben ser enteros y una figura `activa` debe tener tarifa y referencias válidas.

## Consulta también

- [Arquitectura de la aplicación](./03-arquitectura.md) — dónde vive el motor puro y cómo
  encaja la configuración en el resto de módulos.
- [README.md](../README.md) — puesta en marcha, despliegue (Plesk/Docker) y reglas de oro.
- [PENDIENTES.md](../PENDIENTES.md) — estado de cada valor PROVISIONAL y quién lo responde.
- [AGENTS.md](../AGENTS.md) — reglas irrompibles del repo (unidades enteras, nada
  hardcodeado, lo pendiente no se inventa).
