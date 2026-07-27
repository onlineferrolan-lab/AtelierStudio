/**
 * Test de integración paso ③ Medidas + paso ④ Suplementos: el ③ nunca se
 * cierra solo por completarse (a diferencia de ①/②); solo lo cierra el ④,
 * y solo cuando el comercial ya actúa allí (activa un suplemento, o mueve
 * el ratón por esa tarjeta). Ver `pasos-context.tsx`.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PasoMedidas } from '../../../../src/ui/steps/PasoMedidas';
import { PasoSuplementos } from '../../../../src/ui/steps/PasoSuplementos';
import { ProveedorAtelier, useAtelier } from '../../../../src/ui/state/quote-state';
import { ProveedorPasos } from '../../../../src/ui/state/pasos-context';
import { construirConfigPrueba, materialPrueba } from './config-prueba';

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  return { ...mod, useConfig: () => construirConfigPrueba() };
});

type Api = ReturnType<typeof useAtelier>;

function montar(): { api: () => Api } {
  let actual: Api | null = null;
  function Captura(): null {
    actual = useAtelier();
    return null;
  }
  render(
    <ProveedorAtelier config={construirConfigPrueba()}>
      {/* Paso 3 ya abierto (como si acabara de llegar desde el paso 2); el 4 empieza cerrado. */}
      <ProveedorPasos inicial={{ 3: true }}>
        <PasoMedidas />
        <PasoSuplementos />
        <Captura />
      </ProveedorPasos>
    </ProveedorAtelier>,
  );
  return {
    api: () => {
      if (!actual) throw new Error('Estado no montado');
      return actual;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Medidas → Suplementos: apertura y cierre automáticos', () => {
  it('al completar las medidas se abre Suplementos, pero Medidas sigue abierto', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    // Suplementos todavía cerrado: no se ve ninguno de sus conmutadores.
    expect(screen.queryByRole('checkbox', { name: /Angular/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Longitud/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Fondo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });

    act(() => {
      vi.runAllTimers();
    });

    // Suplementos ya está abierto...
    expect(screen.getByRole('checkbox', { name: /Angular/ })).toBeInTheDocument();
    // ...y Medidas NO se ha cerrado solo: sus campos siguen visibles.
    expect(screen.getByLabelText(/^Longitud/)).toBeInTheDocument();
  });

  it('activar un suplemento cierra Medidas', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    fireEvent.change(screen.getByLabelText(/^Longitud/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Fondo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });
    act(() => {
      vi.runAllTimers();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));

    expect(screen.queryByLabelText(/^Longitud/)).not.toBeInTheDocument();
    expect(api().estado.suplementos['angular-f14']).toBe(true);
  });

  it('mover el ratón sobre Suplementos cierra Medidas', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    fireEvent.change(screen.getByLabelText(/^Longitud/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Fondo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });
    act(() => {
      vi.runAllTimers();
    });

    fireEvent.mouseMove(screen.getByText('Suplementos'));

    expect(screen.queryByLabelText(/^Longitud/)).not.toBeInTheDocument();
  });
});
