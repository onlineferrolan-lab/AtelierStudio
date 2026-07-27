/**
 * Tests del paso ② Figura: las figuras 'pendiente' de configuración se
 * muestran deshabilitadas con su insignia y motivo (§3, §6.5/§6.6), y las
 * activas se seleccionan despachando al estado global.
 */

import { fireEvent, screen, within } from '@testing-library/react';
import { PasoFigura } from '../../../../src/ui/steps/PasoFigura';
import { montarPasos } from './utilidades-prueba';

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('./config-prueba');
  return { ...mod, useConfig: () => construirConfigPrueba() };
});

describe('PasoFigura', () => {
  it('deshabilita las figuras pendientes y muestra el motivo', () => {
    const { api } = montarPasos(<PasoFigura />);

    const tarjetaFigura5 = screen.getByRole('button', { name: /Figura 5/ });
    expect(tarjetaFigura5).toBeDisabled();
    expect(within(tarjetaFigura5 as HTMLElement).getByText(/^pendiente$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Sin tarifa ni croquis confirmados por taller/),
    ).toBeInTheDocument();

    // Clic en una figura pendiente: no selecciona nada.
    fireEvent.click(tarjetaFigura5);
    expect(api().estado.figuraId).toBeNull();
  });

  it('selecciona una figura activa y marca la tarjeta', () => {
    const { api } = montarPasos(<PasoFigura />);

    const tarjeta = screen.getByRole('button', { name: /Peldaño romo/ });
    fireEvent.click(tarjeta);

    expect(api().estado.figuraId).toBe('peldano-romo');
    expect(tarjeta).toHaveAttribute('aria-pressed', 'true');
  });

  it('muestra las cuatro figuras sin tarifa confirmada como pendientes', () => {
    montarPasos(<PasoFigura />);
    // figura-5, pasamanos, vierteaguas y rodapie-recto (figuras.json).
    expect(screen.getAllByText(/^pendiente$/i)).toHaveLength(4);
  });
});
