/**
 * Cabecera de Atelier Studio: logotipo de Ferrolan + «Atelier Studio»,
 * subtítulo de uso interno (§1) y el acceso al manual.
 *
 * El manual tiene botón visible aquí (2026-07-30) además del atajo Ctrl+Alt+H:
 * sin botón, un comercial nuevo no tenía forma de descubrirlo.
 */

import { descargarManual } from './atajoManual';

/**
 * Icono de ayuda (interrogante en círculo), dibujado como SVG en línea.
 *
 * El proyecto no lleva librería de iconos (solo fontsource, jspdf, react y
 * three), y traer una entera para un único glifo no se sostiene. El trazo es el
 * de un icono de verdad — círculo + gancho + punto, con remates redondeados —, no
 * un carácter «?» dentro de un borde, que se veía como un emoji suelto.
 *
 * Hereda el color del texto (`currentColor`), así que cambia con el hover del
 * botón sin reglas extra.
 */
function IconoAyuda(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.6-2.8 4" />
      <path d="M12 17.6h.01" />
    </svg>
  );
}

export function Cabecera(): JSX.Element {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 lg:px-8">
        <a href="https://ferrolan.es" target="_blank" rel="noopener noreferrer">
          <img
            src={`${import.meta.env.BASE_URL}ferrolan-logo.png`}
            alt="Ferrolan"
            className="h-9 w-[126px]"
          />
        </a>
        <h1 className="border-l border-slate-200 pl-4 text-[1.8rem] font-bold tracking-[-0.02em] text-[color:var(--primary)]">
          Atelier Studio
        </h1>
        <p className="ml-auto text-sm text-slate-500">
          Configurador de uso interno
        </p>
        <button
          type="button"
          onClick={descargarManual}
          title="Descargar el manual de usuario (Ctrl + Alt + H)"
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-marca hover:text-marca focus:outline-none focus:ring-2 focus:ring-marca/20"
        >
          <IconoAyuda />
          Manual
        </button>
      </div>
    </header>
  );
}
