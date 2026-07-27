/**
 * Construcción de la geometría 3D de la pieza a partir de la figura y sus medidas.
 *
 * Capa de REPRESENTACIÓN: las medidas llegan como `Mm` (enteros del dominio) y
 * aquí se convierten a unidades de escena (1 unidad = 1 cm) como float de
 * dibujo. La regla §1 ("prohibido float para geometría") gobierna el cálculo
 * de dominio; este módulo solo pinta y nunca alimenta cotizaciones.
 *
 * La receta (qué componentes hay y de qué medida sale cada dimensión) se lee de
 * `figura.componentes` (configuración, §3), nunca se hardcodea. El ensamblaje
 * de cada figura sigue la indicación directa del encargo (2026-07-24):
 *  - Figuras 1–4: todas la misma L escuadrada (tapa apoyada sobre el frontal,
 *    caras a ras, sin chaflán ni escalón). La Figura 4 añade el retorno
 *    horizontal en la base, sobresaliendo hacia dentro.
 *  - Peldaño romo: tapa con el canto delantero redondeado con radio = grosor.
 *
 * PROVISIONAL mientras no haya croquis ACOTADO oficial (§3): el grosor de
 * baldosa usado para dibujar el frontal/retorno es una constante de
 * desarrollo (ver más abajo), no un dato real de la pieza. Ver PENDIENTES.md.
 */

import * as THREE from 'three';
import type { ComponenteReceta, Figura } from '../domain/config';
import type { Mm } from '../domain/types';
import { mm } from '../domain/units';
import { crearMaterialNeutro } from './materiales';

/** 1 unidad de escena = 1 cm (proporciones reales, §1 "Visor 3D"). */
const UNIDADES_POR_MM = 0.1;

/**
 * PROVISIONAL (TODO taller): grosor de la baldosa. Ni `parametros.json` ni
 * `Material.formato` recogen todavía el grosor, y las props del visor no
 * incluyen configuración; se usa 10 mm (habitual en pavimento) hasta que el
 * dato viva en configuración. SOLO afecta a la representación, no al cálculo.
 */
export const GROSOR_BALDOSA_PROVISIONAL: Mm = mm(10);

export type EjeCota = 'x' | 'y' | 'z';

/** Dónde se apoya visualmente la línea de cota respecto a la pieza. */
export type PlanoCota =
  'frenteInferior' | 'lateralDerecho' | 'lateralIzquierdo' | 'verticalFrontal';

export interface CotaPieza {
  /** Id de la medida de la figura ('longitud', 'fondo', 'retorno'...). */
  readonly medida: string;
  readonly valorMm: Mm;
  readonly eje: EjeCota;
  readonly plano: PlanoCota;
  /** Extremos de la cota sobre su eje, en unidades de escena ya centradas. */
  readonly desde: number;
  readonly hasta: number;
}

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

/** true si a la receta le falta alguna medida (figura sin receta o medidas incompletas). */
export function faltanMedidasParaPieza(
  figura: Figura,
  medidasMm: Readonly<Record<string, Mm>>,
): boolean {
  return figura.componentes.some(
    (c) => medidasMm[c.largoDe] === undefined || medidasMm[c.anchoDe] === undefined,
  );
}

interface CotaCruda extends Omit<CotaPieza, 'desde' | 'hasta'> {
  readonly desde: number;
  readonly hasta: number;
}

