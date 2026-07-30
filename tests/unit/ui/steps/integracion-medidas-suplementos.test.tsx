/**
 * Test de integración paso ③ Medidas + paso ④ Suplementos: al validarse las
 * medidas se abre el ④, y el ③ se queda abierto. NADA cierra el ③ solo — ni
 * completarse, ni activar un suplemento, ni pasar el ratón por el ④ (el
 * automatismo solo abre pasos, 2026-07-29). Ver `pasos-context.tsx`.
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

describe('Medidas → Suplementos: apertura automática, sin cierres', () => {
  it('al completar las medidas se abre Suplementos, pero Medidas sigue abierto', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    // Suplementos todavía cerrado: no se ve ninguno de sus conmutadores.
    expect(screen.queryByRole('checkbox', { name: /Angular/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Ancho/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });

    act(() => {
      vi.runAllTimers();
    });

    // Suplementos ya está abierto...
    expect(screen.getByRole('checkbox', { name: /Angular/ })).toBeInTheDocument();
    // ...y Medidas NO se ha cerrado solo: sus campos siguen visibles.
    expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
  });

  it('activar un suplemento NO cierra Medidas', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Ancho/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });
    act(() => {
      vi.runAllTimers();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));

    expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
    expect(api().estado.suplementos['angular-f14']).toBe(true);
  });

  it('mover el ratón sobre Suplementos NO cierra Medidas', () => {
    const { api } = montar();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Ancho/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/^Altura frontal/), { target: { value: '4' } });
    act(() => {
      vi.runAllTimers();
    });

    fireEvent.mouseMove(screen.getByText('Suplementos'));

    expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
  });
});
