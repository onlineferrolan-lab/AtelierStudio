# Motor de cálculo

Este documento explica cómo funciona el motor de cálculo de Atelier Studio (`src/domain/engine/`):
las etapas del pipeline de cotización, las unidades con marca (`Centimos`, `Mm`, `Milesimas`),
por qué están prohibidos los floats, cómo se devuelven los errores y los helpers de formato.
Está dirigido a quien desarrolle o revise reglas de negocio, y a quien quiera entender de dónde
sale cada número de una cotización.

El motor es **puro** (§7.2 de la especificación): nada de `src/domain/engine/` importa React,
fetch, DOM ni librerías externas. Es **determinista**: misma entrada → mismo resultado. Y devuelve
los errores de validación **como valor** (`SalidaMotor`): nunca lanza una excepción por entrada
de usuario.

## API pública

`src/domain/engine/index.ts` exporta el contrato del scaffold (no modificar):

| Función | Módulo | Qué hace |
|---|---|---|
| `calcularCotizacion(entrada, config)` | `src/domain/engine/cotizacion.ts` | Pipeline completo: devuelve `SalidaMotor`. |
| `validarMedidasCrudas(figura, crudas)` | `src/domain/engine/validacion.ts` | Valida el texto tecleado (cm) contra los campos de la figura y lo convierte a `Mm`. |
| `resolverTarifa(figura, medidasMm, config)` | `src/domain/engine/tarifas.ts` | Resuelve la tarifa lineal según la regla de la figura. |
| `longitudTarifaMm(figura, medidasMm)` | `src/domain/engine/tarifas.ts` | Longitud (mm) a la que se aplica la tarifa y los suplementos por cm. |
| `figuraPorId(config, figuraId)` | `src/domain/engine/index.ts` | Busca una figura por id en la configuración. |

Las tarifas, figuras y parámetros llegan siempre en el parámetro `config` (tipo `Configuracion`
de `src/domain/config.ts`, cargado de `public/config/*.json`). El motor **nunca** lee valores
hardcodeados: cambiar una tarifa es editar un JSON, no tocar código.

## Unidades con marca: por qué no hay floats

Regla irrompible de la especificación (§1): **dinero en céntimos enteros, geometría en milímetros
enteros**. Los floats de IEEE 754 acumulan errores de representación (`0.1 + 0.2 !== 0.3`), así
que dos caminos de cálculo equivalentes podrían dar importes distintos. Trabajando con enteros la
aritmética es exacta y el redondeo ocurre una sola vez, en un punto conocido.

`src/domain/types.ts` define tres marcas (*branded types*) sobre `number` con `unique symbol`:

| Marca | Unidad | Ejemplo | Constructor |
|---|---|---|---|
| `Mm` | milímetros enteros | 50 cm → `500` | `mm()`, `cmAMm()` en `src/domain/units.ts` |
| `Centimos` | céntimos de euro enteros | 54,00 € → `5400` | `centimos()`, `eurosACentimos()` en `src/domain/money.ts` |
| `Milesimas` | milésimas de euro enteras (unidad de las tarifas) | 0,045 €/cm → `45` | `milesimas()`, `eurosAMilesimas()` en `src/domain/money.ts` |

La marca hace que TypeScript rechace mezclar unidades (`Mm` no es asignable a `Centimos`).
Las funciones constructoras lanzan `Error` si reciben un no entero: son una guarda interna que
detecta bugs, no un camino alcanzable con entrada de usuario.

Puntos clave de la aritmética (`src/domain/money.ts`):

- Las conversiones de entrada redondean en la frontera: `cmAMm(7.15)` → `72` mm; la comparación
  de mínimos/máximos/opciones se hace ya en mm (`src/domain/engine/validacion.ts`). Que 7,15 cm
  se redondee a 72 mm antes de comparar con un mínimo de 7,2 cm es una decisión consciente,
  pendiente de confirmar (ver `PENDIENTES.md` §4.5).
- El largo deducido del modo «por metros» de los rodapiés (`metros × 100 ÷ unidades`) entra por
  esa misma frontera: se redondea a mm enteros igual que un largo tecleado, así que el total
  facturado puede quedar unos milímetros por encima o por debajo de los metros pedidos.
