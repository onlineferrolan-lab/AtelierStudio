/**
 * Tests del visor 3D: ensamblaje de la geometría y datos de cotas.
 * Son lógica pura three.js (sin renderer/WebGL), así que corren en jsdom.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Figura } from '../src/domain/config';
import type { Mm } from '../src/domain/types';
import { mm } from '../src/domain/units';
import { crearGrupoCotas } from '../src/viewer/cotas';
import {
  GROSOR_BALDOSA_PROVISIONAL,
  construirPieza,
  construirSeccion,
  faltanMedidasParaPieza,
} from '../src/viewer/geometria';

function figuraDePrueba(parcial: Partial<Figura>): Figura {
  return {
    id: 'prueba',
    nombre: 'Prueba',
    estado: 'activa',
    motivoPendiente: null,
    croquisPendiente: true,
    medidas: [],
    componentes: [],
    tarifa: null,
    longitudTarifa: null,
    tarifaAdicional: null,
    suplementos: [],
    tienePintado: false,
    ...parcial,
  };
}

const FIGURA_L = figuraDePrueba({
  id: 'figura-1',
  medidas: [
    { id: 'longitud', etiqueta: 'Longitud (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'fondo', etiqueta: 'Fondo (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    {
      id: 'alturaFrontal',
      etiqueta: 'Altura frontal (cm)',
      minCm: 1,
      maxCm: null,
      opcionesCm: null,
    },
  ],
  componentes: [
    { id: 'tapa', largoDe: 'longitud', anchoDe: 'fondo' },
    { id: 'frontal', largoDe: 'longitud', anchoDe: 'alturaFrontal' },
  ],
});

const FIGURA_2 = figuraDePrueba({
  ...FIGURA_L,
  id: 'figura-2',
});

const FIGURA_3 = figuraDePrueba({
  ...FIGURA_L,
  id: 'figura-3',
});

const FIGURA_4 = figuraDePrueba({
  id: 'figura-4',
  medidas: [
    ...FIGURA_L.medidas,
    { id: 'retorno', etiqueta: 'Retorno (cm)', minCm: 1, maxCm: null, opcionesCm: null },
  ],
  componentes: [
    ...FIGURA_L.componentes,
    { id: 'retorno', largoDe: 'longitud', anchoDe: 'retorno' },
  ],
});

const FIGURA_ROMO = figuraDePrueba({
  id: 'peldano-romo',
  medidas: [
    { id: 'longitud', etiqueta: 'Longitud (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'fondo', etiqueta: 'Fondo (cm)', minCm: 1, maxCm: null, opcionesCm: null },
  ],
  componentes: [{ id: 'tapa', largoDe: 'longitud', anchoDe: 'fondo' }],
});

// Pasamanos (2026-07-29): misma receta que su peldaño equivalente más el
// frontal/retorno (o la media caña) en el lado opuesto.
const FIGURA_PASAMANOS = figuraDePrueba({
  id: 'pasamanos-1',
  medidas: FIGURA_L.medidas,
  componentes: [
    ...FIGURA_L.componentes,
    { id: 'frontal-trasero', largoDe: 'longitud', anchoDe: 'alturaFrontal' },
  ],
});

const FIGURA_PASAMANOS_4 = figuraDePrueba({
  id: 'pasamanos-4',
  medidas: FIGURA_4.medidas,
  componentes: [
    ...FIGURA_4.componentes,
    { id: 'frontal-trasero', largoDe: 'longitud', anchoDe: 'alturaFrontal' },
    { id: 'retorno-trasero', largoDe: 'longitud', anchoDe: 'retorno' },
  ],
});

const FIGURA_PASAMANOS_ROMO = figuraDePrueba({
  ...FIGURA_ROMO,
  id: 'pasamanos-romo',
});

const FIGURA_RODAPIE = figuraDePrueba({
  id: 'rodapie-estandar',
  medidas: [
    { id: 'longitud', etiqueta: 'Longitud (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'altura', etiqueta: 'Altura (cm)', minCm: 7.2, maxCm: 8, opcionesCm: [7.2, 8] },
  ],
  componentes: [{ id: 'liston', largoDe: 'longitud', anchoDe: 'altura' }],
});

const FIGURA_CORTE = figuraDePrueba({
  id: 'corte',
  medidas: [
    { id: 'largo', etiqueta: 'Largo (cm)', minCm: 1, maxCm: null, opcionesCm: null },
    { id: 'ancho', etiqueta: 'Ancho (cm)', minCm: 1, maxCm: null, opcionesCm: null },
  ],
  componentes: [{ id: 'pieza', largoDe: 'largo', anchoDe: 'ancho' }],
});

function contarMallas(raiz: THREE.Object3D): number {
  let total = 0;
  raiz.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) total += 1;
  });
  return total;
}

function cajaDe(raiz: THREE.Object3D): THREE.Box3 {
  raiz.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(raiz);
}

const G = GROSOR_BALDOSA_PROVISIONAL / 10; // grosor en unidades de escena (cm)

/**
 * Área de la sección transversal en cm². Es la magnitud que distingue las
 * figuras entre sí (la caja envolvente es la misma en las Figuras 1–3), y
 * equivale al material por cm de pieza.
 */
