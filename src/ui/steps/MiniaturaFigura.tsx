/**
 * Miniaturas del paso ② Figura.
 *
 * Las figuras que tienen dibujo en la tarifa PDF de taller (Torelos,
 * Juny 2023) usan ese dibujo oficial como preview (`public/figuras/*.png`,
 * extraídos del PDF). El croquis ACOTADO sigue pendiente de taller (§3): la
 * receta actual se deduce de estos dibujos y el seguimiento queda en
 * PENDIENTES.md y en el flag `croquisPendiente` de la configuración.
 *
 *  - 'corte': el PDF no incluye dibujo (cortes rectangulares, §3) → placa
 *    isométrica genérica.
 *  - Figuras 'pendiente' (§6.5/§6.6): silueta gris.
 */

import type { Figura } from '../../domain/config';

/** Dibujos de la tarifa PDF por id de figura (rodapié no estándar comparte el del estándar). */
const DIBUJOS_PDF: Readonly<Record<string, string>> = {
  'figura-1': `${import.meta.env.BASE_URL}figuras/figura-1.png`,
  'figura-2': `${import.meta.env.BASE_URL}figuras/figura-2.png`,
  'figura-3': `${import.meta.env.BASE_URL}figuras/figura-3.png`,
  'figura-4': `${import.meta.env.BASE_URL}figuras/figura-4.png`,
  'peldano-romo': `${import.meta.env.BASE_URL}figuras/peldano-romo.png`,
  'rodapie-estandar': `${import.meta.env.BASE_URL}figuras/rodapie.png`,
  'rodapie-no-estandar': `${import.meta.env.BASE_URL}figuras/rodapie.png`,
};

/** Placa isométrica genérica para 'corte de piezas' (sin dibujo en la tarifa PDF). */
function PlacaCorte(): JSX.Element {
  return (
    <svg
      viewBox="0 0 96 64"
      className="h-16 w-24 shrink-0"
      role="img"
      aria-label="Perfil de corte de piezas"
    >
      <ellipse cx="48" cy="55" rx="30" ry="4.5" fill="#0f172a" opacity="0.07" />
      <g stroke="#7A0420" strokeWidth="0.8" strokeLinejoin="round">
        <polygon points="63.5,42.8 41.1,54.1 41.1,51.1 63.5,39.8" fill="#8F0525" />
        <polygon points="41.1,54.1 22.4,43.3 22.4,40.3 41.1,51.1" fill="#C40731" />
        <polygon points="63.5,39.8 41.1,51.1 22.4,40.3 44.8,29.0" fill="#F6D3DB" />
      </g>
    </svg>
  );
}

/** Silueta gris genérica para figuras pendientes o sin preview definido. */
function SiluetaPendiente(): JSX.Element {
  return (
    <svg
      viewBox="0 0 96 64"
      className="h-16 w-24 shrink-0"
      role="img"
      aria-label="Figura pendiente de definir"
    >
      <rect
        x="24"
        y="14"
        width="48"
        height="34"
        fill="#f1f5f9"
        stroke="#94a3b8"
        strokeWidth="2"
        strokeDasharray="5 4"
        rx="3"
      />
      <text x="48" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="#94a3b8">
        ?
      </text>
    </svg>
  );
}

export function MiniaturaFigura({ figura }: { figura: Figura }): JSX.Element {
  if (figura.estado === 'pendiente') {
    return <SiluetaPendiente />;
  }
  const dibujo = DIBUJOS_PDF[figura.id];
  if (dibujo) {
    return (
      <img
        src={dibujo}
        alt={`Perfil de ${figura.nombre}`}
        className="h-16 w-24 shrink-0 object-contain"
        loading="lazy"
      />
    );
  }
  return <PlacaCorte />;
}
