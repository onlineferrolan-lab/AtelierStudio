/**
 * Fuente de catálogo de MUESTRA (origen 'muestra').
 *
 * Carga `public/data/catalogo-muestra.json`, catálogo de desarrollo claramente
 * marcado como FALSO (§7.3: «UI estática ... con catálogo de muestra claramente
 * marcado como falso»). La UI debe mostrar el origen 'muestra' como tal.
 *
 * Se usa mientras no haya conexión real con el ERP (§6.13/§6.14).
 */

import type { Material } from '../domain/types';
import { eurosACentimos } from '../domain/money';
import { cmAMm } from '../domain/units';
import type { ConsultaCatalogo, FuenteCatalogo, ResultadoBusquedaCatalogo } from './catalogo';
import { coincideBusqueda } from './busqueda';

export const URL_CATALOGO_MUESTRA = `${import.meta.env.BASE_URL}data/catalogo-muestra.json`;

interface FormatoMuestraJson {
  largoCm: number;
  anchoCm: number;
}

interface ArticuloMuestraJson {
  referencia: string;
  descripcion: string;
  marca: string;
  formato: FormatoMuestraJson;
  precioM2Euros: number;
  piezasPorCaja: number | null;
  m2PorCaja: number | null;
  imagen: string | null;
}

interface CatalogoMuestraJson {
  _aviso: string;
  articulos: ArticuloMuestraJson[];
}

function mapearArticuloMuestra(json: ArticuloMuestraJson): Material {
  return {
    referencia: json.referencia,
    descripcion: json.descripcion,
    marca: json.marca,
    formato: {
      largoMm: cmAMm(json.formato.largoCm),
      anchoMm: cmAMm(json.formato.anchoCm),
    },
    precioM2Centimos: eurosACentimos(json.precioM2Euros),
    precioUnidadCentimos: null,
    subfamilia: null,
    piezasPorCaja: json.piezasPorCaja,
    m2PorCaja: json.m2PorCaja,
    imagenUrl: json.imagen,
    esManual: false,
  };
}

/**
 * Crea la fuente de muestra. El JSON se descarga una sola vez y se cachea
 * (catálogo estático de desarrollo). `url` es inyectable para tests.
 */
export function crearFuenteMuestra(url: string = URL_CATALOGO_MUESTRA): FuenteCatalogo {
  let cache: Promise<readonly Material[]> | null = null;

  const cargar = (): Promise<readonly Material[]> => {
    cache ??= (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`No se pudo cargar el catálogo de muestra: ${url} (${res.status})`);
      }
      const json = (await res.json()) as CatalogoMuestraJson;
      return json.articulos.map(mapearArticuloMuestra);
    })();
    return cache;
  };

  return {
    origen: 'muestra',

    async buscar(consulta: ConsultaCatalogo): Promise<ResultadoBusquedaCatalogo> {
      const articulos = await cargar();
      const coincidencias = articulos.filter(
        (m) =>
          (consulta.marca === null || m.marca === consulta.marca) &&
          coincideBusqueda([m.descripcion, m.referencia, m.marca], consulta.texto),
      );
      const inicio = (consulta.pagina - 1) * consulta.tamanoPagina;
      return {
        materiales: coincidencias.slice(inicio, inicio + consulta.tamanoPagina),
        totalCoincidencias: coincidencias.length,
      };
    },

    async marcas(): Promise<readonly string[]> {
      const articulos = await cargar();
      const marcas = new Set<string>();
      for (const m of articulos) {
        if (m.marca !== null) marcas.add(m.marca);
      }
      return [...marcas].sort((a, b) => a.localeCompare(b, 'es'));
    },
  };
}
