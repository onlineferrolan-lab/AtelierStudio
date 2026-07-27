/**
 * App: raíz de Atelier Studio (§1: una sola página, sin login, escritorio
 * primero, español).
 *
 * Cadena de proveedores: `ProveedorConfig` (carga tarifas, figuras y parámetros
 * de /config) → pantallas propias de carga y de error → `ProveedorAtelier`
 * (estado de la cotización) → `ProveedorPanel` (pestañas Catálogo/Visor 3D) →
 * `ProveedorPasos` (apertura automática de los pasos ①-④) → `ShellAtelier`
 * (layout definitivo).
 */

import { Boton } from './ui/components/primitivas';
import { ProveedorPanel } from './ui/shell/panel';
import { ShellAtelier } from './ui/shell/shell';
import { ProveedorConfig, useEstadoConfig } from './ui/state/config-context';
import { ProveedorPasos } from './ui/state/pasos-context';
import { ProveedorAtelier } from './ui/state/quote-state';

export function App(): JSX.Element {
  return (
    <ProveedorConfig>
      <Contenido />
    </ProveedorConfig>
  );
}

function Contenido(): JSX.Element {
  const estadoConfig = useEstadoConfig();

  if (estadoConfig.situacion === 'cargando') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-marca"
          aria-hidden
        />
        <p className="text-sm text-slate-500">Cargando configuración de tarifas y figuras…</p>
      </div>
    );
  }

  if (estadoConfig.situacion === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">No se pudo cargar la configuración</h1>
          <p className="mt-1 text-sm text-slate-600">
            Las tarifas, figuras y parámetros se leen de{' '}
            <code className="rounded bg-slate-100 px-1">/config</code>. Revisa que los JSON existen y
            son válidos.
          </p>
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-red-50 p-3 text-xs text-red-700">
            {estadoConfig.mensaje}
          </pre>
          <div className="mt-4">
            <Boton variante="secundario" onClick={() => window.location.reload()}>
              Reintentar
            </Boton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProveedorAtelier config={estadoConfig.config}>
      <ProveedorPanel>
        <ProveedorPasos>
          <ShellAtelier />
        </ProveedorPasos>
      </ProveedorPanel>
    </ProveedorAtelier>
  );
}
