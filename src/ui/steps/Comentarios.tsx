/**
 * Comentarios de la orden: texto libre del comercial para taller, con los
 * documentos que quiera enganchar (botón del clip).
 *
 * Va entre el paso ④ Suplementos y la cotización, y sale tal cual en la orden de
 * trabajo. NO es un paso numerado a propósito: es opcional y no forma parte del
 * flujo de cotizar, así que tampoco se pliega — si estuviera cerrado por defecto
 * nadie lo encontraría.
 *
 * No toca el cálculo: es una anotación para el taller (indicaciones de corte,
 * avisos de obra, quién recoge…). Los adjuntos tampoco: las imágenes salen como
 * páginas de la orden de trabajo y el resto se cita por nombre en la hoja (ver
 * `src/orden/adjuntos.ts`).
 */

import { useRef, useState } from 'react';
import {
  MAX_ADJUNTOS,
  errorDeArchivo,
  formatearTamano,
  leerArchivoComoAdjunto,
  seIncrustaEnPdf,
  type AdjuntoOrden,
} from '../../orden/adjuntos';
import { useAtelier } from '../state/quote-state';

/** Tope de longitud: en el PDF hay sitio para unas 6 líneas sin descolocar la hoja. */
const MAX_COMENTARIOS = 400;

export function Comentarios(): JSX.Element {
  const { estado, dispatch } = useAtelier();
  const restantes = MAX_COMENTARIOS - estado.comentarios.length;
  const entradaArchivos = useRef<HTMLInputElement>(null);
  const [errorAdjunto, setErrorAdjunto] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const adjuntos = estado.adjuntos;
  const lleno = adjuntos.length >= MAX_ADJUNTOS;

  async function alElegirArchivos(lista: FileList | null): Promise<void> {
    setErrorAdjunto(null);
    const archivos = Array.from(lista ?? []);
    if (archivos.length === 0) return;

    // Se valida contra los que ya hay MÁS los aceptados de esta misma tanda: al
    // seleccionar cinco de golpe con uno puesto, el que sobra es el sexto.
    const aceptados: File[] = [];
    let primerError: string | null = null;
    for (const archivo of archivos) {
      const error = errorDeArchivo(archivo, adjuntos.length + aceptados.length);
      if (error === null) aceptados.push(archivo);
      else primerError ??= error;
    }
    if (primerError !== null) setErrorAdjunto(primerError);
    if (aceptados.length === 0) return;

    setLeyendo(true);
    try {
      const nuevos = await Promise.all(aceptados.map(leerArchivoComoAdjunto));
      dispatch({ tipo: 'anadirAdjuntos', adjuntos: nuevos });
    } catch (error: unknown) {
      setErrorAdjunto(error instanceof Error ? error.message : 'No se pudo leer el documento.');
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      aria-label="Comentarios para taller"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <label
            htmlFor="comentarios-orden"
            className="block text-sm font-semibold text-slate-800"
          >
            Comentarios para taller
          </label>
          <p className="pt-0.5 text-xs text-slate-500">
            Opcional. Sale tal cual en la orden de trabajo; no afecta al precio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => entradaArchivos.current?.click()}
          disabled={lleno || leyendo}
          aria-label="Adjuntar documentos"
          title={
            lleno
              ? `Máximo ${MAX_ADJUNTOS} documentos por orden`
              : 'Adjuntar documentos (planos, fotos de obra…)'
          }
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <IconoClip />
          {adjuntos.length > 0 ? adjuntos.length : 'Adjuntar'}
        </button>
        {/* Fuera del flujo de tabulación: se llega por el botón del clip, que es
            quien lleva la etiqueta accesible y el estado deshabilitado. */}
        <input
          ref={entradaArchivos}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => {
            void alElegirArchivos(e.target.files);
            // Sin esto, volver a elegir el MISMO archivo no dispara 'change'.
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        id="comentarios-orden"
        value={estado.comentarios}
        maxLength={MAX_COMENTARIOS}
        rows={3}
        onChange={(e) => dispatch({ tipo: 'cambiarComentarios', comentarios: e.target.value })}
        placeholder="P. ej.: cortar el frontal a 45°, entregar antes del viernes, recoge el cliente…"
        className="mt-2 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-marca focus:ring-2 focus:ring-marca/20"
      />
      {estado.comentarios.length > 0 ? (
        <p className="pt-1 text-right text-xs text-slate-400">
          {restantes} caracteres restantes
        </p>
      ) : null}

      {leyendo ? <p className="pt-2 text-xs text-slate-500">Leyendo documentos…</p> : null}
      {errorAdjunto !== null ? (
        <p role="alert" className="pt-2 text-xs text-red-600">
          {errorAdjunto}
        </p>
      ) : null}

      {adjuntos.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" aria-label="Documentos adjuntos">
          {adjuntos.map((adjunto) => (
            <FilaAdjunto
              key={adjunto.id}
              adjunto={adjunto}
              alQuitar={() => dispatch({ tipo: 'quitarAdjunto', id: adjunto.id })}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Un adjunto de la lista. El nombre es un enlace de descarga (data URL) para que
 * el comercial pueda comprobar qué enganchó, y se dice si viaja dentro del PDF:
 * las imágenes salen como página de la orden, los demás documentos solo se citan
 * por nombre y hay que mandarlos aparte.
 */
function FilaAdjunto({
  adjunto,
  alQuitar,
}: {
  adjunto: AdjuntoOrden;
  alQuitar: () => void;
}): JSX.Element {
  const enPdf = seIncrustaEnPdf(adjunto);
  return (
    <li className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
      <span className="shrink-0 text-slate-400">
        <IconoClip />
      </span>
      <a
        href={adjunto.dataUrl}
        download={adjunto.nombre}
        className="min-w-0 flex-1 truncate font-medium text-slate-700 underline decoration-slate-300 hover:text-marca"
      >
        {adjunto.nombre}
      </a>
      <span className="shrink-0 text-slate-400">{formatearTamano(adjunto.bytes)}</span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
          enPdf ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'
        }`}
        title={
          enPdf
            ? 'Se incrusta como página de la orden de trabajo'
            : 'No se puede incrustar en el PDF: se cita por nombre en la hoja y hay que enviarlo aparte'
        }
      >
        {enPdf ? 'En el PDF' : 'Aparte'}
      </span>
      <button
        type="button"
        onClick={alQuitar}
        aria-label={`Quitar ${adjunto.nombre}`}
        className="shrink-0 rounded px-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-red-600"
      >
        ×
      </button>
    </li>
  );
}

/** Clip de sujetar papeles (mismo trazo que el resto de iconos de la UI). */
function IconoClip(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
