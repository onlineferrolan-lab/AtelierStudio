/**
 * Tests de `pasos-context.tsx`: apertura inicial de solo el paso 1, apertura
 * automática del paso siguiente al completarse uno (transición
 * incompleto→completo, no en cada render) y alternancia manual independiente de
 * eso. Regla clave: el automatismo NUNCA cierra un paso (2026-07-29).
 */

import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { ProveedorPasos, usePasoCompletado, usePasos } from '../../../../src/ui/state/pasos-context';

function SondaPaso({
  numero,
  completo,
  retrasoMs,
}: {
  numero: number;
  completo: boolean;
  retrasoMs?: number;
}): JSX.Element {
  const pasos = usePasos();
  usePasoCompletado(numero, completo, retrasoMs);
  return (
    <div>
      paso-{numero}: {pasos.estado[numero] ? 'abierto' : 'cerrado'}
      <button type="button" onClick={() => pasos.alternar(numero)}>
        alternar-{numero}
      </button>
    </div>
  );
}

function Arnes(): JSX.Element {
  const [completo1, setCompleto1] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setCompleto1(true)}>
        completar-1
      </button>
      <button type="button" onClick={() => setCompleto1(false)}>
        descompletar-1
      </button>
      <SondaPaso numero={1} completo={completo1} />
      <SondaPaso numero={2} completo={false} />
    </>
  );
}

function ArnesConRetraso({ retrasoMs }: { retrasoMs: number }): JSX.Element {
  const [completo1, setCompleto1] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setCompleto1(true)}>
        completar-1
      </button>
      <button type="button" onClick={() => setCompleto1(false)}>
        descompletar-1
      </button>
      <SondaPaso numero={1} completo={completo1} retrasoMs={retrasoMs} />
      <SondaPaso numero={2} completo={false} />
    </>
  );
}

describe('ProveedorPasos', () => {
  it('empieza con solo el paso 1 abierto', () => {
    render(
      <ProveedorPasos>
        <Arnes />
      </ProveedorPasos>,
    );
    expect(screen.getByText('paso-1: abierto')).toBeInTheDocument();
    expect(screen.getByText('paso-2: cerrado')).toBeInTheDocument();
  });

  it('al completarse un paso, abre el siguiente y deja abierto el actual', () => {
    render(
      <ProveedorPasos>
        <Arnes />
      </ProveedorPasos>,
    );
    act(() => screen.getByText('completar-1').click());
    expect(screen.getByText('paso-2: abierto')).toBeInTheDocument();
    // El automatismo solo abre: el paso que se acaba de completar sigue abierto.
    expect(screen.getByText('paso-1: abierto')).toBeInTheDocument();
  });

  it('alternar a mano abre/cierra el paso indicado sin afectar a los demás', () => {
    render(
      <ProveedorPasos inicial={{ 1: true }}>
        <Arnes />
      </ProveedorPasos>,
    );
    act(() => screen.getByText('alternar-2').click());
    expect(screen.getByText('paso-1: abierto')).toBeInTheDocument();
    expect(screen.getByText('paso-2: abierto')).toBeInTheDocument();

    act(() => screen.getByText('alternar-1').click());
    expect(screen.getByText('paso-1: cerrado')).toBeInTheDocument();
  });

  it('acepta un estado inicial distinto (para montar un paso aislado en tests)', () => {
    render(
      <ProveedorPasos inicial={{ 3: true }}>
        <SondaPaso numero={3} completo={false} />
      </ProveedorPasos>,
    );
    expect(screen.getByText('paso-3: abierto')).toBeInTheDocument();
  });
});

describe('usePasoCompletado con retrasoMs (§ PasoMedidas: un solo dígito no debe abrir el paso siguiente)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no abre el siguiente hasta que pasa el retraso', () => {
    render(
      <ProveedorPasos>
        <ArnesConRetraso retrasoMs={700} />
      </ProveedorPasos>,
    );
    act(() => screen.getByText('completar-1').click());
    expect(screen.getByText('paso-2: cerrado')).toBeInTheDocument(); // todavía no

    act(() => {
      vi.advanceTimersByTime(699);
    });
    expect(screen.getByText('paso-2: cerrado')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('paso-2: abierto')).toBeInTheDocument();
    expect(screen.getByText('paso-1: abierto')).toBeInTheDocument();
  });

  it('si deja de estar completo antes de que pase el retraso, se cancela el avance', () => {
    render(
      <ProveedorPasos>
        <ArnesConRetraso retrasoMs={700} />
      </ProveedorPasos>,
    );
    act(() => screen.getByText('completar-1').click());
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => screen.getByText('descompletar-1').click()); // p. ej. el comercial sigue borrando/tecleando

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Nunca abrió el siguiente: el paso 2 sigue cerrado.
    expect(screen.getByText('paso-2: cerrado')).toBeInTheDocument();
    expect(screen.getByText('paso-1: abierto')).toBeInTheDocument();
  });
});
