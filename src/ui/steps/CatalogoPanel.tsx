/**
 * Pestaña «Catálogo» del panel derecho (§1.①).
 *
 * Buscador de texto libre + filtro por marca sobre `obtenerFuenteCatalogo()`
 * (hoy: `fuenteIndiceCataleg.ts`, el índice real generado del sitemap público
 * de ferrolan.es, ver PENDIENTES.md §4.8). Cada búsqueda ya devuelve
 * `Material` completos: tarifa y mides autoritativos (lote a `/api/cataleg/`,
 * proxy same-origin sin clave en el navegador) e imagen real (del índice).
 * No hace falta ningún paso de enriquecido al seleccionar.
 *
 * Los fallos de carga (red, índice ausente) se muestran como estado de error
 * recuperable con reintento, sin romper el resto de la aplicación.
 *
 * Los resultados tienen scroll propio (panel derecho `sticky` de altura fija,
 * § shell.tsx): la columna izquierda no se mueve al hojear el catálogo.
 */

import { useEffect, useRef, useState } from 'react';
import type { Material } from '../../domain/types';
import { obtenerFuenteCatalogo, type FuenteCatalogo } from '../../data/catalogo';
import { useAtelier } from '../state/quote-state';
import { Insignia } from '../components/primitivas';
import { ImagenMaterial } from './ImagenMaterial';
import { precioMaterialTexto } from './materialUtil';

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido';
}

/** Opciones del selector «Artículos por página» (todas ≤ TAMANO_PAGINA_MAXIMO, §6.13). */
const OPCIONES_TAMANO_PAGINA = [12, 24, 48] as const;
const TAMANO_PAGINA_DEFECTO = 24;

// ---------------------------------------------------------------------------
// Tarjeta de material del catálogo (patrón Top Studio: foto, nombre, ref,
// marca y precio)
// ---------------------------------------------------------------------------

