# Visión general de Atelier Studio

Este documento presenta qué es Atelier Studio, en qué contexto de negocio nace, cómo se
recorre la pantalla en sus cuatro pasos y el vocabulario del dominio. Está pensado para
cualquiera que se incorpore al proyecto (desarrollo, taller o dirección) y necesite una
primera lectura antes de abrir el código o la especificación.

## Qué es Atelier Studio

Atelier Studio es una herramienta interna de **Ferrolan** para configurar y cotizar
**piezas cerámicas manipuladas en taller**: peldaños, rodapiés y cortes a medida
(`README.md`). El comercial elige un material del catálogo, una figura, las medidas y los
suplementos; la aplicación calcula el precio al momento y genera la **orden de trabajo en
PDF** para el taller.

Rasgos que la definen (especificación §1, `src/App.tsx`):

- **Una sola página, sin login**: es de uso interno, no hay cuentas ni roles (el login
  queda fuera de alcance de la v1, §8).
- **Escritorio primero**: en pantallas pequeñas las columnas se apilan, pero el puesto de
  trabajo de referencia es un escritorio.
- **Idioma español** en toda la interfaz.
- **Tercera herramienta de la familia iniciada por Top Studio**: replica su patrón visual
  desde cero, sin acceso al código original (PENDIENTES.md §6.14).

La especificación de negocio es `ATELIER_STUDIO_MVP.md` (entregada con el encargo, no vive
en el repo). Las dudas abiertas con taller y dirección se recogen en
[PENDIENTES.md](../PENDIENTES.md): **léelo antes de tocar cualquier regla de negocio**.

Stack: Vite + React 18 + TypeScript estricto · Tailwind CSS · three.js (visor 3D) ·
jsPDF (orden de trabajo) · Vitest (`README.md`).

```bash
npm install
npm run dev        # http://localhost:5173
```

## La pantalla: flujo en cuatro pasos

Al arrancar, la app carga tarifas, figuras y parámetros de `/config`; si esa carga falla,
muestra una pantalla de error con reintento (`src/App.tsx`). Con la configuración lista,
el layout (`src/ui/shell/shell.tsx`) es:

- **Columna izquierda** (~420–480 px): los pasos ① Material · ② Figura · ③ Medidas y
  cantidad · ④ Suplementos y, debajo, el bloque **Cotización** siempre visible.
- **Panel derecho**: pestañas **Catálogo / Visor 3D**, fijo (sticky) en escritorio.

### ① Material

`src/ui/steps/PasoMaterial.tsx`. El comercial selecciona la baldosa de origen:

- «Seleccionar del catálogo» abre la pestaña **Catálogo** del panel derecho. Con material
  elegido, el paso muestra una tarjeta-resumen (foto, descripción, referencia, marca,
  formato, datos de caja y precio) con acciones «Cambiar» y «Quitar».
- El origen del material (Stock/Pedido) **ya no existe**: desde el 2026-07-30 todo se factura por
  cajas completas, así que dejó de cambiar el importe y se suprimió (ver el glosario).
- Una subsección plegable «Entrada manual» permite dar de alta cerámica que no está en el
  catálogo (queda marcada con la insignia MANUAL).

### ② Figura

`src/ui/steps/PasoFigura.tsx`. Galería visual cargada desde `public/config/figuras.json`
—nunca cosida a la interfaz—. Cada tarjeta muestra el dibujo y el nombre de la figura.

- Las figuras con `estado: "pendiente"` (sin tarifa o croquis confirmados) aparecerían
  **bloqueadas**, con insignia PENDIENTE y el motivo. Hoy no hay ninguna: Figura 5,
  vierteaguas y rodapié recto se retiraron de la galería (2026-07-29, dirección) y su
  seguimiento vive en PENDIENTES.md.
- Las recetas actuales son provisionales mientras taller no entregue el croquis acotado
  (§3): cada figura lleva `croquisPendiente: true` e insignia «croquis provisional».
- Al cambiar de figura se reinician las medidas y los suplementos.

### ③ Medidas y cantidad

`src/ui/steps/PasoMedidas.tsx`. Los campos se generan según `figura.medidas` de la
configuración: entrada numérica libre o control segmentado cuando la medida solo admite
valores concretos (p. ej. altura de rodapié 7,2 / 8 cm), más el campo **cantidad**
(entero ≥ 1).

- El usuario introduce **centímetros**; la conversión a milímetros enteros y la validación
  viven en el motor.
- Los errores se muestran **junto a su campo**, con el mensaje concreto de taller (nunca un
  «configuración no válida» genérico), y solo después de que el comercial haya tecleado
  algo en el paso.

### ④ Suplementos

`src/ui/steps/PasoSuplementos.tsx`. Un conmutador por cada suplemento aplicable a la
figura activa, con nombre y precio leídos siempre de configuración: «+2,00 €/peldaño»
para los `porPieza`, «+0,02 €/cm» para los `porCm`. Si la figura admite pintado
(`tienePintado`, rodapiés), aparece el conmutador «Pintado», que cambia a la tarifa de
pintado (§2). Cada cambio actualiza la cotización al momento.

### Bloque Cotización (siempre visible)

`src/ui/shell/cotizacion.tsx`. Bajo los cuatro pasos, se actualiza en vivo con lo que
devuelve el motor:

- **Desglose**: Material · Manipulación (con suplementos, detallada en líneas) ·
  Arranque de máquina · Total sin IVA · IVA · **Total con IVA**. Las líneas quedan a «—»
  mientras falten datos o haya errores.
- **Datos logísticos**: baldosas necesarias, baldosas con merma, piezas/cajas facturadas
  y m² facturados.