- **Único redondeo del dinero**: `milesimasACentimos()` convierte milésimas acumuladas a céntimos
  con redondeo half-up, una vez por línea de cotización.
- `aplicarTarifaLineal(tarifaPorCm, longitudMm)` calcula `tarifa × (mm / 10)` milésimas y aplica
  ese único redondeo half-up a céntimos.
- El coste de material usa aritmética entera mm²·céntimos con half-up exacto
  (`halfUpPartePorMillon` en `src/domain/engine/cotizacion.ts`): `floor((n + 500000) / 1e6)`.
- Los floats solo aparecen en la frontera de presentación (p. ej. `m2Facturados`, un valor
  informativo para mostrar), nunca en importes ni en la geometría del cálculo.

## El pipeline de cotización

`calcularCotizacion()` (`src/domain/engine/cotizacion.ts`) ejecuta estas etapas en orden. Si
cualquiera produce errores, devuelve `{ ok: false, errores }` y no sigue calculando.

### 1. Figura y validación de entrada

- La figura debe existir y estar `estado: "activa"`. Las figuras `pendiente` (sin tarifa
  confirmada, §6) se rechazan con un mensaje que incluye `motivoPendiente`.
- `validarEntrada()` acumula **todos** los errores antes de fallar: cantidad entera ≥ 1, merma
  ≥ 0, medidas presentes y en rango (`revalidarMedidasMm` — el motor no confía en que la UI haya
  validado antes), referencias de la receta y la tarifa a medidas declaradas, tarifas existentes,
  suplementos existentes/aplicables/con precio coherente, precio de material disponible y datos
  de caja (`piezasPorCaja` entero ≥ 1 y `m2PorCaja` > 0), que hacen falta **siempre** porque se
  factura por cajas completas.
- La validación de texto crudo en la UI (`validarMedidasCrudas`) acepta coma o punto decimal
  (teclado es-ES) y genera un mensaje concreto por medida (§1.③), nunca uno genérico.

### 2. Componentes de la pieza

`construirComponentes()` aplica la receta de la figura (`componentes` en
`public/config/figuras.json`): cada componente toma su largo y su ancho de las medidas de la
pieza (`largoDe` / `anchoDe`). Las recetas actuales son PROVISIONALES, deducidas de los dibujos
de la tarifa PDF mientras el croquis acotado oficial sigue pendiente (§3; ver `PENDIENTES.md` §2).

### 3. Ocupación sobre la baldosa (§4)

`evaluarOcupacion()` (`src/domain/engine/ocupacion.ts`) comprueba si los componentes de UNA
pieza caben en la baldosa. Receta PROVISIONAL (pendiente de §6.2, §6.3, §6.4):

```
ocupación = Σ anchos de componentes
          + (nº componentes − 1) × discoMm      ← nº de cortes provisional
          + 2 × saneadoPorLadoMm                ← se sanea siempre, ambos lados
          + toleranciaMm                        ← una vez por fila de colocación
```

Debe cumplirse `ocupación ≤ dimensión útil` y `largo de cada componente ≤ la otra dimensión`.
Se prueban **ambas orientaciones** (natural y baldosa girada 90°) y se prefiere la natural
cuando cabe — la regla exacta de giro por figura también está pendiente del croquis (§4).
Si no cabe, el error incluye los números reales («La pieza necesita … de ancho; el formato solo
permite …»).

### 4. Baldosas de origen y merma

- Regla de veta (§4): todos los componentes de una pieza salen de la **misma** baldosa.
- Empaquetado (indicación de dirección 2026-07-28): de una baldosa pueden salir **varias
  piezas completas**. `piezasPorBaldosa` se calcula en `ocupacion.ts` como rejilla
  provisional sobre la orientación elegida: a lo ancho, el máximo n con
  `n·anchoPieza + (n−1)·disco + 2·saneado + tolerancia ≤ dimColocación`; a lo largo, el
  máximo m con `m·largoMáx + (m−1)·disco ≤ dimLargos` (anchoPieza = Σ anchos +
  (nº componentes − 1)·disco). Entonces `baldosasNecesarias = ceil(cantidad /
  piezasPorBaldosa)`. No se mezclan piezas en la misma fila ni se reutilizan sobrantes
  (fuera de la v1, §8).
