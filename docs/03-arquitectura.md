# Arquitectura de Atelier Studio

Este documento describe cómo está organizado el código de Atelier Studio: el mapa de
módulos de `src/`, el flujo de datos unidireccional desde la configuración JSON hasta la
cotización, y las reglas de dependencia entre capas. Va dirigido a quien se incorpora al
repo o necesita saber dónde vive cada cosa antes de tocar código. Para las reglas de
negocio y sus preguntas abiertas, consulta [PENDIENTES.md](../PENDIENTES.md); para la
puesta en marcha, el [README.md](../README.md).

## Vista general

Atelier Studio es una aplicación de una sola página (§1 de la especificación), sin login
ni rutas de cliente. La estructura refleja una separación estricta en capas:

- **`src/domain/`** — dominio puro: tipos, dinero, unidades, configuración y el motor de
  cálculo. Sin React, sin red, sin DOM.
- **`src/data/`** — acceso al catálogo de materiales tras la interfaz `FuenteCatalogo`.
- **`src/piezas/`** — forma de la pieza (sección transversal), pura y sin dependencias.
- **`src/viewer/`** — visor 3D paramétrico con three.js.
- **`src/pdf/`** — orden de trabajo en PDF con jsPDF.
- **`src/ui/`** — React: estado global, pasos del flujo, layout y primitivas visuales.

