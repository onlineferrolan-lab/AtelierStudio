/**
 * Primitivas de UI compartidas, siguiendo el patrón visual de Top Studio
 * (pasos numerados en tarjetas blancas, campos con etiqueta, tooltips "i",
 * controles segmentados, insignias de estado).
 */

import type { InputHTMLAttributes, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Tarjeta de paso numerado (colapsable)
// ---------------------------------------------------------------------------

export function PasoCard({
  numero,
  titulo,
  children,
  abierto,
  alAlternar,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
  /** Controlado desde `usePasos()` (§ ui/state/pasos-context.tsx): se abre solo al completarse el anterior. */
  abierto: boolean;
  alAlternar: () => void;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={alAlternar}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={abierto}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-semibold text-white">
          {numero}
        </span>
        <span className="text-base font-semibold text-slate-800">{titulo}</span>
        <span className="ml-auto text-slate-400" aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
      </button>
      {abierto && <div className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Campo con etiqueta, ayuda y error
// ---------------------------------------------------------------------------

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {etiqueta}
        {ayuda ? <InfoTooltip texto={ayuda} /> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Entrada numérica (texto crudo; la validación vive en el motor)
// ---------------------------------------------------------------------------

interface EntradaNumeroProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  valor: string;
  alCambiar: (valor: string) => void;
  invalido?: boolean;
}

export function EntradaNumero({ valor, alCambiar, invalido, ...resto }: EntradaNumeroProps): JSX.Element {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-marca focus:ring-2 focus:ring-marca/20 ${
        invalido ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'
      }`}
      {...resto}
    />
  );
}

// ---------------------------------------------------------------------------
// Control segmentado (p. ej. Recto/L/U en Top Studio; aquí Stock/Pedido, 7,2/8)
// ---------------------------------------------------------------------------

export function ControlSegmentado<T extends string>({
  opciones,
  valor,
  alCambiar,
  ariaLabel,
}: {
  opciones: readonly { valor: T; etiqueta: string }[];
  valor: T;
  alCambiar: (valor: T) => void;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-md border border-slate-300">
      {opciones.map((op) => (
        <button
          key={op.valor}
          type="button"
          role="radio"
          aria-checked={valor === op.valor}
          onClick={() => alCambiar(op.valor)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            valor === op.valor ? 'bg-marca text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila conmutadora (checkbox al estilo "No necesito este servicio")
// ---------------------------------------------------------------------------

export function FilaConmutador({
  etiqueta,
  activo,
  alCambiar,
  detalle,
}: {
  etiqueta: string;
  activo: boolean;
  alCambiar: (activo: boolean) => void;
  detalle?: string;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={activo}
        onChange={(e) => alCambiar(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-marca"
      />
      <span className="text-sm text-slate-800">
        {etiqueta}
        {detalle ? <span className="block text-xs text-slate-500">{detalle}</span> : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Tooltip "i" (patrón Top Studio)
// ---------------------------------------------------------------------------

export function InfoTooltip({ texto }: { texto: string }): JSX.Element {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] font-bold text-slate-500"
        aria-label={`Información: ${texto}`}
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-56 -translate-x-1/2 rounded-md bg-slate-800 px-2 py-1.5 text-xs font-normal text-white group-hover:block group-focus-within:block">
        {texto}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Insignias de estado (PROVISIONAL / PENDIENTE / MUESTRA / MANUAL)
// ---------------------------------------------------------------------------

export type TonoInsignia = 'provisional' | 'pendiente' | 'muestra' | 'manual' | 'info';

const ESTILOS_INSIGNIA: Record<TonoInsignia, string> = {
  provisional: 'bg-marca-claro text-marca border-marca/40',
  pendiente: 'bg-slate-100 text-slate-500 border-slate-300',
  muestra: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
  manual: 'bg-sky-100 text-sky-800 border-sky-300',
  info: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function Insignia({ tono, children }: { tono: TonoInsignia; children: ReactNode }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ESTILOS_INSIGNIA[tono]}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

export function Boton({
  variante = 'primario',
  children,
  ...resto
}: {
  variante?: 'primario' | 'secundario';
} & React.ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  const estilos =
    variante === 'primario'
      ? 'bg-marca text-white hover:bg-marca-oscuro disabled:bg-slate-300'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400';
  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed ${estilos}`}
      {...resto}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Pestañas (Catálogo / Visor 3D)
// ---------------------------------------------------------------------------

export function Pestanas<T extends string>({
  pestanas,
  activa,
  alCambiar,
}: {
  pestanas: readonly { id: T; etiqueta: string }[];
  activa: T;
  alCambiar: (id: T) => void;
}): JSX.Element {
  return (
    <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {pestanas.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={activa === p.id}
          onClick={() => alCambiar(p.id)}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            activa === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