- Merma: `baldosasConMerma = ceil(baldosas × (1 + %/100))` con división entera exacta; el %
  se cuantiza a centésimas de punto (10,25 %…) para no usar floats. La condición «mínimo 3»
  **no** se implementa (§6.1, pendiente).
- **De dónde sale ese %** (2026-07-31): ya no es un valor fijo de configuración. Se
  **sugiere** a partir del formato de la baldosa (`merma.ts`): interpolación lineal sobre el
  **lado mayor**, 10 % hasta 60 cm y 20 % desde 120 cm, más 5 puntos en las figuras
  numeradas. El comercial puede sobrescribirla; el estado guarda solo su edición, así que
  mientras no la toque la sugerencia se recalcula sola al cambiar de material o de figura.
  Ver [Configuración](./04-configuracion.md#merma-sugerida-por-formato-2026-07-31).

### 5. Facturación por cajas completas

Siempre por cajas completas: `cajasFacturadas = ceil(baldosasConMerma / piezasPorCaja)` y
`unidadesFacturadas = cajas × piezasPorCaja`; todo el sobrante se cobra al cliente. Los mínimos
de compra no están implementados (§6.8).

> **Cambio del 2026-07-30 (indicación directa).** Antes había un origen de material
> (`stock` → por piezas / `pedido` → por cajas). Ahora también el stock se factura por cajas, así
> que el origen dejó de cambiar el importe y **se suprimió**: ni estado, ni selector, ni campo en
> el PDF. En su hueco de la orden de trabajo va el dato de caja, que es lo que explica en taller
> por qué se facturan más piezas de las necesarias.

### 6. Coste de material

- Material del ERP: `m² = cajas × m2PorCaja` (el `m2PorCaja` del ERP se cuantiza a mm² enteros).
  El importe es `mm² × céntimos/m²` con half-up exacto.
- Material manual: `precioUnidadCentimos × unidadesFacturadas`.
- `precioMaterialEditado` (si el comercial lo introduce) sustituye al precio unitario
  correspondiente —€/m² en ERP, €/unidad en manual—; `precioMaterialOriginal` conserva la
  tarifa previa para mostrarla junto al editado. Que TARP sea €/m² es una hipótesis
  documentada (§6; ver `PENDIENTES.md` §4, «Datos y catálogo»).

### 6 bis. Margen comercial (2026-07-31)

Se resuelve **antes de calcular nada**: sin margen no hay precio que dar. La subfamilia
sale de los **4 primeros dígitos de la referencia** del artículo (el material de alta
manual la trae en su propio campo, obligatorio), y de ahí salen los dos márgenes del ERP:
**MTP** (PVP, el de por defecto) y **MTC** (contratista).

Es un **markup sobre coste**: `precio = coste × (1 + m/100)`. Se aplica al **material**, a
**cada línea de manipulación** —suplementos incluidos— y al **arranque de máquina**.

Se aplica **línea a línea**, no sobre el total, para que el desglose de la pantalla y de la
orden de trabajo **sume** el total exacto. A cambio, cada línea pasa por dos redondeos (el
del coste y el del margen). Ver `engine/margen.ts` y `PENDIENTES.md` §6.

Si la subfamilia del artículo no está en la tabla, el motor **no cotiza** y devuelve un
error de paso `material` que dice la referencia, el prefijo y dónde indicar el margen a
mano. No se inventa un margen ni se cotiza a coste en silencio (§0).

### 7. Manipulación y suplementos

- `resolverTarifa()` aplica la regla de la figura: `fija` o `porUmbral` (Figura 1: frontal
  ≤ 5 cm / > 5 cm).
- `longitudTarifaMm()` obtiene la longitud a tarifar: una `medida` (habitualmente `longitud`)
  o el `perimetro` = 2·(largo+ancho), en «Corte de piezas» y en el zócalo de la tabica
  (PROVISIONAL, pendiente de taller; ver `PENDIENTES.md` §4.3).
- **Figuras compuestas (tabica, 2026-07-31).** Si la figura trae `tarifaAdicional`, se
  resuelve una SEGUNDA tarifa sobre la misma pieza y se emite en su **propia línea**
  (`resolverTarifaAdicional` / `longitudTarifaAdicionalMm`). La tabica es «una figura 1 con
  un corte debajo de zócalo, y el precio es el de las dos combinadas»: la parte de figura 1
  se tarifa por el largo y el zócalo por su perímetro, que comparte ese mismo largo. Cada
  parte redondea una vez por pieza y luego se multiplica por la cantidad, igual que la
  principal; no se suman tarifas antes de redondear ni se redondea sobre lo ya redondeado.
- **Suplementos por pieza: no van en todas.** «Angular» es un remate del extremo del peldaño y
  en un tramo de escalera solo lo llevan las piezas de esquina (2026-07-30, indicación directa).
  `entrada.unidadesSuplemento[id]` dice a cuántas piezas se aplica cada suplemento `porPieza`;
  sin entrada se cobra **una** pieza. El motor rechaza valores no enteros, menores que 1 o
  mayores que la cantidad pedida. Los `porCm` recorren la pieza entera y se aplican siempre a
  toda la cantidad.
- **Orden de redondeo**: la tarifa lineal y cada suplemento `porCm` se calculan **por pieza**
  con un único redondeo half-up, y el importe por pieza se multiplica después por la cantidad
  (entero exacto). Los suplementos `porPieza` son céntimos enteros × **las piezas que lo lleven**
  (ver abajo). Así cada línea redondea una sola vez. Esta decisión está pendiente de confirmación (¿por pieza o sobre la
  longitud total?; ver `PENDIENTES.md` §4.1).
- Las líneas se emiten en el orden de `figura.suplementos` de la configuración (orden canónico
  determinista).

### 8. Arranque de máquina

Una sola vez por orden cuando hay manipulación (§2): `arranqueCentimos` de
`public/config/parametros.json` (60 € editables). Toda figura activa con tarifa genera línea de
manipulación, así que se aplica siempre que el cálculo llega a esta fase. Si debería aplicar
también sin manipulación está pendiente (ver `PENDIENTES.md` §4.2).

### 9. Totales

```
totalSinIva = material + manipulación (con suplementos) + arranque
iva         = aplicarPorcentaje(totalSinIva, ivaPorcentaje)   ← 21 % configurable, half-up
totalConIva = totalSinIva + iva
```

## Errores como valor: `SalidaMotor`

`SalidaMotor` (`src/domain/types.ts`) es una unión discriminada:

```ts
type SalidaMotor =
  | { readonly ok: true; readonly resultado: ResultadoCotizacion }
  | { readonly ok: false; readonly errores: readonly ErrorValidacion[] };
```

Cada `ErrorValidacion` lleva `paso` (`'material' | 'figura' | 'medidas' | 'suplementos'`),
opcionalmente la `medida` concreta que falla, y un `mensaje` en español pensado para el
comercial. En la UI, `null` representa «aún faltan datos para calcular».

Las funciones de bajo nivel de `tarifas.ts` (`resolverTarifa`, `longitudTarifaMm`) sí lanzan
`Error` ante configuración incoherente (tarifa inexistente, medida no declarada), porque eso es
un fallo de configuración, no de entrada de usuario. `calcularCotizacion` comprueba todas las
referencias por adelantado (`tarifasReferenciadas`, `medidasReferenciadas`) y devuelve esos
problemas como `ErrorValidacion`, de modo que la entrada pública nunca lanza.

## Ejemplo trazado: 5 peldaños Figura 2

El caso `tests/golden/ejemplo-001.json` reproduce este cálculo contra la configuración real de
`public/config/`. Ojo: es un **ejemplo NO validado por taller** — ilustra el formato, no es
verdad de negocio— y usa parámetros de ocupación PROVISIONALES (disco 3 mm, tolerancia 2 mm,
saneado 5 mm/lado).

Entrada: baldosa 60×60 cm (600×600 mm) a 25 €/m² (2.500 céntimos/m²), 4 piezas/caja y
1,44 m²/caja; Figura 2 con longitud 50 cm, fondo 30 cm, altura frontal 4 cm; cantidad 5;
suplementos `angular-f14` (2 €/pieza, en **2** de las 5 piezas) y `ranuras-f14` (0,02 €/cm);
merma 10 %.

Es el mismo caso que `tests/golden/ejemplo-001.json`, a propósito: si el motor cambia, salta el
test dorado y esta tabla se revisa con él.

| Etapa | Cálculo | Resultado |
|---|---|---|
| Validación | caída ≥ 4 cm, cantidad 5, tarifa, suplementos y datos de caja existen | sin errores |
| Componentes | tapa 500×300 mm, frontal 500×40 mm | 2 componentes |
| Ocupación | (300+40) + 1×3 + 2×5 + 2 = 355 ≤ 600; largo 500 ≤ 600 | 355 mm, orientación natural |
| Merma | ceil(5 × 11.000 / 10.000) = ceil(5,5) | 6 baldosas |
| Facturación | ceil(6 / 4 piezas por caja) | 2 cajas, 8 unidades |
| Material | 2 × 1,44 m² = 2,88 m² × 2.500 céntimos/m² | 7.200 céntimos (72,00 €) |
| Manipulación | 0,23 €/cm × 50 cm = 11,50 €/ud. × 5 = 57,50 € · Angular 2,00 € × **2** = 4,00 € · Ranuras 0,02 €/cm × 50 cm = 1,00 €/ud. × 5 = 5,00 € | 6.650 céntimos (66,50 €) |
| Arranque | una vez por orden | 6.000 céntimos (60,00 €) |
| Totales | 198,50 € sin IVA; IVA 21 % = round(41,685 €) | 19.850 + 4.169 = 24.019 céntimos (**240,19 €**) |

Las líneas de manipulación resultantes (concepto + importe) son:

```text
Figura 2 — 50 cm × 5 ud.                         57,50 €
Angular — 2 ud.                                   4,00 €
Tres ranuras antideslizantes — 50 cm × 5 ud.      5,00 €
```

## Helpers de formato

El motor genera sus mensajes con helpers sin dependencias externas (solo `Intl` en es-ES):

| Helper | Módulo | Qué devuelve |
|---|---|---|
| `fmtCm(cm)` | `src/domain/engine/formato.ts` | Número de cm legible: `7.2` → `"7,2"`. |
| `cota(mm)` | `src/domain/engine/formato.ts` | Cota en cm desde mm: `900 mm` → `"90 cm"`. |
| `nombreMedida(etiqueta)` | `src/domain/engine/formato.ts` | Quita el sufijo de unidad: `"Altura frontal (cm)"` → `"Altura frontal"`. |
| `listaOpciones(opciones)` | `src/domain/engine/formato.ts` | Une con «o»/«u» en español: `[7.2, 8]` → `"7,2 u 8"`. |
| `formatearEuros(centimos)` | `src/domain/money.ts` | Importe es-ES: `123456` → `"1.234,56 €"`. |
| `formatearCotaCm(mm)` | `src/domain/units.ts` | Cota con un decimal: `1205 mm` → `"120,5 cm"`. |

## Cambiar un valor del motor (tarifa, parámetro, figura)

No toques el código: edita el JSON correspondiente de `public/config/` (servido con
`Cache-Control: no-store`, sin redeploy de código).

1. Edita `public/config/tarifas.json` (tarifas y suplementos), `public/config/parametros.json`
   (disco, tolerancia, saneado, merma por defecto, arranque, IVA) o `public/config/figuras.json`
   (medidas, recetas, regla de tarifa, suplementos aplicables).
2. Ejecuta `npm run test` para comprobar que la configuración sigue siendo coherente y que los
   casos dorados pasan. Si un caso dorado validado por taller falla, el motor está mal, no el
   caso — no «arregles» el caso.

Los valores marcados PROVISIONAL (disco, tolerancia, saneado, recetas de figuras, perímetro del
corte, entre otros) están pendientes de taller: no los des por confirmados y consulta
`PENDIENTES.md` antes de apoyarte en ellos.

## Consulta también

- [Arquitectura general](./03-arquitectura.md) — dónde encaja el motor en la aplicación.
- [README.md](../README.md) — puesta en marcha, comandos y reglas de oro.
- [PENDIENTES.md](../PENDIENTES.md) — decisiones de negocio abiertas (§6) y dudas del motor (§4).
- [tests/golden/README.md](../tests/golden/README.md) — formato de los casos dorados de taller (§5).
- [AGENTS.md](../AGENTS.md) — reglas irrompibles del repo.
