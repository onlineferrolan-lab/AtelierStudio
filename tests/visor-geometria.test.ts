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
    expect(contarMallas(pieza.malla)).toBe(2);
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
  });

  it('figura 2: misma L a ras que la Figura 1 (2 mallas)', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_2, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(2);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(100, 6);
    expect(tam.y).toBeCloseTo(5 + G, 6);
    expect(tam.z).toBeCloseTo(30, 6);
  });

  it('figura 3: misma L a ras que la Figura 1 (2 mallas)', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(1000),
      fondo: mm(300),
      alturaFrontal: mm(50),
    };
    const pieza = construirPieza(FIGURA_3, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(2);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.y).toBeCloseTo(5 + G, 6);
  });

  it('figura 4: misma L a ras + retorno en la base (3 mallas), y su cota mide el retorno', () => {
    const medidas: Record<string, Mm> = {
      longitud: mm(800),
      fondo: mm(320),
      alturaFrontal: mm(60),
      retorno: mm(40),
    };
    const pieza = construirPieza(FIGURA_4, medidas);
    expect(pieza).not.toBeNull();
    if (!pieza) return;
    expect(contarMallas(pieza.malla)).toBe(3);
    const tam = cajaDe(pieza.malla).getSize(new THREE.Vector3());
    expect(tam.x).toBeCloseTo(80, 6);
    expect(tam.y).toBeCloseTo(6 + G, 6);
    expect(tam.z).toBeCloseTo(32, 6);
    const cotaRetorno = pieza.cotas.find((c) => c.medida === 'retorno');
    expect(cotaRetorno?.eje).toBe('z');
    expect(cotaRetorno && cotaRetorno.hasta - cotaRetorno.desde).toBeCloseTo(4, 6);
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
