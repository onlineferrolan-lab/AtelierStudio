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
import type { CantoListon, Figura } from '../../domain/config';

// Gris claro neutro (paleta slate de la app), no la terracota de la tarifa
// (2026-07-29, indicación directa): la pieza real puede ser de cualquier
// material, así que la miniatura no le presupone color. Se conserva el orden
// tonal del dibujo original — testa y cantos redondeados claros, cara superior
// media, frontal un punto más oscura, y una cuarta para lo retranqueado (ver
// SOMBRA) — para que el pliegue se lea a 96 px, donde el trazo es un pelo.
const SUPERIOR = '#BFC8D3';
const FRONTAL = '#A3AEBC';
const CLARA = '#D8DEE6';
// Un paso más oscura que el frontal, para las caras que quedan RETRANQUEADAS
// detrás de otra (hoy solo el zócalo de la tabica). Con el mismo gris que el
// frontal las dos bandas se fundían en una sola mancha y el retranqueo —lo único
// que distingue una tabica de un frontal alto— no se veía; en sombra del vuelo
// de la nariz, que es donde está de verdad, se lee de un vistazo.
const SOMBRA = '#8794A6';
const TRAZO = '#0F172A';
const ANCHO_TRAZO = 0.9;

// Dimensiones del dibujo, en grosores de baldosa (1 ud = 1 grosor).
const G = 1; // grosor de la baldosa
const ALTO = 3; // alto total del peldaño (tapa + frontal), como en la tarifa
const FONDO = 11; // fondo de la tapa
const LARGO = 9; // largo dibujado de la pieza
const RETORNO = 2; // profundidad del retorno (Figura 4 y Pasamanos 4)
// TABICA. La tapa se dibuja IGUAL que en las demás figuras (mismo LARGO y
// FONDO): lo único que se dimensiona aquí es lo que CUELGA de ella.
//
// El presupuesto vertical va contado, porque el viewBox no perdona y no hay
// autoescala. Con esta cámara el alto proyectado son tres sumandos (en unidades
// de dibujo):  LARGO·0,45 + z_del_punto_más_bajo·0,4 + alto_total.
// La figura 1 gasta 4,05 + 11·0,4 + 3 = 11,45 ud → 56,1 px. La tabica gana algo
// porque su punto más bajo es la base del ZÓCALO, que está retranqueada y no en
// el canto delantero: 4,05 + 10·0,4 + 4,2 = 12,25 ud → 60,0 px de alto por 89,3
// de ancho. Queda 2 px de aire por lado en los 64 del viewBox, y 60 frente a los
// 56,1 de la figura 1 es la misma altura aparente de la familia — con la pieza
// real pasa igual, cuelga algo más que un peldaño y se le nota.
//
// Reparto de los 3,2 ud que cuelgan: en la pieza real la relación caída/zócalo
// es 4/15, o sea que la nariz apenas asoma. Aquí se abre a 0,8/3,2 = 1/4, lo
// justo para que la nariz siga siendo un labio corto (4 px, 9 px contando el
// canto de la tapa que va en la misma banda) y el zócalo baje 12 px más que
// ella. Antes la caída era de 2 ud y el zócalo de 3: solo 1 ud de diferencia, y
// el panel parecía una pestaña mal cortada en vez de una contrahuella.
const ALTO_ZOCALO = 3.2; // lo que baja el zócalo bajo la cara inferior de la tapa
const CAIDA_TABICA = 0.8; // la nariz: corta a propósito, es la que vuela
// El retranqueo del zócalo NO se exagera: vale un grosor de baldosa, como en la
// pieza real (el zócalo se pega contra la cara trasera de la nariz, que es de un
// grosor). Son 4,5 px de escalón, suficientes porque además hay salto de tono.
// El ESPESOR dibujado del zócalo sí va al doble, por la misma razón que el fondo
// va a 8 grosores y no a los 19 de la tarifa: a un grosor el panel quedaba en una
// aleta de 4 px y en la testa no se leía como panel. Con tres parecía una viga.
const GRUESO_ZOCALO = 2;
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
type Cara = 'superior' | 'frontal' | 'canto' | 'sombra' | null;

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
  sombra: SOMBRA,
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
  const alto = ALTO;
  const bajoTapa = alto - G; // cara inferior de la tapa
  const nariz = (dientes + 1) * G + (retorno ? RETORNO : 0);

  const tramos: Tramo[] = [
    { puntos: [[espejo ? nariz : 0, bajoTapa], [FONDO - nariz, bajoTapa]], cara: null },
    { puntos: [[FONDO - nariz, bajoTapa], [FONDO - nariz, 0]], cara: null },
    { puntos: [[FONDO - nariz, 0], [FONDO, 0]], cara: null },
    { puntos: [[FONDO, 0], [FONDO, alto]], cara: 'frontal' },
    { puntos: [[FONDO, alto], [0, alto]], cara: 'superior' },
  ];
  if (espejo) {
    tramos.push(
      { puntos: [[0, alto], [0, 0]], cara: null },
      { puntos: [[0, 0], [nariz, 0]], cara: null },
      { puntos: [[nariz, 0], [nariz, bajoTapa]], cara: null },
    );
  } else {
    tramos.push({ puntos: [[0, alto], [0, bajoTapa]], cara: null });
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
    juntas.push([[dentro(G), bajoTapa], [borde, alto]]);
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
 * Chaflán del microbiselado en la miniatura: 0,35 grosores frente a los 0,15 de
 * la pieza real (`CHAFLAN_MICROBISEL` en `seccionPieza.ts`). Va exagerado a
 * propósito, como el resto de proporciones de este fichero: a tamaño real el
 * microbisel mide 1 px en la tarjeta y las tres variantes de rodapié se verían
 * idénticas, que es justo lo que la galería tiene que distinguir.
 */
const CHAFLAN_MINIATURA = 0.35;

/**
 * Rodapié: listón de pie rematado por arriba según el canto de la figura
 * (2026-07-31). El romado es la media caña de la tarifa («Rodapeu romat o
 * bisellat»); el microbiselado mata solo el filo delantero; el recto lo deja
 * vivo. Las nueve figuras de rodapié salen de aquí, tres dibujos para las tres
 * alturas.
 */
function seccionListon(canto: CantoListon): Seccion {
  const base = { puntos: [[0, 0], [G, 0]] as readonly Punto[], cara: null };
  const trasera = (desdeY: number): Tramo => ({
    puntos: [[0, desdeY], [0, 0]],
    cara: null,
  });

  if (canto === 'recto') {
    return {
      tramos: [
        base,
        { puntos: [[G, 0], [G, ALTO_RODAPIE]], cara: 'frontal' },
        { puntos: [[G, ALTO_RODAPIE], [0, ALTO_RODAPIE]], cara: 'superior' },
        trasera(ALTO_RODAPIE),
      ],
      juntas: [],
      largo: LARGO_RODAPIE,
    };
  }
  if (canto === 'microbiselado') {
    const c = G * CHAFLAN_MINIATURA;
    return {
      tramos: [
        base,
        { puntos: [[G, 0], [G, ALTO_RODAPIE - c]], cara: 'frontal' },
        { puntos: [[G, ALTO_RODAPIE - c], [G - c, ALTO_RODAPIE]], cara: 'canto' },
        { puntos: [[G - c, ALTO_RODAPIE], [0, ALTO_RODAPIE]], cara: 'superior' },
        trasera(ALTO_RODAPIE),
      ],
      juntas: [],
      largo: LARGO_RODAPIE,
    };
  }
  const r = G / 2;
  const cima = ALTO_RODAPIE - r;
  return {
    tramos: [
      base,
      { puntos: [[G, 0], [G, cima]], cara: 'frontal' },
      { puntos: arco(r, cima, 0, 180), cara: 'canto' },
      trasera(cima),
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

/**
 * Tabica: figura 1 con un zócalo colgado POR DETRÁS de la nariz, con su borde
 * superior tocando la cara inferior de la tapa (2026-07-31, indicación directa;
 * la forma buena vive en `seccionTabica` de `src/piezas/seccionPieza.ts` y esta
 * es su versión esquemática). Dos cosas y solo dos tiene que contar el dibujo:
 * la nariz es CORTA y VUELA, y el zócalo va RETRANQUEADO y baja MÁS. Si esas dos
 * no se leen, la tarjeta es indistinguible de un peldaño con frontal alto.
 *
 *      fondo                       frente
 *        +===========================+     tapa (LARGO y FONDO estándar)
 *                          |    |####|     nariz: cae CAIDA_TABICA y vuela
 *                    +-----+####+----+
 *                    |ZZZZZ|                zócalo: retranqueado un grosor y
 *                    +-----+                bajando hasta ALTO_ZOCALO
 */
function seccionTabica(): Seccion {
  // De la cara inferior de la tapa cuelgan las dos piezas, así que la altura
  // total la marca la más larga (el zócalo).
  const alto = ALTO_ZOCALO + G;
  const bajoTapa = alto - G;
  const yNariz = bajoTapa - CAIDA_TABICA; // base de la nariz: por encima del suelo
  const zNariz = FONDO - G; // cara trasera de la nariz = cara vista del zócalo
  const zZocalo = zNariz - GRUESO_ZOCALO; // cara trasera del zócalo

  // El contorno se recorre de ATRÁS hacia ADELANTE (empezando por el canto
  // trasero de la tapa y terminando en el delantero), y esto no es cosmética:
  //  1. El motor no calcula oclusión, pinta los tramos en el orden del array y
  //     el último tapa al anterior. Las caras del zócalo y de la nariz se solapan
  //     en pantalla (van en planos paralelos separados un escalón), así que el
  //     zócalo tiene que ir ANTES para que la nariz, que está delante, quede
  //     encima. Con el recorrido al revés la nariz aparecía cortada por el panel
  //     que tiene detrás.
  //  2. Estos mismos puntos, en este mismo orden, forman el polígono de la testa.
  // Es el orden que usa `seccionEscuadra`: primero el frontal, la superior al final.
  const tramos: Tramo[] = [
    { puntos: [[0, alto], [0, bajoTapa]], cara: null }, // canto trasero, de espaldas
    { puntos: [[0, bajoTapa], [zZocalo, bajoTapa]], cara: null }, // cara inferior de la tapa
    { puntos: [[zZocalo, bajoTapa], [zZocalo, 0]], cara: null }, // trasera del zócalo
    { puntos: [[zZocalo, 0], [zNariz, 0]], cara: null }, // base del zócalo, mira al suelo
    // Cara vista del zócalo: en sombra bajo el vuelo de la nariz, de ahí el gris
    // más oscuro. Solo se ve de la base de la nariz hacia abajo; por encima está
    // pegada contra ella.
    { puntos: [[zNariz, 0], [zNariz, yNariz]], cara: 'sombra' },
    { puntos: [[zNariz, yNariz], [FONDO, yNariz]], cara: null }, // el vuelo, visto por debajo
    // Nariz + canto de la tapa, en un solo frontal como en las demás figuras.
    { puntos: [[FONDO, yNariz], [FONDO, alto]], cara: 'frontal' },
    { puntos: [[FONDO, alto], [0, alto]], cara: 'superior' },
  ];

  // Juntas de encolado sobre la testa: cara inferior de la tapa sobre la nariz, y
  // cara trasera de la nariz contra el zócalo. Son exactamente las dos que declara
  // `seccionTabica` en `seccionPieza.ts`, y aquí además refuerzan el escalón, que
  // es el detalle que hay que ver. NO se añade el chaflán a 45° tapa/frontal que
  // sí llevan las escuadras: la sección confirmada de la tabica no lo declara y
  // las miniaturas no pueden contradecirla (§0, no inventar geometría).
  const juntas: (readonly [Punto, Punto])[] = [
    [[zNariz, bajoTapa], [FONDO, bajoTapa]],
    [[zNariz, yNariz], [zNariz, bajoTapa]],
  ];

  return { tramos, juntas, largo: LARGO };
}

/**
 * Sección por id de figura. Los rodapiés NO están aquí: son nueve figuras que
 * comparten tres dibujos, así que su sección se saca del canto de la receta
 * (ver `MiniaturaFigura`) y no de una entrada por id que habría que duplicar
 * nueve veces y mantener a mano.
 */
const SECCIONES: Readonly<Record<string, () => Seccion>> = {
  'figura-1': () => ESCUADRA(0),
  'figura-2': () => ESCUADRA(1),
  'figura-3': () => ESCUADRA(2),
  'figura-4': () => ESCUADRA(0, true),
  tabica: () => seccionTabica(),
  'peldano-romo': () => seccionRomo({ doble: false }),
  'pasamanos-1': () => ESCUADRA(0, false, true),
  'pasamanos-2': () => ESCUADRA(1, false, true),
  'pasamanos-3': () => ESCUADRA(2, false, true),
  'pasamanos-4': () => ESCUADRA(0, true, true),
  'pasamanos-romo': () => seccionRomo({ doble: true }),
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
  // Los rodapiés se dibujan por el canto de su receta, no por id: nueve figuras,
  // tres dibujos. El resto va por id; sin sección asignada (no debería ocurrir),
  // placa genérica.
  const liston = figura.componentes.find((c) => c.id === 'liston');
  const seccion = liston
    ? seccionListon(liston.canto ?? 'romado')
    : (SECCIONES[figura.id] ?? SECCIONES.corte)();
  return (
    <Perfil etiqueta={`Perfil de ${figura.nombre}`}>
      <Pieza seccion={seccion} />
    </Perfil>
  );
}
