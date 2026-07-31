/**
 * Colocación de los botones del bloque Cotización (2026-07-31, indicación
 * directa): «Generar PDF de esta pieza» arriba y a lo ancho, y debajo
 * «Añadir al pedido» y «Reiniciar» compartiendo fila.
 *
 * Se prueba el ORDEN en el DOM y no solo que existan, porque el orden ES la
 * indicación: los tres botones seguirían presentes con cualquier disposición.
 */

import { act, screen } from '@testing-library/react';
import type { Configuracion } from '../../../../src/domain/config';
import { PanelCotizacion } from '../../../../src/ui/shell/cotizacion';
import { materialPrueba } from '../steps/config-prueba';
import { montarPasos } from '../steps/utilidades-prueba';

const configuracion = vi.hoisted(() => ({ actual: null as Configuracion | null }));

afterEach(() => {
  configuracion.actual = null;
});

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('../steps/config-prueba');
  return { ...mod, useConfig: () => configuracion.actual ?? construirConfigPrueba() };
});

function textosDeBotones(): string[] {
  return screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
}

describe('PanelCotizacion — colocación de los botones', () => {
  it('«Generar PDF» va antes que «Añadir al pedido» y «Reiniciar»', () => {
    montarPasos(<PanelCotizacion />);

    const botones = textosDeBotones();
    const iPdf = botones.findIndex((t) => t.startsWith('Generar PDF'));
    const iAnadir = botones.indexOf('Añadir al pedido');
    const iReiniciar = botones.indexOf('Reiniciar');

    expect(iPdf).toBeGreaterThanOrEqual(0);
    expect(iPdf).toBeLessThan(iAnadir);
    expect(iAnadir).toBeLessThan(iReiniciar);
  });

  it('«Añadir al pedido» y «Reiniciar» comparten fila', () => {
    montarPasos(<PanelCotizacion />);

    const anadir = screen.getByRole('button', { name: 'Añadir al pedido' });
    const reiniciar = screen.getByRole('button', { name: 'Reiniciar' });
    // Misma fila = mismo padre, y ese padre es la rejilla de dos columnas.
    expect(anadir.parentElement).toBe(reiniciar.parentElement);
    expect(anadir.parentElement?.className).toContain('grid-cols-2');
  });

  it('el énfasis pasa a «Añadir al pedido» en cuanto hay pedido empezado', () => {
    const { api } = montarPasos(<PanelCotizacion />);

    // Con el pedido vacío manda «Generar PDF»: es el flujo de una sola pieza.
    expect(screen.getByRole('button', { name: /Generar PDF/ }).className).toContain('bg-marca');
    expect(screen.getByRole('button', { name: 'Añadir al pedido' }).className).not.toContain(
      'bg-marca',
    );

    act(() => {
      api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() });
      api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'peldano-romo' });
    });
    act(() => {
      api().dispatch({ tipo: 'cambiarMedida', medida: 'longitud', valor: '50' });
      api().dispatch({ tipo: 'cambiarMedida', medida: 'fondo', valor: '30' });
    });
    act(() => api().dispatch({ tipo: 'anadirAlPedido' }));
    expect(api().estado.carrito).toHaveLength(1);

    expect(screen.getByRole('button', { name: 'Añadir al pedido' }).className).toContain(
      'bg-marca',
    );
    expect(screen.getByRole('button', { name: /Generar PDF/ }).className).not.toContain('bg-marca');
  });
});
