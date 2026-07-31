/**
 * Tests del ajuste de textura a la pieza del visor 3D (indicación del encargo,
 * 2026-07-29): la imagen completa cubre la caja envolvente de la pieza
 * (uv ∈ [0,1] por eje dominante), con la misma escala en todas las caras y sin
 * repetir. Lógica pura three.js (sin renderer/WebGL), corre en jsdom.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { remapearUvAAjuste } from '../src/viewer/materiales';

describe('remapearUvAAjuste', () => {
  it('la textura ajusta a la caja envolvente: cada cara llega de 0 a 1 en sus ejes', () => {
    const geometria = new THREE.BoxGeometry(100, 6, 30);
    remapearUvAAjuste(geometria);

    const uv = geometria.getAttribute('uv');
    const normales = geometria.getAttribute('normal');
    let uMaxSuperior = 0;
    let vMaxSuperior = 0;
    let uMaxFrontal = 0;
    let vMaxFrontal = 0;
    for (let i = 0; i < uv.count; i += 1) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
      if (normales.getY(i) === 1) {
        uMaxSuperior = Math.max(uMaxSuperior, uv.getX(i));
        vMaxSuperior = Math.max(vMaxSuperior, uv.getY(i));
      }
      if (normales.getZ(i) === 1) {
        uMaxFrontal = Math.max(uMaxFrontal, uv.getX(i));
        vMaxFrontal = Math.max(vMaxFrontal, uv.getY(i));
      }
    }
    // La cara superior y la frontal cubren la imagen completa (0 → 1).
    expect(uMaxSuperior).toBeCloseTo(1, 6);
    expect(vMaxSuperior).toBeCloseTo(1, 6);
    expect(uMaxFrontal).toBeCloseTo(1, 6);
    expect(vMaxFrontal).toBeCloseTo(1, 6);
  });

  it('no depende del tamaño de la pieza: misma cobertura en grande y en pequeña', () => {
    const grande = new THREE.BoxGeometry(120, 1, 60);
    const chica = new THREE.BoxGeometry(30, 1, 15);
    remapearUvAAjuste(grande);
    remapearUvAAjuste(chica);
    expect(Array.from(grande.getAttribute('uv').array)).toEqual(
      Array.from(chica.getAttribute('uv').array),
    );
  });

  it('es determinista: misma geometría, mismos UV', () => {
    const a = new THREE.BoxGeometry(100, 1, 30);
    const b = new THREE.BoxGeometry(100, 1, 30);
    remapearUvAAjuste(a);
    remapearUvAAjuste(b);
    expect(Array.from(a.getAttribute('uv').array)).toEqual(
      Array.from(b.getAttribute('uv').array),
    );
  });
});
