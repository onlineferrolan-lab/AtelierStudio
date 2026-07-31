/**
 * Malla three.js de la pieza: extruye la sección a lo largo del largo (eje x).
 *
 * La FORMA no se decide aquí. `src/piezas/piezaDeFigura.ts` (puro, sin three)
 * traduce figura + medidas en una sección y sus cotas; este módulo solo la
 * convierte en geometría. La separación existe para que el PDF de orden de
 * trabajo pueda dibujar el croquis sin cargar three.js.
 *
 * Por qué una extrusión y no un apilado de cajas: las uniones a 45° y la base a
 * ras de los dientes salen exactas, no hay caras coincidentes (z-fighting) y la
 * textura se ajusta una sola vez a la pieza — con varias mallas,
 * `remapearUvAAjuste` estiraba la imagen completa sobre CADA caja.
 */

import * as THREE from 'three';
import type { Figura } from '../domain/config';
import type { SeccionPieza } from '../piezas/seccionPieza';
import {
  GROSOR_BALDOSA_PROVISIONAL,
  ensamblar,
  type CotaPieza,
} from '../piezas/piezaDeFigura';
import { SIN_SUPLEMENTOS, type SuplementosSeccion } from '../piezas/seccionPieza';
import type { Mm } from '../domain/types';
import { crearMaterialNeutro } from './materiales';

// Reexportado para que el visor y sus tests sigan teniendo un único punto de
// entrada, aunque la lógica pura viva en `src/piezas/`.
export {
  GROSOR_BALDOSA_PROVISIONAL,
  construirSeccion,
  faltanMedidasParaPieza,
  rasgosDeSuplementos,
  type CotaPieza,
  type EjeCota,
  type PlanoCota,
} from '../piezas/piezaDeFigura';

export interface PiezaConstruida {
  /** Mallas de la pieza con material neutro (la textura se aplica aparte). */
  readonly malla: THREE.Group;
  /** Cotas de cada medida presente, en coordenadas ya centradas en el origen. */
  readonly cotas: readonly CotaPieza[];
  /** Caja envolvente de la malla ya centrada (para colocar cotas y encuadrar). */
  readonly cajaLocal: THREE.Box3;
  /** Dimensión mayor de la pieza en unidades de escena. */
  readonly dimensionMaxima: number;
}

/** Convierte el contorno compartido (z, y) en la forma que extruye three.js. */
function formaDeSeccion(seccion: SeccionPieza): THREE.Shape {
  const forma = new THREE.Shape();
  const [primero, ...resto] = seccion.contorno;
  forma.moveTo(primero[0], primero[1]);
  for (const [z, y] of resto) forma.lineTo(z, y);
  forma.closePath();
  return forma;
}

/**
 * Extruye un perfil 2D (fondo, alto) a lo largo del largo (eje X), dejando el
 * fondo en +Z y el alto en +Y, como el resto de figuras.
 */
function extruirPerfil(perfil: THREE.Shape, largo: number): THREE.BufferGeometry {
  const geometria = new THREE.ExtrudeGeometry(perfil, {
    depth: largo,
    bevelEnabled: false,
    curveSegments: 24,
  });
  geometria.rotateY(-Math.PI / 2);
  geometria.translate(largo, 0, 0);
  return geometria;
}

/**
 * Construye la malla de la pieza y sus cotas. Devuelve null cuando la figura no
 * tiene receta representable o faltan medidas (el componente muestra entonces
 * el estado vacío correspondiente).
 */
export function construirPieza(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
  grosorMm: Mm = GROSOR_BALDOSA_PROVISIONAL,
  suplementos: SuplementosSeccion = SIN_SUPLEMENTOS,
): PiezaConstruida | null {
  const ensamblaje = ensamblar(figura, medidasMm, grosorMm, suplementos);
  if (!ensamblaje) return null;
  const { seccion, largo, cotas } = ensamblaje;

  const malla = new THREE.Group();
  malla.add(new THREE.Mesh(extruirPerfil(formaDeSeccion(seccion), largo), crearMaterialNeutro()));

  // Centrar la pieza en el origen para orbitar y encuadrar alrededor de ella.
  malla.updateMatrixWorld(true);
  const envolvente = new THREE.Box3().setFromObject(malla);
  const centro = envolvente.getCenter(new THREE.Vector3());
  malla.position.set(-centro.x, -centro.y, -centro.z);
  const desplazamiento = new THREE.Vector3(-centro.x, -centro.y, -centro.z);
  const cajaLocal = envolvente.clone().translate(desplazamiento);
  const tamano = envolvente.getSize(new THREE.Vector3());
  const cotasCentradas: CotaPieza[] = cotas.map((c) => ({
    ...c,
    desde: c.desde - centro[c.eje],
    hasta: c.hasta - centro[c.eje],
  }));

  return {
    malla,
    cotas: cotasCentradas,
    cajaLocal,
    dimensionMaxima: Math.max(tamano.x, tamano.y, tamano.z),
  };
}
