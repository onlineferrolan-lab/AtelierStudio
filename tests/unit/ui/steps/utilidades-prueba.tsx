/**
 * Utilidades para montar los pasos en tests: envuelve el componente en
 * `ProveedorAtelier` (con la config real de /public/config) y expone una
 * sonda con el estado/dispatch de `useAtelier` para preparar escenarios y
 * comprobar el estado global.
 *
 * La config llega a los pasos vía `useConfig`; cada test mockea ese hook del
 * módulo `config-context` (el contexto no se exporta y `ProveedorConfig`
 * haría fetch a /config, no disponible en jsdom).
 *
 * Estos tests montan CADA PASO AISLADO (sin los demás), así que el estado de
 * apertura automática (`pasos-context.tsx`) no tiene ocasión de abrir el paso
 * bajo prueba por sí solo: se monta con los cuatro abiertos, igual que antes
 * de que existiera el automatismo (ver `PasoCard`/`ProveedorPasos`).
 */

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ProveedorAtelier, useAtelier } from '../../../../src/ui/state/quote-state';
import { ProveedorPasos, usePasos } from '../../../../src/ui/state/pasos-context';

export type AtelierApi = ReturnType<typeof useAtelier>;
export type PasosApi = ReturnType<typeof usePasos>;

export function montarPasos(ui: ReactElement): {
  api: () => AtelierApi;
  /** Estado de apertura de los pasos, para simular que el comercial abre/cierra tarjetas. */
  pasos: () => PasosApi;
} {
  let actual: AtelierApi | null = null;
  let actualPasos: PasosApi | null = null;
  function Captura(): null {
    actual = useAtelier();
    actualPasos = usePasos();
    return null;
  }
  render(
    <ProveedorAtelier>
      <ProveedorPasos inicial={{ 1: true, 2: true, 3: true, 4: true }}>
        {ui}
        <Captura />
      </ProveedorPasos>
    </ProveedorAtelier>,
  );
  return {
    api: () => {
      if (!actual) throw new Error('El estado de Atelier aún no está montado');
      return actual;
    },
    pasos: () => {
      if (!actualPasos) throw new Error('El estado de los pasos aún no está montado');
      return actualPasos;
    },
  };
}