function areaSeccion(figura: Figura, medidas: Record<string, Mm>): number {
  const seccion = construirSeccion(figura, medidas);
  expect(seccion).not.toBeNull();
  if (!seccion) return Number.NaN;
  return Math.abs(
    THREE.ShapeUtils.area(seccion.contorno.map(([z, y]) => new THREE.Vector2(z, y))),
  );
}

describe('construirPieza', () => {
  it('peldaño en L: tapa + frontal ensamblados con cotas de las tres medidas', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_L, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    // 100 × (5 + grosor) × 30 cm, centrada en el origen.
    expect(tam.x).toBeCloseTo(100, 6);
    expect(tam.y).toBeCloseTo(5 + G, 6);
    expect(tam.z).toBeCloseTo(30, 6);
    expect(pieza.cajaLocal.min.y).toBeCloseTo(-tam.y / 2, 6);
    expect(pieza.cotas.map((c) => c.medida).sort()).toEqual(['alturaFrontal', 'fondo', 'longitud']);
    const cotaLongitud = pieza.cotas.find((c) => c.medida === 'longitud');
    expect(cotaLongitud?.eje).toBe('x');
    expect(cotaLongitud && cotaLongitud.hasta - cotaLongitud.desde).toBeCloseTo(100, 6);
    const cotaFrontal = pieza.cotas.find((c) => c.medida === 'alturaFrontal');
    expect(cotaFrontal?.eje).toBe('y');
    expect(cotaFrontal && cotaFrontal.hasta - cotaFrontal.desde).toBeCloseTo(5, 6);
    // Sección = tapa (30 × 1) + frontal de un grosor (1 × 5).
    expect(areaSeccion(FIGURA_L, medidas)).toBeCloseTo(30 + 5, 6);
  });

  it('figura 2: la L con la nariz de dos grosores (un diente a plena altura)', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_2, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    // El diente engorda la nariz hacia dentro: la caja no cambia respecto a la L.
    expect(tam.x).toBeCloseTo(100, 6);
    expect(tam.y).toBeCloseTo(5 + G, 6);
    expect(tam.z).toBeCloseTo(30, 6);
    // Tapa (30 × 1) + nariz de DOS grosores a plena altura (2 × 5).
    expect(areaSeccion(FIGURA_2, medidas)).toBeCloseTo(30 + 2 * 5, 6);
  });

  it('figura 3: la L con la nariz de tres grosores, a ras por la base', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_3, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.y).toBeCloseTo(5 + G, 6);
    // Tapa (30 × 1) + nariz de TRES grosores a plena altura (3 × 5): los dientes
    // no van en escalera, así que aportan su altura completa.
    expect(areaSeccion(FIGURA_3, medidas)).toBeCloseTo(30 + 3 * 5, 6);
    // Cada diente añade exactamente un grosor de material por cm de pieza.
    expect(areaSeccion(FIGURA_3, medidas) - areaSeccion(FIGURA_2, medidas)).toBeCloseTo(5, 6);
  });

  it('figura 4: sin dientes, con el retorno engordando la nariz (nariz maciza)', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(800),
      fondo: mm(320),
      alturaFrontal: mm(60),
      retorno: mm(40),
    };
    const pieza = construirPieza(FIGURA_4, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(80, 6);
    expect(tam.y).toBeCloseTo(6 + G, 6);
    expect(tam.z).toBeCloseTo(32, 6);
    const cotaRetorno = pieza.cotas.find((c) => c.medida === 'retorno');
    expect(cotaRetorno?.eje).toBe('z');
    expect(cotaRetorno && cotaRetorno.hasta - cotaRetorno.desde).toBeCloseTo(4, 6);
    // Tapa (32 × 1) + nariz maciza de grosor + retorno (5) a plena altura (× 6):
    // el retorno NO deja hueco bajo la tapa.
    expect(areaSeccion(FIGURA_4, medidas)).toBeCloseTo(32 + 5 * 6, 6);
  });

  it('peldaño romo: una sola malla extruida con el fondo y el largo pedidos', () => {
    const medidas: Record<string, Mm> = { longitud: mm(1200), fondo: mm(330) };
    const pieza = construirPieza(FIGURA_ROMO, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    let geometria: THREE.BufferGeometry | null = null;
    pieza.malla.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geometria = (o as THREE.Mesh).geometry;
    });
    expect(geometria).toBeInstanceOf(THREE.ExtrudeGeometry);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(120, 6);
    expect(tam.y).toBeCloseTo(G, 6);
    expect(tam.z).toBeCloseTo(33, 6);
    expect(pieza.cotas).toHaveLength(2);
  });

  it('pasamanos: la L en espejo (∩), simétrica en z y con las cotas de la L', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_PASAMANOS, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(100, 6);
    expect(tam.y).toBeCloseTo(5 + G, 6);
    expect(tam.z).toBeCloseTo(30, 6);
    // Con el frontal en ambos lados, la pieza es simétrica respecto al centro en z.
    expect(pieza.cajaLocal.min.z).toBeCloseTo(-tam.z / 2, 6);
    expect(pieza.cajaLocal.max.z).toBeCloseTo(tam.z / 2, 6);
    expect(pieza.cotas.map((c) => c.medida).sort()).toEqual(['alturaFrontal', 'fondo', 'longitud']);
    // Tapa (30 × 1) + un frontal de un grosor por canto (2 × 1 × 5).
    expect(areaSeccion(FIGURA_PASAMANOS, medidas)).toBeCloseTo(30 + 2 * 5, 6);
  });

  it('pasamanos 4: la Figura 4 en espejo y una sola cota de retorno', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(800),
      fondo: mm(320),
      alturaFrontal: mm(60),
      retorno: mm(40),
    };
    const pieza = construirPieza(FIGURA_PASAMANOS_4, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(80, 6);
    expect(tam.y).toBeCloseTo(6 + G, 6);
    expect(tam.z).toBeCloseTo(32, 6);
    const cotasRetorno = pieza.cotas.filter((c) => c.medida === 'retorno');
    expect(cotasRetorno).toHaveLength(1);
    expect(cotasRetorno[0].hasta - cotasRetorno[0].desde).toBeCloseTo(4, 6);
    // Tapa (32 × 1) + una nariz maciza de 5 a plena altura por canto: 2 × (5 × 6).
    expect(areaSeccion(FIGURA_PASAMANOS_4, medidas)).toBeCloseTo(32 + 2 * (5 * 6), 6);
  });

  it('pasamanos romo: una malla extruida con media caña en AMBOS cantos', () => {
    const medidas: Record<string, Mm> = { longitud: mm(1200), fondo: mm(330) };
    const pieza = construirPieza(FIGURA_PASAMANOS_ROMO, medidas);
    const romo = construirPieza(FIGURA_ROMO, medidas);
    expect(pieza).not.toBeNull();
    expect(romo).not.toBeNull();
    if (!pieza || !romo) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(120, 6);
    expect(tam.y).toBeCloseTo(G, 6);
    expect(tam.z).toBeCloseTo(33, 6);
    expect(pieza.cotas).toHaveLength(2);
    // La doble media caña produce una geometría distinta de la del peldaño romo.
    const verticesDe = (raiz: THREE.Object3D): number => {
      let total = 0;
      raiz.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          total += (o as THREE.Mesh).geometry.attributes.position.count;
        }
      });
      return total;
    };
    expect(verticesDe(pieza.malla)).not.toBe(verticesDe(romo.malla));
  });

  it('rodapié: listón de pie con cota de altura', () => {
    const medidas: Record<string, Mm> = { longitud: mm(600), altura: mm(72) };
    const pieza = construirPieza(FIGURA_RODAPIE, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(1);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(60, 6);
    expect(tam.y).toBeCloseTo(7.2, 6);
    expect(tam.z).toBeCloseTo(G, 6);
    const cotaAltura = pieza.cotas.find((c) => c.medida === 'altura');
    expect(cotaAltura?.eje).toBe('y');
  });

  it('corte: pieza plana tumbada con cotas de largo y ancho', () => {
    const medidas: Record<string, Mm> = { largo: mm(450), ancho: mm(220) };
    const pieza = construirPieza(FIGURA_CORTE, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(45, 6);
    expect(tam.y).toBeCloseTo(G, 6);
    expect(tam.z).toBeCloseTo(22, 6);
    expect(pieza.cotas.map((c) => c.medida).sort()).toEqual(['ancho', 'largo']);
  });

  it('devuelve null si falta una medida de la receta o la figura no tiene componentes', () => {
    expect(faltanMedidasParaPieza(FIGURA_L, { longitud: mm(1000), fondo: mm(300) })).toBe(true);
    expect(construirPieza(FIGURA_L, { longitud: mm(1000), fondo: mm(300) })).toBeNull();
    const sinReceta = figuraDePrueba({ id: 'figura-5', estado: 'pendiente' });
    expect(construirPieza(sinReceta, {})).toBeNull();
  });

  it('es determinista: mismo input, misma caja y mismas cotas', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const a = construirPieza(FIGURA_L, medidas);
    const b = construirPieza(FIGURA_L, medidas);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    if (!a || !b) return;
    expect(cajaDe(a.malla).min.equals(cajaDe(b.malla).min)).toBe(true);
    expect(cajaDe(a.malla).max.equals(cajaDe(b.malla).max)).toBe(true);
    expect(a.cotas).toEqual(b.cotas);
  });
});

describe('crearGrupoCotas', () => {
  it('genera una línea y una etiqueta por cada cota, con el texto formateado en cm', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_L, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    const grupo = crearGrupoCotas(pieza.cotas, pieza.cajaLocal, pieza.dimensionMaxima);
    const lineas = grupo.children.filter((c) => (c as THREE.LineSegments).isLine);
    const sprites = grupo.children.filter((c) => (c as THREE.Sprite).isSprite);
    expect(lineas).toHaveLength(1);
    expect(sprites).toHaveLength(pieza.cotas.length);
  });
});