- **«Azulejos no incluidos»**: casilla para cuando el cliente aporta las baldosas. El
  material sale a 0 € (la línea del desglose lo dice) y el resto del cálculo no cambia:
  se siguen dando las baldosas y cajas que el cliente tiene que traer.
- **Merma (%)** visible; editable solo si `parametros.mermaEditable` (pendiente de
  dirección, §6.10).
- **Errores de validación** del motor listados con sus mensajes concretos.
- Botones **Generar PDF** (deshabilitado sin cotización válida) y **Reiniciar**.

### Panel derecho: Catálogo y Visor 3D

`src/ui/shell/shell.tsx` (`PanelDerecho`). Dos pestañas:

- **Catálogo** (`CatalogoPanel`): búsqueda y selección del material del paso ①.
- **Visor 3D** (`VisorPieza`, three.js): dibuja la figura activa con las medidas ya
  validadas, la textura del material y la cantidad. Si una pieza no tiene imagen, muestra
  material neutro con el aviso «textura no disponible» —no bloquea la cotización—.

## Lo que no cambia nunca

Reglas de oro de la especificación (`README.md`, `AGENTS.md`); cualquier código que las
viole es un bug:

- **Dinero en céntimos enteros, geometría en milímetros enteros** (entrada en cm).
  Prohibido `float` para dinero o geometría; cálculo determinista.
- **Tarifas, figuras y parámetros se leen de `public/config/*.json`**, nunca hardcodeados
  en componentes. Cambiar una tarifa es editar un JSON, no el código.
- **Lo pendiente no se inventa** (§0): parámetro configurable + marca PROVISIONAL +
  entrada en PENDIENTES.md.
- **El motor (`src/domain/engine/`) es puro** y devuelve los errores de validación como
  valor (`SalidaMotor`); nunca lanza por entrada de usuario.
- **Los casos dorados mandan**: si un caso dorado falla, el motor está mal, no el caso.

## Glosario

| Término | Qué significa | Dónde vive |
|---|---|---|
| **Material** | Baldosa cerámica de origen sobre la que se manipula la pieza. Viene del catálogo (API del catàleg, índice o catálogo de muestra) o de la «entrada manual». Lleva referencia, descripción, formato (largo × ancho), tarifa (TARP, asumida €/m² de forma provisional —ver PENDIENTES.md §4.7—), piezas/m² por caja e imagen. | `Material` en `src/domain/types.ts`; `src/data/` |
| **Figura** | Tipo de pieza que fabrica el taller: Figuras 1–4 (peldaños con frontal), peldaño romo, rodapiés (estándar 7,2/8 cm y no estándar) y corte de piezas. Se define con medidas, receta de componentes, regla de tarifa y suplementos. Las recetas son provisionales hasta el croquis acotado (§3). | `public/config/figuras.json`; `Figura` en `src/domain/config.ts` |
| **Suplemento** | Extra activable en el paso ④, asociado a cada figura: `porPieza` (céntimos por pieza, se muestra «€/peldaño») o `porCm` (milésimas por cm lineal). Ejemplos: angular, ranuras, goterón, espesado. El «pintado» de los rodapiés no es un suplemento sino una tarifa alternativa. | `tarifas.json`; `Suplemento` en `src/domain/config.ts` |
| **Merma** | Porcentaje extra aplicado sobre las baldosas necesarias, redondeado hacia arriba (`ceil(baldosas × (1 + %))`), para cubrir roturas y recortes. El valor por defecto (10 %, §4) es de desarrollo y su editabilidad está pendiente (§6.9/§6.10). | `parametros.json`; `baldosasConMerma` en `src/domain/types.ts` |
| **Ocupación** | Cuánta dimensión útil de la baldosa de origen consumen los componentes de la pieza al colocarlos. La receta actual (Σ anchos + (n−1)·disco + 2·saneado + tolerancia) es **provisional** (§6.4). De ella salen las baldosas necesarias, el número de cortes y si la baldosa se gira 90°. | `DetalleOcupacion` en `src/domain/types.ts`; `src/domain/engine/` |
| **Facturación por cajas** | El proveedor solo sirve cajas completas, así que se factura la caja entera y el sobrante se cobra al cliente (§4). Antes dependía de un origen Stock/Pedido, suprimido el 2026-07-30. | `calcularCotizacion` en `src/domain/engine/cotizacion.ts` |
| **Cotización** | Resultado del motor para una configuración: componentes, ocupación, baldosas (necesarias y con merma), unidades/cajas facturadas, m², líneas de manipulación y desglose (material, manipulación con suplementos, arranque de máquina, IVA y totales). Si la entrada no es válida, devuelve errores concretos como valor. | `ResultadoCotizacion` / `SalidaMotor` en `src/domain/types.ts`; bloque Cotización |
| **Caso dorado** | Cálculo real validado por taller, depositado como JSON en `tests/golden/` y ejecutado como test del motor (§5). Hoy solo hay un ejemplo **no validado**; taller debe rellenar la tabla §5. Si un caso dorado falla, el motor está mal, no el caso. | `tests/golden/`; PENDIENTES.md §3 |
| **PROVISIONAL** | Marca exigida por la spec (§0) para todo lo pendiente de taller o dirección: parámetro configurable + marca visible + entrada en PENDIENTES.md. Inventar una regla, tarifa o geometría se considera un error. | PENDIENTES.md; `AGENTS.md` |

## Consulta también

- [Arquitectura técnica](./03-arquitectura.md) — módulos, estado y flujo de datos.
- [README.md](../README.md) — puesta en marcha, comandos, configuración y despliegue.
- [PENDIENTES.md](../PENDIENTES.md) — preguntas abiertas con taller y dirección.
- [AGENTS.md](../AGENTS.md) — reglas irrompibles y convenciones del repo.
- [tests/golden/README.md](../tests/golden/README.md) — formato de los casos dorados.
