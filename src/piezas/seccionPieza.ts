/**
 * Sección transversal de la pieza: única fuente de verdad de su forma.
 *
 * Módulo PURO (sin three.js, sin React, sin jsPDF) para que lo compartan los
 * tres sitios que dibujan la pieza y no puedan contradecirse entre sí:
 *  - el visor 3D (`src/viewer/geometria.ts`), que extruye esta sección;
 *  - el croquis del PDF de orden de trabajo (`src/pdf/ordenTrabajo.ts`);
 *  - (las miniaturas del paso ② tienen su propia versión ESQUEMÁTICA, con las
 *    proporciones exageradas a propósito para leerse a 96 × 64 px — ver
 *    `src/ui/steps/MiniaturaFigura.tsx`).
 *
 * Tener la forma duplicada ya causó un fallo real (el visor dibujaba los
 * dientes en escalera y las miniaturas a ras): de ahí este módulo.
 *
 * Sistema de coordenadas: plano (z = fondo, y = alto) en centímetros, con
 * z = 0 en el canto trasero y y = 0 en la base. El frente de la pieza está en
 * z = fondo y la cara vista de la tapa en y = alto. Contorno en sentido
 * antihorario (z hacia la derecha, y hacia arriba).
 *
 * La forma sale de los dibujos de la tarifa de Torelos (Juny 2023)
 * vectorizados; sigue siendo PROVISIONAL mientras no llegue el croquis acotado
 * oficial de taller (§3, PENDIENTES.md §2).
 */

/** Punto de la sección: (z = fondo, y = alto), en cm. */
export type PuntoSeccion = readonly [number, number];

export interface SeccionPieza {
  /** Contorno cerrado en sentido antihorario; los arcos vienen ya muestreados. */
  readonly contorno: readonly PuntoSeccion[];
  /**
   * Juntas de encolado internas a la pieza (chaflanes a 45°, dientes, retorno).
   * No forman parte del contorno: son líneas de despiece, no aristas del sólido.
   */
  readonly juntas: readonly (readonly [PuntoSeccion, PuntoSeccion])[];
}

/**
 * Suplementos que cambian la FORMA de la pieza. Solo los que se cobran por
 * centímetro lineal pueden estar aquí: al ir de punta a punta de la pieza, son
 * muescas de la sección y la extrusión los reproduce exactos.
 *
 * «Angular» se cobra por pieza (es un remate del extremo, no un trabajo a lo
 * largo), así que no se representa aquí: ver PENDIENTES.md. No inventar
 * geometría (§0).
 */
export interface SuplementosSeccion {
  /** Tres ranuras antideslizantes en la cara de huella. */
  readonly antideslizante: boolean;
  /**
   * Ranura de goterón en el canto inferior del frontal, para cortar el agua que
   * baja por la contrahuella (2026-07-30, indicación directa). En el peldaño
   * romo, que no tiene frontal, va en la cara inferior junto al canto delantero.
   */
  readonly goteron: boolean;
  /**
   * Material espesado: la pieza es más gruesa (2026-07-30, indicación directa).
   * Se modela como una capa más de material bajo la tapa — la cara vista no se
   * mueve y los tejuelos de la nariz siguen siendo del grosor de baldosa.
   */
  readonly espesado: boolean;
}

export const SIN_SUPLEMENTOS: SuplementosSeccion = Object.freeze({
  antideslizante: false,
  goteron: false,
  espesado: false,
});

/**
 * Cuánto engorda «Material espesado» la tapa. PROVISIONAL (§3): consta que la
 * pieza va más gruesa, pero no cuánto; se dobla el grosor, que es lo que sale de
 * encolar una segunda capa. Preguntar a taller el espesor real.
 */
const FACTOR_ESPESADO = 2;

/**
 * Grosor de la tapa una vez aplicado «Material espesado». Lo comparten la
 * sección y el ensamblaje del visor (que necesita el alto total de la pieza),
 * para que el factor viva en un solo sitio.
 */
export function grosorConEspesado(grosor: number, suplementos: SuplementosSeccion): number {
  return suplementos.espesado ? grosor * FACTOR_ESPESADO : grosor;
}

