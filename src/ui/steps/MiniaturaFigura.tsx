/**
 * Miniaturas del paso ② Figura.
 *
 * Cada figura se dibuja siguiendo los dibujos de la tarifa de Torelos (Juny
 * 2023), vectorizados y entregados como referencia: la pieza en vista de tres
 * cuartos desde arriba-delante, con trazo fino y **la sección transversal a la
 * vista en la testa del extremo cercano** — que es donde se distingue una figura
 * de otra (chaflán, dientes, retorno, media caña). El color es gris claro, no la
 * terracota del original (ver la paleta más abajo).
 *
 * Cómo se dibuja (un solo motor para las 13 figuras):
 *  1. Cada figura declara su SECCIÓN en el plano (z = fondo, y = alto) como un
 *     contorno cerrado en sentido antihorario, partido en tramos.
 *  2. Cada tramo sabe si su cara lateral se ve desde la cámara; los que se ven
 *     se extruyen a lo largo del largo (eje x) como paralelogramo.
 *  3. La testa es el propio contorno proyectado en el extremo cercano, con las
 *     juntas de encolado dibujadas encima (es el detalle que identifica la
 *     figura).
 *
 * Proporciones: la sección va EXAGERADA respecto a la tarifa a propósito. El
 * dibujo original es una losa de ~19 grosores de fondo; a 96 × 64 px eso deja
 * el grosor en ~2,5 px y los dientes dejan de verse. Aquí el fondo son 8
 * grosores, así que cada diente mide ~6 px y las 13 tarjetas se distinguen.
 *
 * PROVISIONAL (§3): la geometría sale de los dibujos de la tarifa, no de un
 * croquis acotado de taller. Ver PENDIENTES.md §2.
 */

import type { ReactNode } from 'react';
import type { Figura } from '../../domain/config';

// Gris claro neutro (paleta slate de la app), no la terracota de la tarifa
// (2026-07-29, indicación directa): la pieza real puede ser de cualquier
// material, así que la miniatura no le presupone color. Se conserva el orden
// tonal del dibujo original — testa y cantos redondeados claros, cara superior
// media, frontal un punto más oscura — para que el pliegue se lea a 96 px, donde
// el trazo es un pelo.
const SUPERIOR = '#BFC8D3';
const FRONTAL = '#A3AEBC';
const CLARA = '#D8DEE6';
const TRAZO = '#0F172A';
const ANCHO_TRAZO = 0.9;

// Dimensiones del dibujo, en grosores de baldosa (1 ud = 1 grosor).
const G = 1; // grosor de la baldosa
const ALTO = 3; // alto total del peldaño (tapa + frontal), como en la tarifa
const FONDO = 11; // fondo de la tapa
const LARGO = 9; // largo dibujado de la pieza
const RETORNO = 2; // profundidad del retorno (Figura 4 y Pasamanos 4)
const ALTO_RODAPIE = 5;
const LARGO_RODAPIE = 14;
const ANCHO_CORTE = 6;
const LARGO_CORTE = 9;

// Proyección axonométrica, en px de viewBox por unidad de dibujo: el largo (+x)
// viene hacia el observador por la derecha-abajo, el fondo (+z) va hacia el
// frente por la izquierda-abajo, y el alto (+y) sube en vertical.
//
// La cámara va un poco más alta que en la tarifa (pendiente 0,44 frente a 0,25):
// el dibujo original es una tira de 2,7:1 y el marco de la tarjeta es 1,5:1, así
// que con el ángulo exacto de la tarifa la pieza saldría con media tarjeta vacía
// y la sección la mitad de grande.
const EJE_LARGO = [0.9, 0.45] as const;
const EJE_FONDO = [-0.92, 0.4] as const;
const ESCALA = 4.9; // común a todas las figuras: en la galería pesan todas igual
const VISTA_ANCHO = 96;
const VISTA_ALTO = 64;

/** Punto de la sección: (z = fondo, y = alto), en unidades de dibujo. */
type Punto = readonly [number, number];

/** Qué cara lateral genera un tramo del contorno (null = no se ve). */
type Cara = 'superior' | 'frontal' | 'canto' | null;

