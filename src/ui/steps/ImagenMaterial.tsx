/**
 * Foto del material (imagen del web service de PrestaShop, §1.①) con
 * placeholder «Sin imagen» cuando no hay URL o la carga falla. Nunca bloquea.
 */

import { useState } from 'react';
import type { Material } from '../../domain/types';

export function ImagenMaterial({
  material,
  className = 'h-28',
}: {
  material: Material;
  className?: string;
}): JSX.Element {
  const [fallida, setFallida] = useState(false);
  const alt = material.descripcion;

  if (!material.imagenUrl || fallida) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 ${className}`}
        role="img"
        aria-label={`Sin imagen de ${alt}`}
      >
        Sin imagen
      </div>
    );
  }
  return (
    <img
      src={material.imagenUrl}
      alt={alt}
      loading="lazy"
      onError={() => setFallida(true)}
      className={`bg-slate-100 object-cover ${className}`}
    />
  );
}
