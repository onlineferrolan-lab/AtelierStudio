/**
 * Guardas sobre el catálogo de muestra real (public/data/catalogo-muestra.json):
 * la spec exige que el catálogo falso de desarrollo esté «claramente marcado
 * como falso» (§7.3) y que los datos sean coherentes para poder desarrollar.
 */

import { describe, expect, it } from 'vitest';
import catalogoCrudo from '../../../public/data/catalogo-muestra.json';

interface ArticuloJson {
  referencia: string;
  descripcion: string;
  marca: string;
  formato: { largoCm: number; anchoCm: number };
  precioM2Euros: number;
  piezasPorCaja: number | null;
  m2PorCaja: number | null;
  imagen: string | null;
}

const catalogo = catalogoCrudo as unknown as { _aviso: string; articulos: ArticuloJson[] };

// Imágenes realmente presentes en public/data/img/ (claves → '/data/img/<fichero>').
const imagenesDisponibles = new Set(
  Object.keys(import.meta.glob('../../../public/data/img/*.svg')).map(
    (ruta) => `/data/img/${ruta.split('/').pop()}`,
  ),
);

describe('public/data/catalogo-muestra.json', () => {
  it('lleva el aviso de catálogo falso exigido por §7.3', () => {
    expect(catalogo._aviso).toBe('CATÁLOGO DE MUESTRA — DATOS FALSOS (§7.3)');
  });

  it('contiene una docena de artículos con referencias únicas', () => {
    expect(catalogo.articulos.length).toBeGreaterThanOrEqual(10);
    const referencias = catalogo.articulos.map((a) => a.referencia);
    expect(new Set(referencias).size).toBe(referencias.length);
  });

  it('todos los artículos tienen datos mínimos coherentes', () => {
    for (const a of catalogo.articulos) {
      expect(a.descripcion.trim().length, a.referencia).toBeGreaterThan(0);
      expect(a.marca.trim().length, a.referencia).toBeGreaterThan(0);
      expect(a.formato.largoCm, a.referencia).toBeGreaterThan(0);
      expect(a.formato.anchoCm, a.referencia).toBeGreaterThan(0);
      expect(a.precioM2Euros, a.referencia).toBeGreaterThan(0);
    }
  });

  it('hay variedad: varios formatos, varias marcas, alguno sin imagen y alguno sin caja', () => {
    const formatos = new Set(
      catalogo.articulos.map((a) => `${a.formato.largoCm}x${a.formato.anchoCm}`),
    );
    const marcas = new Set(catalogo.articulos.map((a) => a.marca));
    expect(formatos.size).toBeGreaterThanOrEqual(6);
    expect(marcas.size).toBeGreaterThanOrEqual(3);
    expect(catalogo.articulos.some((a) => a.imagen === null)).toBe(true);
    expect(catalogo.articulos.some((a) => a.piezasPorCaja === null || a.m2PorCaja === null)).toBe(
      true,
    );
  });

  it('las imágenes referenciadas existen en public/data/img/', () => {
    for (const a of catalogo.articulos) {
      if (a.imagen === null) continue;
      expect(a.imagen, a.referencia).toMatch(/^\/data\/img\/.+\.svg$/);
      expect(imagenesDisponibles.has(a.imagen), `${a.referencia} → ${a.imagen}`).toBe(true);
    }
  });
});