/**
 * Tramo del contorno. Su último punto es el primero del tramo siguiente, y el
 * último tramo cierra sobre el primero.
 */
interface Tramo {
  readonly puntos: readonly Punto[];
  readonly cara: Cara;
}

interface Seccion {
  readonly tramos: readonly Tramo[];
  /** Juntas de encolado dibujadas sobre la testa (identifican la figura). */
  readonly juntas: readonly (readonly [Punto, Punto])[];
  readonly largo: number;
}

const RELLENO: Readonly<Record<Exclude<Cara, null>, string>> = {
  superior: SUPERIOR,
  frontal: FRONTAL,
  canto: CLARA,
};

/**
 * Peldaños y pasamanos: tapa de un grosor sobre una nariz MACIZA a plena altura,
 * unidas con chaflán a 45° (así lo corta el taller). La nariz mide
 * `dientes + 1` grosores, más `RETORNO` en la Figura 4. Con `espejo`, la misma
 * nariz también en el canto opuesto (pasamanos).
 *
 * Los dientes van a plena altura y con la base a ras del frontal, no en
 * escalera: el borde inferior de la nariz es una sola recta en los dibujos de
 * referencia de las Figuras 2 y 3. El retorno de la Figura 4 tampoco deja hueco
 * bajo la tapa (2026-07-29, indicación directa): se ve como junta encolada, no
 * como pestaña. Esas juntas son internas, así que van aparte del contorno.
 */
function seccionEscuadra({
  dientes,
  retorno,
  espejo,
}: {
  readonly dientes: number;
  readonly retorno: boolean;
  readonly espejo: boolean;
}): Seccion {
  const bajoTapa = ALTO - G; // cara inferior de la tapa
  const nariz = (dientes + 1) * G + (retorno ? RETORNO : 0);

  const tramos: Tramo[] = [
    { puntos: [[espejo ? nariz : 0, bajoTapa], [FONDO - nariz, bajoTapa]], cara: null },
    { puntos: [[FONDO - nariz, bajoTapa], [FONDO - nariz, 0]], cara: null },
    { puntos: [[FONDO - nariz, 0], [FONDO, 0]], cara: null },
    { puntos: [[FONDO, 0], [FONDO, ALTO]], cara: 'frontal' },
    { puntos: [[FONDO, ALTO], [0, ALTO]], cara: 'superior' },
  ];
  if (espejo) {
    tramos.push(
      { puntos: [[0, ALTO], [0, 0]], cara: null },
      { puntos: [[0, 0], [nariz, 0]], cara: null },
      { puntos: [[nariz, 0], [nariz, bajoTapa]], cara: null },
    );
  } else {
    tramos.push({ puntos: [[0, ALTO], [0, bajoTapa]], cara: null });
  }

  // Juntas de encolado sobre la testa, por canto manipulado.
  const juntas: (readonly [Punto, Punto])[] = [];
  const cantos: readonly (readonly [number, 1 | -1])[] = espejo
    ? [
        [FONDO, -1],
        [0, 1],
      ]
    : [[FONDO, -1]];
  for (const [borde, signo] of cantos) {
    const dentro = (d: number): number => borde + signo * d;
    // Chaflán a 45° tapa/frontal, y la cara inferior de la tapa sobre la nariz.
    juntas.push([[dentro(G), bajoTapa], [borde, ALTO]]);
    if (nariz > G) juntas.push([[dentro(G), bajoTapa], [dentro(nariz), bajoTapa]]);
    if (retorno) {
      // Frontal encolado sobre el retorno: chaflán a 45° en la base, cara
      // interior del frontal y cara superior del retorno.
      juntas.push([[borde, 0], [dentro(G), G]]);
      juntas.push([[dentro(G), G], [dentro(G), bajoTapa]]);
      juntas.push([[dentro(G), G], [dentro(nariz), G]]);
    } else {
      // Un diente por grosor, a plena altura.
      for (let i = 1; i <= dientes; i += 1) {
        juntas.push([[dentro(i * G), 0], [dentro(i * G), bajoTapa]]);
      }
    }
  }

  return { tramos, juntas, largo: LARGO };
}