function TarjetaCatalogo({
  material,
  seleccionado,
  alSeleccionar,
}: {
  material: Material;
  seleccionado: boolean;
  alSeleccionar: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={alSeleccionar}
      aria-pressed={seleccionado}
      className={`overflow-hidden rounded-lg border bg-white text-left shadow-sm transition-shadow hover:shadow-md ${
        seleccionado ? 'border-marca ring-2 ring-marca/40' : 'border-slate-200'
      }`}
    >
      <ImagenMaterial material={material} className="h-28 w-full" />
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium text-slate-800">{material.descripcion}</p>
        <p className="text-xs text-slate-500">
          Ref. {material.referencia}
          {material.marca ? ` · ${material.marca}` : ''}
        </p>
        <p className="flex items-center gap-2 text-sm font-semibold text-marca">
          {precioMaterialTexto(material)}
          {material.esManual ? <Insignia tono="manual">Manual</Insignia> : null}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function CatalogoPanel(): JSX.Element {
  const { estado, dispatch } = useAtelier();

  const [fuente, setFuente] = useState<FuenteCatalogo | null>(null);
  const [errorFuente, setErrorFuente] = useState<string | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [marcas, setMarcas] = useState<readonly string[]>([]);

  const [texto, setTexto] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState(''); // '' = todas las marcas
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState<number>(TAMANO_PAGINA_DEFECTO);
  const [resultados, setResultados] = useState<readonly Material[]>([]);
  const [totalCoincidencias, setTotalCoincidencias] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const scrollResultadosRef = useRef<HTMLDivElement | null>(null);

  // Cambiar el texto, la marca o el tamaño de página vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [texto, marcaFiltro, tamanoPagina]);

  // Carga de la fuente de catálogo y sus marcas (con reintento manual).
  useEffect(() => {
    let cancelado = false;
    setErrorFuente(null);
    (async () => {
      try {
        const fuenteActiva = obtenerFuenteCatalogo();
        const marcasDisponibles = await fuenteActiva.marcas();
        if (!cancelado) {
          setFuente(fuenteActiva);
          setMarcas(marcasDisponibles);
        }
      } catch (error: unknown) {
        if (!cancelado) {
          setFuente(null);
          setErrorFuente(mensajeDe(error));
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [intentos]);

  // Búsqueda con pequeño debounce para no llamar a la fuente en cada tecla
  // (la fuente real hace además una llamada en lote a /api/cataleg/, §6.13).
  useEffect(() => {
    if (!fuente) return;
    let cancelado = false;
    setBuscando(true);
    const temporizador = setTimeout(() => {
      fuente
        .buscar({ texto, marca: marcaFiltro === '' ? null : marcaFiltro, pagina, tamanoPagina })
        .then(({ materiales, totalCoincidencias: total }) => {
          if (!cancelado) {
            setResultados(materiales);
            setTotalCoincidencias(total);
            setErrorBusqueda(null);
            setBuscando(false);
          }
        })
        .catch((error: unknown) => {
          if (!cancelado) {
            setErrorBusqueda(mensajeDe(error));
            setBuscando(false);
          }
        });
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [fuente, texto, marcaFiltro, pagina, tamanoPagina]);

  const totalPaginas = Math.max(1, Math.ceil(totalCoincidencias / tamanoPagina));

  // Al cambiar de página (o de búsqueda), los resultados empiezan arriba de
  // su propio scroll: sin esto, se conservaba el scroll de la página anterior.
  useEffect(() => {
    scrollResultadosRef.current?.scrollTo({ top: 0 });
  }, [resultados]);

  if (errorFuente) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">Catálogo no disponible</p>
        <p className="mt-1">{errorFuente}</p>
        <p className="mt-2 text-xs text-red-600">
          El índice del catálogo no se ha podido cargar. El resto de la herramienta sigue
          funcionando.
        </p>
        <button
          type="button"
          onClick={() => setIntentos((n) => n + 1)}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!fuente) {
    return <p className="p-4 text-sm text-slate-500">Cargando catálogo…</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por descripción o referencia…"
          aria-label="Buscar material"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
        />
        {marcas.length > 0 ? (
          <select
            value={marcaFiltro}
            onChange={(e) => setMarcaFiltro(e.target.value)}
            aria-label="Filtrar por marca"
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm shadow-sm outline-none focus:border-marca"
          >
            <option value="">Todas las marcas</option>
            {marcas.map((marca) => (
              <option key={marca} value={marca}>
                {marca}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Los resultados tienen su propio scroll: la rueda actúa donde está el cursor
          (§ layout: la columna izquierda queda fija, sin desplazarse con el catálogo). */}
      <div ref={scrollResultadosRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {errorBusqueda ? (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Error al buscar en el catálogo: {errorBusqueda}
          </p>
        ) : buscando && resultados.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">Buscando…</p>
        ) : resultados.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">
            Sin resultados para esta búsqueda. Si la pieza no está en el catálogo, usa la «Entrada
            manual» del paso 1.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-1 xl:grid-cols-3">
            {resultados.map((material) => (
              <TarjetaCatalogo
                key={material.referencia}
                material={material}
                seleccionado={estado.material?.referencia === material.referencia}
                alSeleccionar={() => dispatch({ tipo: 'seleccionarMaterial', material })}
              />
            ))}
          </div>
        )}
      </div>

      {totalCoincidencias > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              aria-label="Página anterior"
              className="rounded-md border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹
            </button>
            <span>
              Página {pagina} de {totalPaginas} ({totalCoincidencias} resultados)
            </span>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              aria-label="Página siguiente"
              className="rounded-md border border-slate-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
          </div>
          <label className="flex items-center gap-1.5">
            Artículos por página
            <select
              value={tamanoPagina}
              onChange={(e) => setTamanoPagina(Number(e.target.value))}
              aria-label="Artículos por página"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 shadow-sm outline-none focus:border-marca"
            >
              {OPCIONES_TAMANO_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
