/**
 * Tests del paso ④ Suplementos: conmutadores por suplemento de la figura con
 * los precios leídos de configuración (tarifas.json), conmutador «Pintado»
 * para figuras con tarifa pintable y mensajes guía según el estado (§1.④, §2).
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { PasoSuplementos } from '../../../../src/ui/steps/PasoSuplementos';
import { montarPasos } from './utilidades-prueba';

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('./config-prueba');
  return { ...mod, useConfig: () => construirConfigPrueba() };
});

describe('PasoSuplementos', () => {
  it('guía al paso 2 cuando no hay figura seleccionada', () => {
    montarPasos(<PasoSuplementos />);
    expect(screen.getByText(/Selecciona primero una figura en el paso 2/)).toBeInTheDocument();
  });

  it('lista los suplementos de la figura con sus precios de configuración y conmuta', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    // Precios de tarifas.json: angular-f14 2,00 €/peldaño; ranuras y goterón
    // 0,02 €/cm; espesado 0,06 €/cm (\s cubre el espacio duro de Intl es-ES).
    expect(screen.getByText(/^\+2,00\s€\/peldaño$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^\+0,02\s€\/cm$/)).toHaveLength(2);
    expect(screen.getByText(/^\+0,06\s€\/cm$/)).toBeInTheDocument();

    const angular = screen.getByRole('checkbox', { name: /Angular/ });
    expect(angular).not.toBeChecked();
    fireEvent.click(angular);
    expect(api().estado.suplementos['angular-f14']).toBe(true);
    fireEvent.click(angular);
    expect(api().estado.suplementos['angular-f14']).toBe(false);
  });

  it('muestra el conmutador Pintado en figuras con tarifa pintable', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-estandar' }));

    const pintado = screen.getByRole('checkbox', { name: /Pintado/ });
    expect(pintado).not.toBeChecked();
    fireEvent.click(pintado);
    expect(api().estado.pintado).toBe(true);
  });

  it('informa cuando la figura no tiene suplementos', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'corte' }));
    expect(screen.getByText('Esta figura no tiene suplementos.')).toBeInTheDocument();
  });
});
