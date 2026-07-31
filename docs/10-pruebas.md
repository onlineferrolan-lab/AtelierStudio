# Pruebas de Atelier Studio

Esta guía explica cómo ejecutar la suite de tests, cómo está organizada, la política de
los casos dorados de taller y cómo añadir tests nuevos (obligatorios en el motor,
recomendados en el resto). Va dirigida al equipo de desarrollo; taller solo necesita la
sección de casos dorados.

## Ejecutar la suite

El runner es Vitest, configurado en el bloque `test` de `vite.config.ts`.

```bash
npm run test         # ejecuta toda la suite una vez (vitest run)
npm run test:watch   # modo vigilancia: reejecuta al guardar cambios
```

Para acotar la ejecución a una carpeta o un archivo, usa `npx vitest run` con la ruta:

```bash
npx vitest run tests/golden                    # solo los casos dorados
npx vitest run tests/unit/engine               # solo el motor
npx vitest run tests/visor-geometria.test.ts   # un archivo concreto
```

Antes de dar una tarea por terminada no basta con los tests: typecheck, lint, tests y
build deben quedar en verde. La lista completa de comprobaciones está en
[Contribución](./12-contribucion.md).

## Configuración de Vitest

Definida en `vite.config.ts` (bloque `test`):

| Opción | Valor | Efecto |
|---|---|---|
| `globals` | `true` | `describe`, `it`, `expect` disponibles sin importar (aunque varios tests los importan igualmente de `vitest`) |
| `environment` | `'jsdom'` | DOM simulado: permite tests de componentes React y lógica three.js sin WebGL |
| `setupFiles` | `./tests/setup.ts` | carga `@testing-library/jest-dom/vitest` (matchers como `toBeInTheDocument`) |
| `include` | `tests/**/*.test.{ts,tsx}` | solo corren los archivos `*.test.ts` / `*.test.tsx` bajo `tests/` |

Los archivos de utilidades compartidas (`util.ts`, `config-prueba.ts`,
`utilidades-prueba.tsx`) no terminan en `.test.*` a propósito: así Vitest no los trata
como tests.

## Estructura de `tests/`

```
tests/
  setup.ts                  # setup global: matchers de jest-dom
  visor-geometria.test.ts   # geometría del visor 3D (three.js puro, sin renderer)
  unit/                     # tests por módulo, espejo de src/
    engine/                 #   motor: validación, tarifas, ocupación, cotización
    data/                   #   catálogo: muestra, índice, cataleg real, entrada manual
    pdf/                    #   orden de trabajo (jsPDF)
    ui/                     #   pasos ①–④ y estado global (Testing Library)
  smoke/
    e2e.test.ts             # humo extremo a extremo del motor con la config real
  golden/
    README.md               # política y formato de los casos dorados
    casos-golden.test.ts    # loader que ejecuta todos los *.json de la carpeta
    ejemplo-001.json        # caso de muestra NO validado por taller
```

### `tests/unit/` — por módulo

Un archivo `*.test.ts(x)` por módulo o tema, agrupado en subcarpetas que reflejan
`src/`:

- `unit/engine/` — el corazón: `validacion.test.ts`, `tarifas.test.ts`,
  `ocupacion.test.ts`, `cotizacion.test.ts`. Todos corren contra la **configuración
  real** de `public/config/` (tarifas del PDF de taller, §2), cargada con el helper
  `cargarConfigReal()` de `tests/unit/engine/util.ts`.
- `unit/data/` — fuentes de catálogo: `catalogo.test.ts`, `catalogo-muestra.test.ts`,
  `fuenteMuestra.test.ts`, `fuenteIndiceCataleg.test.ts`, `fuenteCataleg.test.ts`.
- `unit/pdf/` — `ordenTrabajo.test.ts` (contenido y nombre de archivo de la orden).
- `unit/ui/` — componentes de los pasos y el estado global con Testing Library:
  `steps/PasoFigura.test.tsx`, `steps/PasoMedidas.test.tsx`,
  `steps/PasoSuplementos.test.tsx`, `steps/materialUtil.test.ts`,
  `steps/integracion-medidas-suplementos.test.tsx`, `state/pasos-context.test.tsx`.

### `tests/smoke/e2e.test.ts` — humo del motor

Un único escenario de punta a punta con la config real: valida medidas en texto
(`validarMedidasCrudas`) y cotiza una Figura 1 con suplementos
(`calcularCotizacion`), comprobando los importes exactos del desglose. Sirve como
alarma rápida si cambian tarifas o parámetros de `public/config/`.

### `tests/visor-geometria.test.ts` — visor 3D

Prueba el ensamblaje de la geometría paramétrica (`construirPieza`) y las cotas
(`crearGrupoCotas`) de `src/viewer/`: número de mallas por figura, dimensiones de la
caja envolvente, ejes de las cotas y determinismo. Es lógica pura de three.js (sin
renderer ni WebGL), así que corre en jsdom como cualquier otro test.

### `tests/setup.ts` — setup global

Una sola línea: `import '@testing-library/jest-dom/vitest'`. Añade los matchers de
jest-dom a `expect` en todos los tests.

## Casos dorados de taller (§5)

Los `tests/golden/*.json` son **cálculos reales de taller** que el motor debe
reproducir exactamente. Son los tests definitivos del motor y su política es
intocable:

> **Si un caso dorado falla, el motor está mal, no el caso.**

- **Solo taller rellena estos casos** (10–15 cálculos validados, a partir de la tabla
  de §5 de la especificación).
- Un caso con `"validadoPorTaller": true` **no se toca**: si el motor no lo reproduce,
  se corrige el motor.
- Los casos añadidos por desarrollo llevan `"validadoPorTaller": false` y la marca
  «EJEMPLO NO VALIDADO POR TALLER» en el campo `nota` (ver `ejemplo-001.json`). Son
  guía de formato, no verdad de negocio.
- El loader (`tests/golden/casos-golden.test.ts`) ejecuta cada JSON por la cadena
  completa — `validarMedidasCrudas` → `calcularCotizacion` — contra la configuración
  real de `public/config/`. Solo compara las claves presentes en `esperado`, así que
  taller puede rellenar un subconjunto.
- Los importes van **siempre en céntimos enteros** y las medidas del resultado en
  **milímetros enteros** (regla §1).
- Los parámetros de ocupación con los que se calcularon los ejemplos (disco 3 mm,
  tolerancia 2 mm, saneado 5 mm/lado) son **PROVISIONALES** (§6.2/§6.3/§6.4): ver
  [PENDIENTES.md](../PENDIENTES.md).

El formato completo de un caso (campos, casos que deben fallar con
`"esperado": { "ok": false, "errores": [...] }`, nomenclatura `NNN-nombre-corto.json`)
está documentado en `tests/golden/README.md`. No lo duplicamos aquí: ese README es la
referencia.

## Añadir tests

### Motor (`src/domain/engine/`): obligatorio

Cualquier cambio en el motor debe venir acompañado de sus tests (regla de `AGENTS.md`).
Convenciones de `tests/unit/engine/`:

1. Crea o amplía el `*.test.ts` del módulo correspondiente (`validacion`, `tarifas`,
   `ocupacion`, `cotizacion`).
2. Usa los helpers de `tests/unit/engine/util.ts`:
   - `cargarConfigReal()` — configuración real de `public/config/`, validada; si el
     JSON deja de ser válido, los tests fallan.
   - `materialErp()` / `materialManual()` — materiales de prueba (baldosa 60×60).
   - `entradaBase()` — entrada de cotización válida y sobrescribible por test.
3. Respeta las marcas de dominio: construye medidas con `mm()` y dinero con
   `centimos()` (de `src/domain/units.ts` y `src/domain/money.ts`). Nada de floats
   para dinero o geometría.
4. El motor **devuelve errores como valor** (`SalidaMotor`), nunca lanza por entrada
   de usuario: comprueba `salida.ok === false` y el contenido de `salida.errores`, no
   uses `expect(...).toThrow()`.

```ts
import { calcularCotizacion } from '../../../src/domain/engine';
import { cargarConfigReal, entradaBase } from './util';

const config = cargarConfigReal();

it('rechaza una cantidad de 0', () => {
  const salida = calcularCotizacion(entradaBase({ cantidad: 0 }), config);
  expect(salida.ok).toBe(false);
});
```

### Datos, PDF y visor: donde haya tests

`unit/data/`, `unit/pdf/` y `tests/visor-geometria.test.ts` siguen el mismo patrón
que el motor (funciones puras, entradas y salidas concretas). Si el módulo que tocas
ya tiene tests, actualízalos y amplíalos.

### UI (`src/ui/`): Testing Library

Los tests de componentes viven en `tests/unit/ui/` y usan Testing Library sobre jsdom.
Convenciones:

- Monta los pasos con el helper `montarPasos()` de
  `tests/unit/ui/steps/utilidades-prueba.tsx`: envuelve el componente en
  `ProveedorAtelier` (con la config real) y `ProveedorPasos` con los cuatro pasos
  abiertos, y expone una sonda `api()` con el estado/dispatch de `useAtelier` para
  preparar escenarios y comprobar el estado global.
- La config de prueba se construye con `construirConfigPrueba()` y
  `materialPrueba()` de `tests/unit/ui/steps/config-prueba.ts`, sobre los JSON reales
  de `public/config/`.
- Los tests mockean el hook `useConfig` del módulo `config-context`: el contexto no se
  exporta y `ProveedorConfig` haría `fetch` a `/config`, no disponible en jsdom (ver
  el comentario de cabecera de `utilidades-prueba.tsx`).
- Los matchers de jest-dom (`toBeInTheDocument`, `toBeDisabled`…) ya están cargados
  por `tests/setup.ts`.

## Consulta también

- [Contribución](./12-contribucion.md) — reglas irrompibles y comprobaciones en verde antes de entregar.
- [Motor de cálculo](./05-motor-de-calculo.md) — qué calcula el motor que estos tests cubren.
- [Arquitectura](./03-arquitectura.md) — mapa de `src/` del que `tests/unit/` es espejo.
- [Primeros pasos](./02-primeros-pasos.md) — instalación y arranque del entorno.
- `tests/golden/README.md` — formato y política detallada de los casos dorados.
- [README.md](../README.md) — resumen operativo del proyecto.
- [PENDIENTES.md](../PENDIENTES.md) — parámetros PROVISIONALES que afectan a los cálculos esperados.
