# AGENTS.md — Atelier Studio

Guía para agentes (o humanos) que trabajen en este repo. La especificación de negocio es
`ATELIER_STUDIO_MVP.md`; las decisiones pendientes viven en `PENDIENTES.md`. **Léelos antes
de tocar reglas de negocio.**

## Comandos (Windows + Git Bash)

```bash
npm install
npm run dev / test / typecheck / lint / build
```

Todo debe quedar en verde: `tsc --noEmit`, `eslint . --max-warnings 0`, `vitest run`, build.

## Reglas irrompibles (violen = bug)

1. **Dinero en céntimos enteros, geometría en mm enteros.** Usa siempre `src/domain/money.ts`
   y `src/domain/units.ts` (marcas `Centimos`, `Mm`, `Milesimas`). Prohibido float para dinero
   o geometría. Determinista: mismo input → mismo resultado.
2. **Nada de tarifas/figuras/parámetros hardcodeados en componentes.** Se leen de
   `public/config/*.json` vía `src/domain/config.ts`. Cambios de tarifa = editar JSON, no código.
3. **Lo pendiente no se inventa** (spec §0): placeholder configurable + comentario
   `PROVISIONAL`/`TODO` + entrada en `PENDIENTES.md`.
4. **El motor (`src/domain/engine/`) es puro**: sin React, fetch, DOM ni librerías. Devuelve
   errores de validación como valor (`SalidaMotor`); nunca lanza por entrada de usuario.
5. **Casos dorados** (`tests/golden/*.json`): los rellena taller. Si un caso dorado falla,
   el motor está mal, no el caso — no "arregles" el caso.
6. Textos de UI y comentarios de dominio en **español**.

## Dónde vive cada cosa

- Reglas §4 (ocupación, merma, desglose): `src/domain/engine/`
  - **La caja es del ARTÍCULO, no del corte.** `cotizacion.ts` está partido en
    `calcularLinea` (lo que es de la pieza) y `facturarMaterial` (lo que es del
    artículo); `pedido.ts` agrupa varias piezas por material y factura las cajas
    una sola vez. Una cotización de una pieza es un grupo con una línea: si tocas
    una de las dos mitades, comprueba que sigue dando lo mismo.
- Contratos de dominio (no ampliar sin necesidad): `src/domain/types.ts`, `config.ts`
- Estado global (reducer: la pieza en edición + el carrito del pedido):
  `src/ui/state/quote-state.tsx`. Lo que describe UNA pieza va en `PiezaConfigurada`,
  para que el editor y las líneas del carrito compartan forma y conversión.
- Patrón visual Top Studio: `src/ui/components/primitivas.tsx`
- Catálogo (cataleg real/PrestaShop/muestra/manual): `src/data/` — `FuenteCatalogo` (muestra,
  índice de búsqueda) + `fuenteCataleg.ts` (datos reales por código, vía proxy `/api/cataleg/`,
  nunca con la clave en el navegador — ver README y PENDIENTES.md §4.8)
- Visor 3D paramétrico: `src/viewer/` · PDF: `src/pdf/` — los bloques de maquetación
  viven en `maqueta.ts` y los comparten la orden de una pieza (`ordenTrabajo.ts`) y la
  del pedido (`ordenPedido.ts`); no dupliques cajas ni cabeceras entre los dos.
- Adjuntos de la orden (clip de «Comentarios para taller»): `src/orden/adjuntos.ts` — aparte de
  `src/pdf/` a propósito, porque el estado los necesita y `ordenTrabajo.ts` arrastra jsPDF (~580 kB,
  carga diferida). Solo viven en la sesión: ver PENDIENTES.md §4.16. Los pintan
  `seccionComentarios` (la cita por nombre) y `paginasAdjuntos` (las páginas de imagen), las
  dos compartidas por la orden de una pieza y la del pedido.

## Al terminar una tarea

- Añade/actualiza tests donde haya tests (motor: obligatorio).
- Si has tocado algo pendiente de taller/dirección, actualiza `PENDIENTES.md` y esta guía si cambió una convención.