/** Repetición de textura para mallas extruidas (sus UV vienen en unidades de escena). */
const REPETICION_TEXTURA_EXTRUIDA = 0.08;

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
): PiezaConstruida | null {
  if (figura.componentes.length === 0 || faltanMedidasParaPieza(figura, medidasMm)) return null;

  const aEscena = (valor: Mm): number => valor * UNIDADES_POR_MM;
  const g = aEscena(grosorMm);
  const malla = new THREE.Group();
  const material = crearMaterialNeutro();
  const cotas: CotaCruda[] = [];
  const ids = new Set(figura.componentes.map((c) => c.id));
  const componente = (id: string): ComponenteReceta | undefined =>
    figura.componentes.find((c) => c.id === id);

  const agregarCaja = (
    largo: number,
    alto: number,
    fondo: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(largo, alto, fondo), material);
    mesh.position.set(x, y, z);
    malla.add(mesh);
  };
  const agregarExtruida = (perfil: THREE.Shape, largo: number): void => {
    const mesh = new THREE.Mesh(extruirPerfil(perfil, largo), material);
    mesh.userData.repetirTexturaPorUnidad = REPETICION_TEXTURA_EXTRUIDA;
    malla.add(mesh);
  };
  const cota = (
    medida: string,
    eje: EjeCota,
    plano: PlanoCota,
    desde: number,
    hasta: number,
  ): void => {
    cotas.push({ medida, valorMm: medidasMm[medida], eje, plano, desde, hasta });
  };

  if (ids.has('tapa') && ids.has('frontal')) {
    // Peldaños: tapa + frontal (Figuras 1–4).
    const tapa = componente('tapa');
    const frontal = componente('frontal');
    if (!tapa || !frontal) return null;
    const largo = aEscena(medidasMm[tapa.largoDe]);
    const F = aEscena(medidasMm[tapa.anchoDe]); // fondo (z)
    const h = aEscena(medidasMm[frontal.anchoDe]); // altura del frontal bajo la tapa (y)
    cota(tapa.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(tapa.anchoDe, 'z', 'lateralDerecho', 0, F);
    cota(frontal.anchoDe, 'y', 'verticalFrontal', 0, h);

    // Todas las figuras con tapa + frontal (1–4) comparten la misma L a ras
    // (tapa apoyada sobre el frontal, sin chaflán/escalón): decisión directa
    // del encargo (2026-07-24), revierte el intento anterior de escalera.
    agregarCaja(largo, g, F, largo / 2, h + g / 2, F / 2);
    agregarCaja(largo, h, g, largo / 2, h / 2, F - g / 2);
    const retorno = componente('retorno');
    if (retorno) {
      const anchoRetorno = aEscena(medidasMm[retorno.anchoDe]);
      agregarCaja(largo, g, anchoRetorno, largo / 2, g / 2, F - g - anchoRetorno / 2);
      cota(retorno.anchoDe, 'z', 'lateralIzquierdo', F - g - anchoRetorno, F - g);
    }
  } else if (ids.has('tapa')) {
    // Peldaño romo: tapa con el canto delantero redondeado (radio = grosor).
    const tapa = componente('tapa');
    if (!tapa) return null;
    const largo = aEscena(medidasMm[tapa.largoDe]);
    const fondo = aEscena(medidasMm[tapa.anchoDe]);
    // Perfil en el plano (fondo, alto): rectángulo con la esquina delantera
    // superior sustituida por un arco de 90° y radio = grosor (media caña).
    const perfil = new THREE.Shape();
    perfil.moveTo(0, 0);
    perfil.lineTo(fondo, 0);
    perfil.absarc(fondo - g, 0, g, 0, Math.PI / 2, false);
    perfil.lineTo(0, g);
    perfil.closePath();
    agregarExtruida(perfil, largo);
    cota(tapa.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(tapa.anchoDe, 'z', 'lateralDerecho', 0, fondo);
  } else if (ids.has('liston')) {
    // Rodapiés: listón fino de pie (largo × alto, grosor de baldosa).
    const liston = componente('liston');
    if (!liston) return null;
    const largo = aEscena(medidasMm[liston.largoDe]);
    const altura = aEscena(medidasMm[liston.anchoDe]);
    agregarCaja(largo, altura, g, largo / 2, altura / 2, g / 2);
    cota(liston.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(liston.anchoDe, 'y', 'verticalFrontal', 0, altura);
  } else if (ids.has('pieza')) {
    // Corte: pieza plana rectangular tumbada.
    const pieza = componente('pieza');
    if (!pieza) return null;
    const largo = aEscena(medidasMm[pieza.largoDe]);
    const ancho = aEscena(medidasMm[pieza.anchoDe]);
    agregarCaja(largo, g, ancho, largo / 2, g / 2, ancho / 2);
    cota(pieza.largoDe, 'x', 'frenteInferior', 0, largo);
    cota(pieza.anchoDe, 'z', 'lateralDerecho', 0, ancho);
  } else {
    // Receta con componentes que el visor no sabe ensamblar (no inventar, §0).
    return null;
  }

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
