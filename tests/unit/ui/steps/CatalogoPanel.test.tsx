/**
 * Tests de la pestaña «Catálogo» del panel derecho: los precios de las tarjetas
 * son de VENTA, con el margen de la subfamilia de CADA artículo (2026-07-31,
 * indicación directa: «en las cerámicas de la derecha no has aplicado los
 * márgenes»). Antes se enseñaba la tarifa pelada, que es coste, y el comercial
 * leía un precio en el catálogo y otro más alto en la cotización.
 *
 * La fuente de catálogo se sustituye por una de dos artículos (uno con margen en
 * la tabla y otro sin él): estos tests son de la UI, no de la capa de datos, y la
 * real llamaría al API por red.
 */

import { act, screen, waitFor } from '@testing-library/react';
import { CatalogoPanel } from '../../../../src/ui/steps/CatalogoPanel';
import { montarPasos } from './utilidades-prueba';

// Las fábricas de `vi.mock` se izan al principio del fichero: nada de lo que
// usan puede vivir en una variable de módulo (no estaría inicializada todavía).

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('./config-prueba');
  // 9411 con margen; 7748 NO está en la tabla, como los 486 artículos reales.
  const config = construirConfigPrueba({
    longitudSubfamilia: 4,
    subfamilias: { '9411': { nombre: 'CASA INFINITA', pvp: 6600, contratista: 2000 } },
  });
  return { ...mod, useConfig: () => config };
});

vi.mock('../../../../src/data/catalogo', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/data/catalogo')>();
  const { eurosACentimos } = await import('../../../../src/domain/money');
  const { mm } = await import('../../../../src/domain/units');
  const material = (referencia: string, precioEuros: number): import('../../../../src/domain/types').Material => ({
    referencia,
    descripcion: `Baldosa ${referencia}`,
    marca: 'Marca Prueba',
    formato: { largoMm: mm(600), anchoMm: mm(600) },
    precioM2Centimos: eurosACentimos(precioEuros),
    precioUnidadCentimos: null,
    piezasPorCaja: 4,
    m2PorCaja: 1.44,
    subfamilia: null,
    imagenUrl: null,
    esManual: false,
  });
  const materiales = [material('94110600', 21.5), material('77480001', 30)];
  return {
    ...mod,
    obtenerFuenteCatalogo: () => ({
      origen: 'muestra' as const,
      buscar: async () => ({ materiales, totalCoincidencias: materiales.length }),
      marcas: async () => ['Marca Prueba'],
    }),
  };
});

describe('CatalogoPanel — precios con margen', () => {
  /**
   * 21,50 € de tarifa con el 66 % de MTP son 35,69 €: es el precio que luego dará
   * la cotización, y por tanto el que tiene que leerse en la tarjeta.
   */
  it('la tarjeta muestra el precio de venta, no la tarifa', async () => {
    montarPasos(<CatalogoPanel />);
    await waitFor(() => expect(screen.getByText(/^35,69\s€\/m²$/)).toBeInTheDocument());
    expect(screen.queryByText(/^21,50\s€\/m²$/)).not.toBeInTheDocument();
  });

  it('cambiar a contratista recalcula el precio de la tarjeta', async () => {
    const { api } = montarPasos(<CatalogoPanel />);
    await waitFor(() => expect(screen.getByText(/^35,69\s€\/m²$/)).toBeInTheDocument());

    act(() => api().dispatch({ tipo: 'cambiarTipoMargen', tipoMargen: 'contratista' }));
    // 21,50 € al 20 % de MTC.
    expect(screen.getByText(/^25,80\s€\/m²$/)).toBeInTheDocument();
  });

  /**
   * El artículo cuya subfamilia no está en la tabla no se enseña «a coste
   * callando»: la tarjeta dice que falta el margen y el aviso explica dónde
   * ponerlo. Es la misma regla con la que el motor se niega a cotizarlo.
   */
  it('el artículo sin margen en la tabla no muestra su tarifa', async () => {
    montarPasos(<CatalogoPanel />);
    await waitFor(() => expect(screen.getByText('Precio sin margen')).toBeInTheDocument());
    expect(screen.queryByText(/^30,00\s€\/m²$/)).not.toBeInTheDocument();
    expect(screen.getByText('Precio sin margen')).toHaveAttribute(
      'title',
      expect.stringContaining('7748'),
    );
  });

  /** Con el margen a mano, ese mismo artículo ya tiene precio de venta. */
  it('el margen escrito a mano desbloquea el precio del artículo sin tabla', async () => {
    const { api } = montarPasos(<CatalogoPanel />);
    await waitFor(() => expect(screen.getByText('Precio sin margen')).toBeInTheDocument());

    act(() => api().dispatch({ tipo: 'cambiarMargenManual', porcentaje: '50' }));
    expect(screen.queryByText('Precio sin margen')).not.toBeInTheDocument();
    // 30,00 € al 50 %; el de 21,50 € pasa también al margen a mano (32,25 €).
    expect(screen.getByText(/^45,00\s€\/m²$/)).toBeInTheDocument();
    expect(screen.getByText(/^32,25\s€\/m²$/)).toBeInTheDocument();
  });
});