/**
 * Medidas de las ranuras, en cm. PROVISIONALES (§3): la tarifa dice que hay
 * «tres ranuras» y un «goterón», pero no con qué sección se hacen. Solo afectan
 * al dibujo — ni la ocupación ni la tarifa dependen de ellas.
 */
const RANURAS_ANTIDESLIZANTES = 3;
const ANCHO_RANURA = 0.3;
const PROFUNDIDAD_RANURA = 0.2;
const SEPARACION_RANURA = 1;
/** Distancia del canto delantero a la primera ranura antideslizante. */
const MARGEN_RANURA = 2;
const ANCHO_GOTERON = 0.4;
const PROFUNDIDAD_GOTERON = 0.3;
/**
 * Solo para el peldaño romo: al no haber frontal, el goterón se separa un grosor
 * del canto delantero (en los peldaños va centrado en el grueso del frontal).
 */
const MARGEN_GOTERON_ROMO = 1;

/**
 * Borde horizontal recto con muescas practicadas, en orden de recorrido de
 * `zInicio` a `zFin`. `hacia` es +1 si la muesca entra hacia arriba (cara
 * inferior de la pieza) y -1 si entra hacia abajo (cara de huella).
 *
 * Las muescas que no caben enteras dentro del borde se descartan: más vale un
 * dibujo sin ranuras que un polígono que se cruza a sí mismo.
 */
function bordeConMuescas({
  y,
  zInicio,
  zFin,
  centros,
  ancho,
  profundidad,
  hacia,
}: {
  readonly y: number;
  readonly zInicio: number;
  readonly zFin: number;
  readonly centros: readonly number[];
  readonly ancho: number;
  readonly profundidad: number;
  readonly hacia: 1 | -1;
}): readonly PuntoSeccion[] {
  const sentido = Math.sign(zFin - zInicio) || 1;
  const desde = Math.min(zInicio, zFin);
  const hasta = Math.max(zInicio, zFin);
  const validos = centros
    .filter((c) => c - ancho / 2 > desde && c + ancho / 2 < hasta)
    .sort((a, b) => sentido * (a - b));
  const puntos: PuntoSeccion[] = [[zInicio, y]];
  for (const centro of validos) {
    const entrada = centro - (sentido * ancho) / 2;
    const salida = centro + (sentido * ancho) / 2;
    puntos.push(
      [entrada, y],
      [entrada, y + hacia * profundidad],
      [salida, y + hacia * profundidad],
      [salida, y],
    );
  }
  puntos.push([zFin, y]);
  return puntos;
}

/** Ejes de las tres ranuras antideslizantes, hacia dentro desde el canto delantero. */
function centrosAntideslizantes(zCantoDelantero: number, sentidoHaciaDentro: 1 | -1): number[] {
  return Array.from(
    { length: RANURAS_ANTIDESLIZANTES },
    (_, i) => zCantoDelantero + sentidoHaciaDentro * (MARGEN_RANURA + i * SEPARACION_RANURA),
  );
}

/** Segmentos por arco de media caña (24 es par, así el punto extremo cae exacto). */
const SEGMENTOS_ARCO = 24;

/**
 * Arco de radio `r` centrado en (cz, cy), de `desde` a `hasta` radianes.
 * Muestreado inclusivo en ambos extremos.
 */