const SEGMENTOS_ARCO = 10;

/** Media caña: semicircunferencia de radio medio grosor, de `desde` a `hasta` grados. */
function arco(cz: number, cy: number, desde: number, hasta: number): readonly Punto[] {
  const radio = G / 2;
  const puntos: Punto[] = [];
  for (let i = 0; i <= SEGMENTOS_ARCO; i += 1) {
    const angulo = ((desde + ((hasta - desde) * i) / SEGMENTOS_ARCO) * Math.PI) / 180;
    puntos.push([cz + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)]);
  }
  return puntos;
}

/**
 * Peldaño romo: una sola losa de un grosor con el canto delantero en media caña
 * (semicircunferencia de radio medio grosor, o sea el grosor entero de diámetro,
 * como en el dibujo de la tarifa). `doble` la repite en el canto trasero
 * (pasamanos romo).
 */
function seccionRomo({ doble }: { readonly doble: boolean }): Seccion {
  const r = G / 2;
  const zNariz = FONDO - r;
  const zTrasero = doble ? r : 0;
  const tramos: Tramo[] = [
    { puntos: [[zTrasero, 0], [zNariz, 0]], cara: null },
    { puntos: arco(zNariz, r, -90, 90), cara: 'canto' },
    { puntos: [[zNariz, G], [zTrasero, G]], cara: 'superior' },
  ];
  tramos.push(
    doble
      ? { puntos: arco(r, r, 90, 270), cara: null }
      : { puntos: [[0, G], [0, 0]], cara: null },
  );
  return { tramos, juntas: [], largo: LARGO };
}

/**
 * Rodapié: listón de pie con el canto superior romo o biselado («Rodapeu romat o
 * bisellat» en la tarifa; el dibujo lleva la banda clara arriba). Los dos
 * rodapiés comparten dibujo.
 */
function seccionListon(): Seccion {
  const r = G / 2;
  const cima = ALTO_RODAPIE - r;
  return {
    tramos: [
      { puntos: [[0, 0], [G, 0]], cara: null },
      { puntos: [[G, 0], [G, cima]], cara: 'frontal' },
      { puntos: arco(r, cima, 0, 180), cara: 'canto' },
      { puntos: [[0, cima], [0, 0]], cara: null },
    ],
    juntas: [],
    largo: LARGO_RODAPIE,
  };
}

/** Corte de piezas: placa plana tumbada de un grosor, sin manipular ningún canto. */
function seccionPlancha(): Seccion {
  return {
    tramos: [
      { puntos: [[0, 0], [ANCHO_CORTE, 0]], cara: null },
      { puntos: [[ANCHO_CORTE, 0], [ANCHO_CORTE, G]], cara: 'frontal' },
      { puntos: [[ANCHO_CORTE, G], [0, G]], cara: 'superior' },
      { puntos: [[0, G], [0, 0]], cara: null },
    ],
    juntas: [],
    largo: LARGO_CORTE,
  };
}

/** Contorno cerrado de la sección (los tramos comparten extremos). */
function contorno(seccion: Seccion): readonly Punto[] {
  return seccion.tramos.flatMap((t) => t.puntos.slice(0, -1));
}

function proyectarCrudo(x: number, [z, y]: Punto): readonly [number, number] {
  return [x * EJE_LARGO[0] + z * EJE_FONDO[0], x * EJE_LARGO[1] + z * EJE_FONDO[1] - y];
}

/**
 * Proyector de la sección: escala fija (todas las figuras pesan igual en la
 * galería) y centrado de la pieza en el viewBox.
 */
function crearProyector(seccion: Seccion): (x: number, punto: Punto) => readonly [number, number] {
  const puntos = contorno(seccion);
  const crudos = [
    ...puntos.map((p) => proyectarCrudo(0, p)),
    ...puntos.map((p) => proyectarCrudo(seccion.largo, p)),
  ];
  const xs = crudos.map((c) => c[0]);
  const ys = crudos.map((c) => c[1]);
  const cz = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return (x, punto) => {
    const [px, py] = proyectarCrudo(x, punto);
    return [(px - cz) * ESCALA + VISTA_ANCHO / 2, (py - cy) * ESCALA + VISTA_ALTO / 2];
  };
}

