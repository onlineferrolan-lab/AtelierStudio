/**
 * Estado del panel derecho (pestañas Catálogo / Visor 3D, §1).
 * Contrato compartido: el shell renderiza las pestañas; los pasos pueden pedir
 * abrir el catálogo (p. ej. botón "Seleccionar del catálogo" del paso ①).
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type PestanaPanel = 'catalogo' | 'visor';

interface ContextoPanel {
  readonly pestana: PestanaPanel;
  readonly setPestana: (p: PestanaPanel) => void;
  readonly abrirCatalogo: () => void;
  readonly abrirVisor: () => void;
}

const Contexto = createContext<ContextoPanel | null>(null);

export function ProveedorPanel({ children }: { children: ReactNode }): JSX.Element {
  // El Catálogo es la pestaña preseleccionada (decisión de producto).
  const [pestana, setPestana] = useState<PestanaPanel>('catalogo');
  const valor = useMemo<ContextoPanel>(
    () => ({
      pestana,
      setPestana,
      abrirCatalogo: () => setPestana('catalogo'),
      abrirVisor: () => setPestana('visor'),
    }),
    [pestana],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePanelDerecho(): ContextoPanel {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('usePanelDerecho debe usarse dentro de <ProveedorPanel>');
  return ctx;
}
