# Prompt para IA: miniaturas SVG de las figuras de Atelier Studio

> **ESTE ENCARGO YA ESTÁ HECHO (2026-07-29) y varias indicaciones de §3 y §4 resultaron
> equivocadas al medir los SVG de referencia.** Lo implementado, y la referencia buena, están en
> [docs/07-visor-3d.md](docs/07-visor-3d.md) y [PENDIENTES.md](PENDIENTES.md) §2. Correcciones:
> los dientes van a plena altura y con la base a ras del frontal (no en escalera ni con anchos
> 0,7/0,6); la Figura 4 no lleva dientes, solo el retorno; el canto del peldaño romo no es una
> media caña (2026-07-31: curva achatada de vuelo = un cuarto del espesor, «D» y no «U» —
> ver PENDIENTES.md §2); y la pieza NO se dibuja «larga y delgada» — la tarifa
> dibuja una losa gruesa y a 96 × 64 px hay que exagerar la sección para que se distinga.
> Se conserva este documento solo como registro del encargo original.

> Cómo usar este documento: pégalo íntegro en el chat de la IA (Claude, GPT,
> Gemini…) **junto con el croquis acotado (imagen) y los SVG vectorizados de
> referencia (`figura1.svg`…`figura4.svg`)**, y dale acceso al repo si puede
> editar archivos. Está pensado para una IA de código, no para una generadora
> de imágenes.

---

## 1. Contexto

Atelier Studio es un configurador de presupuestos para un taller de cerámica.
En el paso ② «Figura», el comercial elige la figura a fabricar (peldaño,
pasamanos, rodapié…) en una galería de tarjetas; cada tarjeta muestra una
miniatura de la figura. Las miniaturas actuales NO gustan: deben parecerse a
los dibujos de la tarifa PDF del taller (piezas alargadas en perspectiva,
terracota, trazo fino negro), como el croquis y los SVG de referencia
adjuntos.

**Tu tarea: dibujar e implementar las 13 miniaturas (una por figura) como SVG
inline, con calidad visual comparable a los dibujos de referencia.**

## 2. Entregable (qué archivo tocar y qué contrato mantener)

- Edita **solo** `src/ui/steps/MiniaturaFigura.tsx`.
- Un SVG inline por figura, en un mapa `PERFILES: Readonly<Record<string, () => JSX.Element>>`
  indexado por **id de figura** (lista en §4).
- Contrato del componente (los tests dependen de él):
  - `MiniaturaFigura({ figura }: { figura: Figura })`: si
    `figura.estado === 'pendiente'`, devuelve la silueta gris `SiluetaPendiente`
    (ya existe: consérvala tal cual).
  - Cada miniatura: `<svg viewBox="0 0 96 64" className="h-16 w-24 shrink-0" role="img"
    aria-label={`Perfil de ${figura.nombre}`}>`.
  - Id desconocido: fallback al dibujo de `corte`.
- TypeScript + React (JSX). Sin imágenes externas, sin librerías nuevas,
  determinista (mismo id → mismo SVG siempre).
- Debe pasar en verde: `npm run typecheck`, `npm run lint`, `npx vitest run`.

## 3. Estilo visual (imítalo de la referencia)

- Pieza **alargada** en vista de tres cuartos (desde delante-izquierda-arriba):
  cara superior clara `#CA9375`, cara delantera oscura `#B77551`, testa (cara
  del extremo) media `#C1835D`; trazo negro fino `#090A0C`
  (`stroke-width` ≈ 0.7–0.8, `stroke-linejoin="round"`).
- Proporciones **reales** del croquis (cm): largo dibujado ≈ 10, grosor de la
  tapa 0,5, frontal 1,5 → altura total 2 (2,5 en Figura 4). La pieza debe verse
  **larga y delgada** — no un bloque rechoncho.
- La sección transversal se lee en la testa del extremo derecho (como en el
  croquis): ahí se ven el chaflán, los dientes y el retorno.
- El canto delantero mira a la derecha-abajo; el fondo recede a la
  izquierda-arriba. Sombra suave elíptica bajo la pieza (gris muy tenue).
- Truco opcional si generas el SVG por código (proyección isométrica):
  `screen = (ox + (x − z)·0.866, oy + (x + z)·0.5 − y)` con x = largo,
  y = alto, z = fondo; caras visibles +Y (superior), +Z (delantera), +X (testa).

## 4. Figuras y geometría (sección transversal, en cm)

Ids y nombres (id → nombre):

| id | nombre |
|---|---|
| `figura-1`…`figura-4` | Figura 1…4 |
| `peldano-romo` | Peldaño romo |
| `pasamanos-1`…`pasamanos-4` | Pasamanos 1…4 |
| `pasamanos-romo` | Pasamanos romo |
| `rodapie-estandar` | Rodapié 7,2 y 8 cm |
| `rodapie-no-estandar` | Rodapié no estándar |
| `corte` | Corte de piezas |

Común a las Figuras 1–4: **chaflán a 45°** en el canto superior delantero de la
tapa (pequeño, ≈ 0,2); la tapa (0,5) cubre todo el fondo; el frontal cuelga a
ras del canto delantero.

- **figura-1**: L — tapa 0,5 + frontal 1,5 a ras (total 2).
- **figura-2**: L + **1 diente** tras el frontal (ancho 0,7, misma altura que el
  frontal).
- **figura-3**: L + **2 dientes** tras el frontal (anchos 0,7 y 0,6).
- **figura-4**: frontal **alzado** sobre el retorno: retorno en la base (0,5 de
  alto, 1,0 de profundidad hacia dentro), frontal 1,5 encima, tapa 0,5 (total
  2,5; fondo total del perfil 1,5).
- **peldano-romo**: losa única de 0,5 con el canto delantero romado. (El encargo
  original decía «media caña»; corregido 2026-07-31: curva achatada de vuelo = un
  cuarto del espesor.)
- **pasamanos-1 / 2 / 3 / 4**: el mismo dibujo que su Figura equivalente pero
  aplicado **también en el lado opuesto** (espejo: frontal, dientes y retorno
  en ambos cantos; chaflán en ambos cantos superiores).
- **pasamanos-romo**: losa con el canto romado en **ambos** cantos.
- **rodapie-estandar** y **rodapie-no-estandar**: listón vertical (largo × ≈7,5
  alto × 0,5 grosor). Comparten dibujo.
- **corte**: placa plana tumbada de 0,5 de grosor.

## 5. Qué NO hacer

- No toques `public/config/*.json`, el motor (`src/domain/`) ni otros
  componentes.
- No uses PNG ni assets externos: todo SVG inline.
- No inventes geometría: los dientes van tras el frontal a plena altura; el
  retorno sobresale hacia dentro en la base; el chaflán es solo el bisel del
  canto superior.
- Nada de perfiles planos 2D ni de bloques gruesos: la referencia manda.
- Comentarios del código en español.

## 6. Verificación antes de entregar

1. `npm run typecheck && npm run lint && npx vitest run` — todo en verde.
2. `npm run dev` → paso ② Figura: las 13 tarjetas muestran su miniatura, se
   distinguen claramente entre sí y se parecen a los dibujos de referencia.