/** Dibuja la pieza: caras laterales vistas, testa del extremo cercano y juntas. */
function Pieza({ seccion }: { readonly seccion: Seccion }): JSX.Element {
  const proyectar = crearProyector(seccion);
  const coord = (x: number, punto: Punto): string =>
    proyectar(x, punto)
      .map((n) => n.toFixed(2))
      .join(',');
  const testa = contorno(seccion)
    .map((p) => coord(seccion.largo, p))
    .join(' ');

  return (
    <g stroke={TRAZO} strokeWidth={ANCHO_TRAZO} strokeLinejoin="round" strokeLinecap="round">
      {seccion.tramos.map((tramo, i) =>
        tramo.cara === null ? null : (
          <polygon
            key={`cara-${i}`}
            fill={RELLENO[tramo.cara]}
            points={[
              ...tramo.puntos.map((p) => coord(0, p)),
              ...[...tramo.puntos].reverse().map((p) => coord(seccion.largo, p)),
            ].join(' ')}
          />
        ),
      )}
      <polygon fill={CLARA} points={testa} />
      {seccion.juntas.map(([a, b], i) => {
        const [x1, y1] = proyectar(seccion.largo, a);
        const [x2, y2] = proyectar(seccion.largo, b);
        return (
          <line
            key={`junta-${i}`}
            x1={x1.toFixed(2)}
            y1={y1.toFixed(2)}
            x2={x2.toFixed(2)}
            y2={y2.toFixed(2)}
          />
        );
      })}
    </g>
  );
}

/** Marco común de las miniaturas: viewBox fijo y etiqueta accesible. */
function Perfil({
  etiqueta,
  children,
}: {
  readonly etiqueta: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${VISTA_ANCHO} ${VISTA_ALTO}`}
      className="h-16 w-24 shrink-0"
      role="img"
      aria-label={etiqueta}
    >
      {children}
    </svg>
  );
}

const ESCUADRA = (dientes: number, retorno = false, espejo = false): Seccion =>
  seccionEscuadra({ dientes, retorno, espejo });

/** Sección por id de figura (los dos rodapiés comparten dibujo). */
const SECCIONES: Readonly<Record<string, () => Seccion>> = {
  'figura-1': () => ESCUADRA(0),
  'figura-2': () => ESCUADRA(1),
  'figura-3': () => ESCUADRA(2),
  'figura-4': () => ESCUADRA(0, true),
  'peldano-romo': () => seccionRomo({ doble: false }),
  'pasamanos-1': () => ESCUADRA(0, false, true),
  'pasamanos-2': () => ESCUADRA(1, false, true),
  'pasamanos-3': () => ESCUADRA(2, false, true),
  'pasamanos-4': () => ESCUADRA(0, true, true),
  'pasamanos-romo': () => seccionRomo({ doble: true }),
  'rodapie-estandar': seccionListon,
  'rodapie-no-estandar': seccionListon,
  corte: seccionPlancha,
};

/** Silueta gris genérica para figuras pendientes (hoy ninguna en la galería). */
function SiluetaPendiente(): JSX.Element {
  return (
    <svg
      viewBox="0 0 96 64"
      className="h-16 w-24 shrink-0"
      role="img"
      aria-label="Figura pendiente de definir"
    >
      <rect
        x="24"
        y="14"
        width="48"
        height="34"
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth="2"
        strokeDasharray="5 4"
        rx="3"
      />
      <text x="48" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="#94a3b8">
        ?
      </text>
    </svg>
  );
}

export function MiniaturaFigura({ figura }: { figura: Figura }): JSX.Element {
  if (figura.estado === 'pendiente') {
    return <SiluetaPendiente />;
  }
  // Figura activa sin sección asignada (no debería ocurrir): placa genérica.
  const seccion = (SECCIONES[figura.id] ?? SECCIONES.corte)();
  return (
    <Perfil etiqueta={`Perfil de ${figura.nombre}`}>
      <Pieza seccion={seccion} />
    </Perfil>
  );
}