function arco(
  cz: number,
  cy: number,
  r: number,
  desde: number,
  hasta: number,
): readonly PuntoSeccion[] {
  const puntos: PuntoSeccion[] = [];
  for (let i = 0; i <= SEGMENTOS_ARCO; i += 1) {
    const a = desde + ((hasta - desde) * i) / SEGMENTOS_ARCO;
    puntos.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return puntos;
}

/**
 * Peldaños y pasamanos (Figuras 1–4): tapa de un grosor sobre una nariz MACIZA
 * a plena altura. El grueso del canto sale del despiece — frontal (un grosor) +
 * `dientes` grosores + `retorno` —, y con `espejo` el canto se repite en el lado
 * opuesto (pasamanos), dejando la sección en ∩.
 *
 * El despiece llega desglosado, no como un grueso total, porque las JUNTAS
 * dependen de él: la Figura 4 lleva UNA junta (frontal/retorno), no una cada
 * grosor. Con el grueso agregado el croquis del PDF dibujaba la nariz como un
 * rayado sin sentido físico.
 *
 * Dos cosas que se leyeron mal en su día y conviene no volver a torcer:
 *  - los dientes van a plena altura y con la base a ras del frontal, NO en
 *    escalera (en los dibujos el borde inferior de la nariz es una sola recta);
 *  - el retorno de la Figura 4 engorda la nariz sin dejar hueco bajo la tapa.
 */
/**
 * TABICA: figura 1 con un zócalo colgado POR DETRÁS del frontal
 * (2026-07-31, indicación directa; corregida respecto a una primera versión que
 * lo puso a ras del frontal, prolongando la cara delantera — no es eso).
 *
 * La contrahuella clásica: la nariz del peldaño vuela y el zócalo queda metido
 * hacia dentro un grosor, con su borde superior TOCANDO la cara inferior de la
 * tapa. Dos consecuencias que se ven en el dibujo: la cara del zócalo no está
 * alineada con la del frontal, y el zócalo suele bajar más que la caída.
 *
 *      fondo                          frente
 *        +==============================+   tapa
 *                              |    |###|   frontal (caída)
 *                        +-----+####|###|
 *                        | ZZZ |----+---+
 *                        | ZZZ |             zócalo, un grosor por detrás
 *                        +-----+
 *
 * El contorno es UNO solo (las dos partes se tocan en la cara z = fondo −
 * grosor), que es lo que necesita la extrusión.
 */
export function seccionTabica({
  fondo,
  alturaFrontal,
  alturaZocalo,
  grosor,
  suplementos = SIN_SUPLEMENTOS,
}: {
  readonly fondo: number;
  /** Caída: lo que baja el frontal desde la tapa. */
  readonly alturaFrontal: number;
  /** Lo que baja el zócalo desde la MISMA cara inferior de la tapa. */
  readonly alturaZocalo: number;
  readonly grosor: number;
  readonly suplementos?: SuplementosSeccion;
}): SeccionPieza {
  const grosorTapa = grosorConEspesado(grosor, suplementos);
  // Cara inferior de la tapa: de ahí cuelgan las dos piezas, así que la altura
  // total la marca la más larga.
  const bajoTapa = Math.max(alturaFrontal, alturaZocalo);
  const alto = bajoTapa + grosorTapa;
  // Tope defensivo: con un fondo muy pequeño el zócalo se saldría de la pieza.
  const zFrontal = Math.max(fondo - grosor, 0);
  const zZocalo = Math.max(fondo - 2 * grosor, 0);

  const yFrontal = bajoTapa - alturaFrontal; // base del frontal
  const yZocalo = bajoTapa - alturaZocalo; // base del zócalo

  // Antihorario desde el canto trasero superior. La secuencia vale tanto si el
  // zócalo baja más que la caída como al revés: solo cambian yFrontal e yZocalo.
  const contorno: PuntoSeccion[] = [
    [0, alto],
    [fondo, alto],
    [fondo, yFrontal],
    [zFrontal, yFrontal],
    [zFrontal, yZocalo],
    [zZocalo, yZocalo],
    [zZocalo, bajoTapa],
    [0, bajoTapa],
  ];

  // Juntas de encolado: tapa/frontal y frontal/zócalo (donde se solapan).
  const solape = Math.min(alturaFrontal, alturaZocalo);
  const juntas: (readonly [PuntoSeccion, PuntoSeccion])[] = [
    [
      [zFrontal, bajoTapa],
      [fondo, bajoTapa],
    ],
    [
      [zFrontal, bajoTapa - solape],
      [zFrontal, bajoTapa],
    ],
  ];

  return { contorno: sinPuntosRepetidos(contorno), juntas };
}

/** Quita vértices consecutivos iguales (p. ej. si caída y zócalo miden lo mismo). */
function sinPuntosRepetidos(puntos: readonly PuntoSeccion[]): readonly PuntoSeccion[] {
  return puntos.filter(
    (p, i) => i === 0 || p[0] !== puntos[i - 1][0] || p[1] !== puntos[i - 1][1],
  );
}

export function seccionEscuadra({
  fondo,
  alto,
  grosor,
  dientes,
  retorno,
  espejo,
  suplementos = SIN_SUPLEMENTOS,
}: {
  readonly fondo: number;
  readonly alto: number;
  readonly grosor: number;
  /** Dientes tras el frontal; la nariz mide `(dientes + 1) × grosor` + retorno. */
  readonly dientes: number;
  /** Profundidad del retorno hacia dentro (Figura 4 y Pasamanos 4); 0 si no lo lleva. */
  readonly retorno: number;
  readonly espejo: boolean;
  readonly suplementos?: SuplementosSeccion;
}): SeccionPieza {
  // El espesado engorda solo la TAPA: la nariz se sigue montando con tejuelos
  // del grosor de baldosa. El llamador calcula `alto` con este mismo grosor.
  const grosorTapa = grosorConEspesado(grosor, suplementos);
  const bajoTapa = alto - grosorTapa;
  // Tope defensivo: con medidas extremas (fondo pequeño, retorno grande) la
  // sección se autointersecaría; se recorta para que siga siendo un polígono.
  const nariz = (dientes + 1) * grosor + retorno;
  const canto = Math.min(nariz, espejo ? fondo / 2 : fondo);

  // La cara de huella se recorre de delante (z = fondo) hacia atrás, así que las
  // ranuras se cuentan desde el canto delantero hacia dentro.
  const huella = suplementos.antideslizante
    ? bordeConMuescas({
        y: alto,
        zInicio: fondo,
        zFin: 0,
        centros: centrosAntideslizantes(fondo, -1),
        ancho: ANCHO_RANURA,
        profundidad: Math.min(PROFUNDIDAD_RANURA, grosor / 2),
        hacia: -1,
      })
    : ([[fondo, alto], [0, alto]] as readonly PuntoSeccion[]);
  // El goterón va en el CANTO INFERIOR DEL FRONTAL (2026-07-30, indicación
  // directa): en la cara de abajo de la nariz, centrado en el grueso del
  // frontal, que es por donde escurre el agua que baja por la contrahuella.
  const profundidadGoteron = Math.min(PROFUNDIDAD_GOTERON, bajoTapa / 2);
  const baseDelantera = suplementos.goteron
    ? bordeConMuescas({
        y: 0,
        zInicio: fondo - canto,
        zFin: fondo,
        centros: [fondo - grosor / 2],
        ancho: ANCHO_GOTERON,
        profundidad: profundidadGoteron,
        hacia: 1,
      })
    : ([[fondo - canto, 0], [fondo, 0]] as readonly PuntoSeccion[]);
  // Pasamanos: el mismo goterón bajo el frontal del canto opuesto.
  const baseTrasera = suplementos.goteron
    ? bordeConMuescas({
        y: 0,
        zInicio: 0,
        zFin: canto,
        centros: [grosor / 2],
        ancho: ANCHO_GOTERON,
        profundidad: profundidadGoteron,
        hacia: 1,
      })
    : ([[0, 0], [canto, 0]] as readonly PuntoSeccion[]);

  const zTrasTapa = espejo ? canto : 0;
  const contorno: PuntoSeccion[] = [
    [zTrasTapa, bajoTapa],
    [fondo - canto, bajoTapa],
    ...baseDelantera,
    ...huella,
  ];
  if (espejo) contorno.push(...baseTrasera);

  // Juntas por canto manipulado: chaflán a 45° tapa/frontal, cara inferior de
  // la tapa sobre la nariz, y una línea por diente.
  const juntas: (readonly [PuntoSeccion, PuntoSeccion])[] = [];
  const cantos: readonly (readonly [number, 1 | -1])[] = espejo
    ? [
        [fondo, -1],
        [0, 1],
      ]
    : [[fondo, -1]];
  for (const [borde, signo] of cantos) {
    const dentro = (d: number): number => borde + signo * Math.min(d, canto);
    juntas.push([
      [dentro(grosorTapa), bajoTapa],
      [borde, alto],
    ]);
    if (canto > grosor) {
      juntas.push([
        [dentro(grosor), bajoTapa],
        [dentro(canto), bajoTapa],
      ]);
      // Una junta por pieza encolada tras el frontal: cada diente, y el retorno
      // (que es UNA pieza, no un diente por grosor).
      const cortes = [
        ...Array.from({ length: dientes }, (_, i) => (i + 1) * grosor),
        ...(retorno > 0 ? [(dientes + 1) * grosor] : []),
      ];
      for (const d of cortes) {
        if (d >= canto - 1e-9) continue;
        juntas.push([
          [dentro(d), 0],
          [dentro(d), bajoTapa],
        ]);
      }
    }
  }
  return { contorno, juntas };
}

/**
 * Peldaño romo: losa de un grosor con media caña en el canto delantero (radio =
 * medio grosor, o sea el grosor entero de diámetro). Con `doble`, también en el
 * canto trasero (pasamanos romo).
 */
export function seccionRomo({
  fondo,
  grosor,
  doble,
  suplementos = SIN_SUPLEMENTOS,
}: {
  readonly fondo: number;
  readonly grosor: number;
  readonly doble: boolean;
  readonly suplementos?: SuplementosSeccion;
}): SeccionPieza {
  // El espesado hace más gruesa la losa entera, y con ella la media caña.
  const espesor = grosorConEspesado(grosor, suplementos);
  const r = espesor / 2;
  const zTrasero = doble ? r : 0;
  // El canto delantero de la losa romo es el arranque de la media caña.
  const zCanto = fondo - r;
  // Sin frontal donde ponerlo, el goterón del romo va en la cara inferior, junto
  // al canto delantero (ver `MARGEN_GOTERON_ROMO`).
  const base = suplementos.goteron
    ? bordeConMuescas({
        y: 0,
        zInicio: zTrasero,
        zFin: zCanto,
        centros: [zCanto - MARGEN_GOTERON_ROMO * espesor],
        ancho: ANCHO_GOTERON,
        profundidad: Math.min(PROFUNDIDAD_GOTERON, espesor / 2),
        hacia: 1,
      })
    : ([[zTrasero, 0], [zCanto, 0]] as readonly PuntoSeccion[]);
  const huella = suplementos.antideslizante
    ? bordeConMuescas({
        y: espesor,
        zInicio: zCanto,
        zFin: zTrasero,
        centros: centrosAntideslizantes(zCanto, -1),
        ancho: ANCHO_RANURA,
        profundidad: Math.min(PROFUNDIDAD_RANURA, espesor / 2),
        hacia: -1,
      })
    : ([[zCanto, espesor], [zTrasero, espesor]] as readonly PuntoSeccion[]);

  const contorno: PuntoSeccion[] = [
    ...base,
    ...arco(fondo - r, r, r, -Math.PI / 2, Math.PI / 2),
    ...huella,
  ];
  if (doble) contorno.push(...arco(r, r, r, Math.PI / 2, (Math.PI * 3) / 2));
  return { contorno, juntas: [] };
}

/**
 * Rodapié: listón de pie de un grosor con el canto superior en media caña
 * («Rodapeu romat o bisellat» de la tarifa).
 */
export function seccionListon({
  altura,
  grosor,
}: {
  readonly altura: number;
  readonly grosor: number;
}): SeccionPieza {
  const r = Math.min(grosor / 2, altura / 2);
  const cima = altura - r;
  return {
    contorno: [[0, 0], [grosor, 0], ...arco(r, cima, r, 0, Math.PI)],
    juntas: [],
  };
}

/** Corte de piezas: placa plana tumbada, sin canto manipulado. */
export function seccionPlancha({
  ancho,
  grosor,
}: {
  readonly ancho: number;
  readonly grosor: number;
}): SeccionPieza {
  return {
    contorno: [
      [0, 0],
      [ancho, 0],
      [ancho, grosor],
      [0, grosor],
    ],
    juntas: [],
  };
}

/** Caja envolvente de la sección: útil para encuadrar el croquis del PDF. */
export function cajaSeccion(seccion: SeccionPieza): {
  readonly zMin: number;
  readonly zMax: number;
  readonly yMin: number;
  readonly yMax: number;
} {
  const zs = seccion.contorno.map(([z]) => z);
  const ys = seccion.contorno.map(([, y]) => y);
  return {
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}