Las capas de arriba conocen a las de abajo; nunca al revés (ver
[Reglas de dependencia](#reglas-de-dependencia)).

## Mapa de módulos de `src/`

### `src/domain/` — dominio puro

| Archivo | Responsabilidad |
|---|---|
| `src/domain/types.ts` | Contratos del dominio: marcas `Mm`, `Centimos`, `Milesimas`, `Material`, `EntradaCotizacion`, `SalidaMotor`, `ErrorValidacion`. |
| `src/domain/money.ts` | Dinero en céntimos enteros; tarifas en milésimas de euro. Punto único de redondeo. |
| `src/domain/units.ts` | Conversión de cm a milímetros enteros y formato de cotas. |
| `src/domain/config.ts` | Carga y validación de `/config` tras la interfaz `FuenteConfiguracion` (el origen definitivo, JSON o Google Sheet, es la pregunta abierta §6.12). |

#### `src/domain/engine/` — motor de cálculo

El motor implementa las reglas de §4 (ocupación, merma, facturación por cajas, desglose). Su API
pública es un contrato fijo exportado desde `src/domain/engine/index.ts`:

| Función | Qué hace |
|---|---|
| `figuraPorId` | Busca una figura por id en la configuración. |
| `validarMedidasCrudas` | Valida las medidas en texto crudo y las convierte a `Mm`. |
| `resolverTarifa` / `longitudTarifaMm` | Resuelven la tarifa de una figura y la longitud a la que se aplica. |
| `calcularCotizacion` | Ejecuta el cálculo completo y devuelve `SalidaMotor`. |

La implementación vive en módulos internos: `validacion.ts`, `tarifas.ts`,
`ocupacion.ts`, `cotizacion.ts` y `formato.ts`. Varios valores son **PROVISIONALES**
(receta de ocupación, disco, tolerancia, saneado): ver `PENDIENTES.md` §1 y §2.

### `src/data/` — catálogo de materiales

| Archivo | Responsabilidad |
|---|---|
| `src/data/catalogo.ts` | Interfaz `FuenteCatalogo` (única que conoce la UI de búsqueda) y `crearMaterialManual` para entrada manual. |
| `src/data/fuenteIndiceCataleg.ts` | Fuente real: busca por texto sobre un índice local y trae tarifa/medidas autoritativos del API `/api/cataleg/` en lotes de hasta 50 códigos. |
| `src/data/fuenteCataleg.ts` | Adaptador del «API del catàleg» (`mapearArticuloCataleg`). La clave nunca llega al navegador: la inyecta nginx o el proxy de desarrollo (ver README §Conexión a datos reales). |
| `src/data/fuenteMuestra.ts` | Catálogo de muestra (DATOS FALSOS, §7.3), alternativa sin red. |
| `src/data/busqueda.ts` | Normalización de texto (minúsculas, sin diacríticos) compartida por las fuentes. |

### `src/piezas/` — forma de la pieza

| Archivo | Responsabilidad |
|---|---|
| `src/piezas/seccionPieza.ts` | Sección transversal de cada figura en el plano (fondo, alto): contorno y juntas de encolado. Módulo **puro** (sin three.js, React ni jsPDF). |
| `src/piezas/piezaDeFigura.ts` | De figura + medidas a sección y cotas (`construirSeccion`, `rasgosDeSuplementos`). También **puro**: es lo que permite que el croquis del PDF no arrastre three.js. |

Es la **única fuente de verdad de la forma**, y la comparten el visor 3D (que la
extruye) y el croquis del PDF de orden de trabajo (que la dibuja). Existe porque
tenerla duplicada ya provocó un fallo real: el visor dibujaba los dientes de las
Figuras 2–3 en escalera y las miniaturas a ras, cada uno con su copia de la
geometría. Las miniaturas del paso ② mantienen a propósito una versión
**esquemática** aparte (proporciones exageradas para leerse a 96 × 64 px).

### `src/viewer/` — visor 3D paramétrico

| Archivo | Responsabilidad |
|---|---|
| `src/viewer/VisorPieza.tsx` | Componente React: recibe `figura`, `medidasMm`, `imagenUrl` y `cantidad`; si WebGL no está disponible, no bloquea el resto de la app. |
| `src/viewer/escena.ts` | Ciclo de vida de la escena three.js (se crea una vez y se libera al desmontar). |
| `src/viewer/geometria.ts` | Ensamblaje de la pieza: extruye la sección de `src/piezas/` a lo largo del largo y calcula las cotas (forma PROVISIONAL, ver `PENDIENTES.md` §2). |
| `src/viewer/cotas.ts` | Cotas visibles de cada medida. |
| `src/viewer/materiales.ts` | Carga y aplicación de la textura del material (material neutro + aviso si falla). |
| `src/viewer/recursos.ts` | Liberación de geometrías, materiales y texturas (nada de memoria GPU colgada). |

### `src/pdf/` — orden de trabajo

`src/pdf/ordenTrabajo.ts` genera el PDF interno para taller. La construcción del
documento (`construirPdfOrdenTrabajo`) es pura y síncrona: solo maqueta el
`ResultadoCotizacion` del motor, sin calcular nada. `generarPdfOrdenTrabajo` es la única
parte impura: carga logo e imagen del material y llama a `save()`. El contenido
definitivo del PDF sigue pendiente de validación (§6.11, ver `PENDIENTES.md`).

### `src/ui/` — React

| Subcarpeta | Responsabilidad |
|---|---|
| `src/ui/components/` | `primitivas.tsx`: primitivas visuales del patrón Top Studio (`Boton`, `Pestanas`, `Insignia`…). |
| `src/ui/state/` | Estado global: `config-context.tsx` (configuración), `quote-state.tsx` (reducer de la cotización), `pasos-context.tsx` (apertura de tarjetas ①-④, decisión pura de UX). |
| `src/ui/steps/` | Pasos ① Material · ② Figura · ③ Medidas y cantidad · ④ Suplementos, más `CatalogoPanel`, `EntradaManual` y utilidades de presentación. |
| `src/ui/shell/` | Layout: `shell.tsx` (dos columnas), `cabecera.tsx`, `panel.tsx` (pestañas Catálogo/Visor 3D) y `cotizacion.tsx` (bloque COTIZACIÓN siempre visible). |

### Punto de entrada

- `src/main.tsx` monta `<App />` en `#root` con `StrictMode`.
- `src/App.tsx` define la cadena de proveedores:
  `ProveedorConfig` → pantallas de carga/error → `ProveedorAtelier` → `ProveedorPanel` →
  `ProveedorPasos` → `ShellAtelier`.

## Flujo de datos unidireccional

Los datos fluyen en una sola dirección: la configuración se carga una vez, el comercial
modifica el estado mediante acciones, y el motor calcula de forma derivada y
determinista. Nada escribe hacia atrás.

```
┌──────────────────────────┐
│ public/config/*.json     │  tarifas · figuras · parámetros (Cache-Control: no-store)
└────────────┬─────────────┘
             │ carga única al arrancar (FuenteConfiguracion)
             ▼
┌──────────────────────────┐
│ ProveedorConfig          │  src/ui/state/config-context.tsx
│ cargando / error / lista │
└────────────┬─────────────┘
             │ Configuracion validada
             ▼
┌──────────────────────────┐      acciones (seleccionarMaterial, cambiarMedida…)
│ ProveedorAtelier         │ ◄─────── pasos ①-④  (src/ui/steps/)
│ useReducer, texto crudo  │         src/ui/state/quote-state.tsx
└────────────┬─────────────┘
             │ construirEntrada: texto en cm → Mm / Centimos
             ▼
┌──────────────────────────┐
│ MOTOR PURO               │  src/domain/engine/ · sin React, fetch ni DOM
│ calcularCotizacion       │  errores devueltos como valor (SalidaMotor)
└────────────┬─────────────┘
             │
             ▼
   ┌─────────────────┬────────────────────┬─────────────────────┐
   │ PanelCotizacion  │ VisorPieza (3D)    │ PDF orden de trabajo │
   │ desglose e IVA   │ figura + medidasMm │ DatosOrdenTrabajo    │
   │ (SalidaMotor)    │ + textura material │ (entrada + resultado)│
   └─────────────────┴────────────────────┴─────────────────────┘
```

Detalles del recorrido:

1. **Configuración.** `ProveedorConfig` llama a `crearFuenteConfiguracionJson().cargar()`
   una sola vez. Mientras tanto, `App.tsx` muestra una pantalla de carga; si falla, una
   pantalla de error con reintento. Abajo solo se usa `useConfig()`, que exige la
   configuración ya lista.
2. **Estado de la cotización.** `quote-state.tsx` guarda una única pieza por orden, con
   los campos como **texto crudo** (medidas en cm tal cual se teclean) para poder dar
   mensajes de validación concretos (§1.③). Cambiar de figura reinicia medidas,
   suplementos y pintado: no son transferibles.
3. **Conversión.** `construirEntrada` valida y convierte el estado crudo a
   `EntradaCotizacion` (mm enteros, céntimos enteros). Devuelve `null` si faltan datos
   básicos, o los errores como valor si la validación falla.
4. **Cálculo.** `useSalidaMotor(config)` ejecuta `calcularCotizacion(entrada, config)`
   memoizado sobre `(estado, config)`: mismo input, mismo resultado.
5. **Consumidores.** El bloque COTIZACIÓN (`src/ui/shell/cotizacion.tsx`) renderiza la
   `SalidaMotor`; el visor recibe la figura activa y las medidas validadas en mm
   (`useMedidasValidadas`); el PDF se construye con la entrada y el resultado cuando el
   comercial pulsa «Generar PDF».

El catálogo (`src/data/`) entra en este flujo solo en el paso ①: la búsqueda devuelve un
`Material` y el paso dispara la acción `seleccionarMaterial`.

## Reglas de dependencia

Estas reglas son irrompibles; violarlas es un bug (ver [AGENTS.md](../AGENTS.md)):

- **El motor es puro.** Nada en `src/domain/engine/` importa React, `fetch`, DOM ni
  librerías externas. Los errores de validación se devuelven como valor (`SalidaMotor`);
  el motor nunca lanza por entrada de usuario.
- **Dinero en céntimos enteros, geometría en mm enteros.** Las marcas `Mm`, `Centimos`
  y `Milesimas` solo se construyen con `src/domain/money.ts` y `src/domain/units.ts`.
  Prohibido `float` para dinero o geometría.
- **La UI nunca hardcodea tarifas, figuras ni parámetros.** Todo se lee de
  `public/config/*.json` vía `src/domain/config.ts`. Cambiar una tarifa es editar un
  JSON, no código. Las figuras con `estado: "pendiente"` se muestran bloqueadas.
- **Una pieza por cotización.** El `EstadoAtelier` del reducer modela una sola pieza
  configurada por orden (§1).
- **Dirección de las importaciones.** `ui` → `domain` está permitido; `domain` no
  importa nunca de `ui`, `data`, `viewer` ni `pdf`. `data` y `pdf` dependen solo del
  dominio (más jsPDF en `pdf`); `viewer/VisorPieza.tsx` reutiliza además las primitivas
  de `src/ui/components/`. `piezas` no importa de nadie (es puro) y lo consumen `viewer`
  y `pdf`.
- **Lo pesado se carga bajo demanda.** El visor 3D (three, ~505 kB) y el generador de PDF
  (jsPDF y sus dependencias, ~580 kB) se importan con `import()` dinámico desde la pestaña
  del visor y desde «Generar PDF». La primera pantalla baja 208 kB de JS en vez de 1,3 MB.
  Dos trampas que costaron encontrarlas: `cotizacion.tsx` importaba `viewer/geometria.ts`
  para el croquis y con él todo three (de ahí `piezas/piezaDeFigura.ts`), y declarar `three`
  o `jspdf` en `build.rollupOptions.output.manualChunks` los devolvía al grafo inicial con un
  `<link rel="modulepreload">`. Si vuelves a tocar el bundle, comprueba en el navegador qué
  `.js` se piden en el primer render.
- **Lo pendiente no se inventa** (§0): placeholder configurable, marca `PROVISIONAL` y
  entrada en `PENDIENTES.md`.

### Dónde tocar para…

| Quiero… | Archivo |
|---|---|
| Cambiar una tarifa o un suplemento | `public/config/tarifas.json` |
| Añadir o corregir una figura | `public/config/figuras.json` (receta pendiente del croquis oficial, ver `PENDIENTES.md` §2) |
| Cambiar disco, tolerancia, merma, IVA | `public/config/parametros.json` |
| Cambiar una regla de cálculo | `src/domain/engine/` + tests del motor (obligatorio) |
| Cambiar el layout o el flujo de pasos | `src/ui/shell/` y `src/ui/steps/` |
| Cambiar el origen de tarifas/figuras | Implementar `FuenteConfiguracion` en `src/domain/config.ts` |

## Tests y assets de `public/`

### Tests (`tests/`)

La suite corre con `npm run test` (Vitest) y refleja la estructura de `src/`:

| Carpeta | Contenido |
|---|---|
| `tests/unit/engine/` | Tests del motor: `validacion`, `tarifas`, `ocupacion`, `cotizacion`. Obligatorios al tocar el motor. |
| `tests/unit/data/` | Fuentes de catálogo y catálogo de muestra. |
| `tests/unit/pdf/` | Generación de la orden de trabajo. |
| `tests/unit/ui/` | Contextos y pasos de React (Testing Library). |
| `tests/golden/` | Casos dorados de taller (§5): cálculos reales validados que el motor debe reproducir exactamente. **Si un caso dorado falla, el motor está mal, no el caso.** Solo taller los rellena; ver `tests/golden/README.md`. |
| `tests/smoke/` | Test e2e de humo. |
| `tests/visor-geometria.test.ts` | Geometría del visor. |

Los casos dorados se ejecutan contra la configuración REAL de `public/config/`, así que
editar esos JSON puede cambiar el resultado de los tests.

### Assets públicos (`public/`)

| Ruta | Contenido |
|---|---|
| `public/config/` | `tarifas.json`, `figuras.json`, `parametros.json`: configuración de negocio editable sin redeploy de código, servida con `Cache-Control: no-store`. |
| `public/data/` | `catalogo-muestra.json` (DATOS FALSOS, §7.3), `indice-cataleg.json` (índice de búsqueda generado con `npm run indice:cataleg`) e imágenes de muestra. |
| `public/ferrolan-logo.png` | Logo usado en cabecera y PDF. |

(Las miniaturas de la galería de figuras son SVG inline en `src/ui/steps/MiniaturaFigura.tsx`
desde 2026-07-29; los PNG de `public/figuras/` se eliminaron.)

## Consulta también

- [README.md](../README.md) — puesta en marcha, comandos, despliegue y conexión al catálogo real.
- [PENDIENTES.md](../PENDIENTES.md) — preguntas abiertas de negocio y valores PROVISIONALES.
- [AGENTS.md](../AGENTS.md) — reglas irrompibles y convenciones del repo.
- [tests/golden/README.md](../tests/golden/README.md) — formato y disciplina de los casos dorados.
