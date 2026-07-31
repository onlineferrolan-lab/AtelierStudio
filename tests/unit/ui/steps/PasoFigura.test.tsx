/**
 * Tests del paso ② Figura: las figuras activas se seleccionan despachando al
 * estado global y muestran su perfil SVG. El estado 'pendiente' (§6.5/§6.6)
 * sigue soportado —aunque hoy no hay ninguna en la configuración real
 * (retiradas de la galería 2026-07-29)— y se prueba con una figura sintética.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import type { Configuracion, Figura } from '../../../../src/domain/config';
import { PasoFigura } from '../../../../src/ui/steps/PasoFigura';
import { construirConfigPrueba } from './config-prueba';
import { montarPasos } from './utilidades-prueba';

// Fábrica sustituible por test (prefijo `mock` para que vitest la admita en la fábrica).
let mockFabricaConfig: (() => Configuracion) | null = null;

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba: fabrica } = await import('./config-prueba');
  return { ...mod, useConfig: () => (mockFabricaConfig ?? fabrica)() };
});

afterEach(() => {
  mockFabricaConfig = null;
});

describe('PasoFigura', () => {
  it('deshabilita las figuras pendientes y muestra el motivo', () => {
    const base = construirConfigPrueba();
    const pendiente: Figura = {
      ...base.figuras[0],
      id: 'prueba-pendiente',
      nombre: 'Prueba pendiente',
      estado: 'pendiente',
      motivoPendiente: 'Sin tarifa ni croquis confirmados por taller (§6.5).',
    };
    mockFabricaConfig = () => ({ ...base, figuras: [...base.figuras, pendiente] });

    const { api } = montarPasos(<PasoFigura />);

    const tarjetaPendiente = screen.getByRole('button', { name: /Prueba pendiente/ });
    expect(tarjetaPendiente).toBeDisabled();
    expect(within(tarjetaPendiente as HTMLElement).getByText(/^pendiente$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Sin tarifa ni croquis confirmados por taller/),
    ).toBeInTheDocument();

    // Clic en una figura pendiente: no selecciona nada.
    fireEvent.click(tarjetaPendiente);
    expect(api().estado.figuraId).toBeNull();
  });

  it('selecciona una figura activa y marca la tarjeta', () => {
    const { api } = montarPasos(<PasoFigura />);

    const tarjeta = screen.getByRole('button', { name: /Peldaño romo/ });
    fireEvent.click(tarjeta);

    expect(api().estado.figuraId).toBe('peldano-romo');
    expect(tarjeta).toHaveAttribute('aria-pressed', 'true');
  });

  it('no hay figuras pendientes en la configuración real (retiradas 2026-07-29)', () => {
    montarPasos(<PasoFigura />);
    expect(screen.queryAllByText(/^pendiente$/i)).toHaveLength(0);
  });

  it('cada figura activa muestra su perfil SVG isométrico', () => {
    montarPasos(<PasoFigura />);
    const etiquetas = screen.getAllByRole('img').map((el) => el.getAttribute('aria-label'));
    for (const figura of construirConfigPrueba().figuras) {
      expect(etiquetas).toContain(`Perfil de ${figura.nombre}`);
    }
  });

  /**
   * Los nueve rodapiés (2026-07-31) comparten tres dibujos, uno por canto, y NO
   * tienen entrada en el mapa `SECCIONES` de `MiniaturaFigura`: se dibujan a
   * partir del canto de su receta. Si esa rama se rompiera, caerían en silencio
   * en el dibujo de «Corte de piezas» y la galería enseñaría nueve planchas
   * iguales — de ahí que se compruebe que los tres cantos difieren entre sí y
   * ninguno coincide con el del corte.
   */
  it('los tres cantos de rodapié se dibujan distintos, y ninguno como el corte', () => {
    montarPasos(<PasoFigura />);
    const perfilDe = (nombre: string): string => {
      const svg = screen.getByRole('img', { name: `Perfil de ${nombre}` });
      return svg.innerHTML;
    };

    const recto = perfilDe('Rodapié 7,2 canto recto');
    const micro = perfilDe('Rodapié 7,2 microbiselado');
    const romado = perfilDe('Rodapié 7,2 canto romado');
    const corte = perfilDe('Corte de piezas');

    expect(new Set([recto, micro, romado, corte]).size).toBe(4);
    // La altura no cambia el dibujo: 7,2 y 8 del mismo canto son la misma pieza.
    expect(perfilDe('Rodapié 8 canto recto')).toBe(recto);
    expect(perfilDe('Rodapié a medida canto romado')).toBe(romado);
  });
});
