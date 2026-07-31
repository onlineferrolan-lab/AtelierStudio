# Contribución a Atelier Studio

Esta guía recoge las normas para modificar el repositorio: las seis reglas irrompibles,
las comprobaciones que deben quedar en verde antes de dar una tarea por terminada, el
formato del código, dónde vive cada cosa y la disciplina de `PENDIENTES.md`. Va dirigida
a cualquier persona (o agente) que trabaje en el proyecto.

## Antes de empezar

- Lee la especificación de negocio (`ATELIER_STUDIO_MVP.md`, entregada con el encargo) y
  [PENDIENTES.md](../PENDIENTES.md) **antes de tocar reglas de negocio**.
- Prepara el entorno:

```bash
npm install
npm run dev        # http://localhost:5173
```

## Las seis reglas irrompibles

Vienen de `AGENTS.md`: **incumplir cualquiera de ellas es un bug**, no una cuestión de estilo.

### 1. Dinero en céntimos enteros, geometría en mm enteros

Usa siempre `src/domain/money.ts` y `src/domain/units.ts`, con las marcas `Centimos`,
`Mm` y `Milesimas` definidas en `src/domain/types.ts`. Prohibido usar `float` para dinero
o geometría. El cálculo es determinista: mismo input → mismo resultado.

### 2. Nada de tarifas, figuras ni parámetros hardcodeados

Los componentes leen la configuración de `public/config/*.json` a través de
`src/domain/config.ts`. Cambiar una tarifa o un parámetro significa **editar el JSON, no
el código**: `tarifas.json`, `figuras.json` y `parametros.json` se sirven con
`Cache-Control: no-store` precisamente para que taller/dirección pueda cambiarlos sin
redeploy de código.

### 3. Lo pendiente no se inventa

Si una regla de negocio no está decidida (spec §0), no la implementes con suposiciones.
El patrón obligatorio tiene tres partes:

1. Un **placeholder configurable** (un parámetro en `public/config/`, no un valor fijo en código).
2. Un comentario `PROVISIONAL` o `TODO` junto al código afectado.
3. Una **entrada en `PENDIENTES.md`** describiendo la duda y a quién corresponde resolverla.

Inventar una regla de negocio, una tarifa o una geometría se considera un error.

### 4. El motor es puro

`src/domain/engine/` no puede importar React, hacer `fetch`, tocar el DOM ni usar
librerías. Los errores de validación se **devuelven como valor** en `SalidaMotor`; el
motor nunca lanza excepciones por entrada de usuario.

### 5. Los casos dorados son sagrados

Los `tests/golden/*.json` los rellena taller con cálculos reales validados. Si un caso
dorado falla, **el motor está mal, no el caso**: no «arregles» el JSON. El formato de los
casos está documentado en `tests/golden/README.md`.

### 6. Español en UI y dominio

Los textos de interfaz y los comentarios de dominio se escriben en español.

## Comprobaciones obligatorias antes de terminar

Todo debe quedar en verde. Son las mismas comprobaciones que ejecuta la CI
(`.github/workflows/ci.yml`):

| Comando | Qué verifica |
|---|---|
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto |
| `npm run lint` | `eslint . --max-warnings 0` — los warnings también fallan |
| `npm run test` | Suite Vitest completa (motor, datos, pdf, UI, casos dorados) |
| `npm run build` | Typecheck + build de producción en `dist/` |

Además, añade o actualiza tests donde ya existan. Para el motor los tests son
**obligatorios**: cualquier cambio en `src/domain/engine/` debe venir acompañado de sus
tests unitarios en `tests/unit/`.

## Formato del código

El formateador es Prettier (`.prettierrc`):

| Opción | Valor |
|---|---|
| `printWidth` | `100` |
| `singleQuote` | `true` |
| `trailingComma` | `"all"` |
| `semi` | `true` |

```bash
npm run format         # formatea todo el repo
npm run format:check   # solo verifica, sin escribir
```

Detalles de ESLint (`.eslintrc.cjs`) que conviene conocer:

- `@typescript-eslint/no-explicit-any` es **error**: nada de `any`.
- `react-hooks/rules-of-hooks` es error y `react-hooks/exhaustive-deps` es warning; como
  el lint corre con `--max-warnings 0`, un warning rompe la comprobación igual que un error.
- `react-refresh/only-export-components` admite explícitamente el patrón «provider + hooks
  en el mismo archivo» de los contextos (`src/ui/state/`); no fragmentes esos módulos para
  satisfacer la regla.

## Dónde vive cada cosa

| Qué buscas | Dónde está |
|---|---|
| Reglas §4 (ocupación, merma, facturación por cajas, desglose) | `src/domain/engine/` |
| Contratos de dominio (no ampliar sin necesidad) | `src/domain/types.ts`, `src/domain/config.ts` |
| Estado global (reducer, una pieza por cotización) | `src/ui/state/quote-state.tsx` |
| Patrón visual Top Studio (primitivas) | `src/ui/components/primitivas.tsx` |
| Catálogo (muestra, cataleg real, entrada manual) | `src/data/` |
| Visor 3D paramétrico | `src/viewer/` |
| PDF de orden de trabajo | `src/pdf/` |
| Configuración editable por taller/dirección | `public/config/` |
| Tests unitarios y casos dorados | `tests/unit/`, `tests/golden/` |

## La disciplina de PENDIENTES.md

[PENDIENTES.md](../PENDIENTES.md) es la **lista viva de lo no decidido**. Trátala como
parte del código:

- **Al encontrar algo pendiente**: aplica el patrón de la regla 3 (placeholder +
  `PROVISIONAL`/`TODO` + entrada en `PENDIENTES.md`). No adivines el valor «razonable».
- **Al tocar algo pendiente de taller/dirección**: actualiza la entrada correspondiente en
  `PENDIENTES.md`; si el cambio altera una convención del proyecto, actualiza también
  `AGENTS.md`.
- **Cuando llegue una respuesta** (croquis acotado, tarifa confirmada, caso dorado):
  sustituye el placeholder por la regla real, quita la marca `PROVISIONAL` y cierra la
  entrada en `PENDIENTES.md`.

## Consulta también

- [README.md](../README.md) — puesta en marcha, stack, comandos y arquitectura general.
- [PENDIENTES.md](../PENDIENTES.md) — dudas abiertas de negocio y valores provisionales.
- [AGENTS.md](../AGENTS.md) — versión condensada de estas reglas para agentes.
- `tests/golden/README.md` — formato de los casos dorados.
- [Arquitectura de Atelier Studio](./03-arquitectura.md) — módulos y flujo de datos en detalle.
