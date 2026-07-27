/**
 * Fuente de catálogo REAL basada en el índice de búsqueda generado a partir
 * del sitemap público de ferrolan.es (`scripts/generar-indice-cataleg.mjs` →
 * `public/data/indice-cataleg.json`).
 *
 * Por qué existe (ver PENDIENTES.md §4.8): el API del catálogo de cerámica
 * (studio.ferrolan.es/cataleg/) no tiene listado/búsqueda, solo consulta por
 * código. El sitemap público de la tienda sí lista, para cada artículo
 * publicado, una URL que termina en el mismo código (verificado contra el API
 * real) y una imagen — así que sirve de índice de búsqueda por texto.
 *
 * Estrategia de `buscar()` (paginada, §1.①):
 *  1. Filtrar el índice local (referencia + título) por texto — instantáneo,
 *     sin red — y contar el total de coincidencias (para "página X de Y").
 *  2. Pedir los datos autoritativos (tarifa, mides) SOLO de los candidatos de
 *     la página pedida, con UNA llamada por lote (`obtenerArticulosCataleg`);
 *     el tamaño de página está acotado a `TAMANO_PAGINA_MAXIMO` (50, el
 *     límite del propio lote), así que nunca hace falta trocear. No se pide
 *     nunca más de una página de golpe ni una petición por tecla: se respeta
 *     el límite de 120 peticiones/minuto del proveedor.
 *  3. La imagen se toma del índice (real, de PrestaShop), no del API de
 *     catálogo (que no tiene campo de imagen).
 *  4. Consulta directa por referencia exacta: si el texto buscado parece una
 *     referencia (solo dígitos, ≥4) y NO hay coincidencia local, se hace UNA
 *     llamada `?accio=article&codi=…` (`obtenerArticuloCataleg`). Así se
 *     encuentran artículos que están en el API real pero no en el sitemap
 *     (p. ej. sin página pública en ferrolan.es); en ese caso no hay imagen
 *     del índice y se usa el patrón PrestaShop si está configurado.
 *
 * Los ~21.000 artículos CE sin fitxa web (§ contrato del API) tampoco tienen
 * página pública, así que casi nunca aparecerán aquí; si alguno lo hace sin
 * mides en el API, se intenta extraer el formato de la descripción
 * (`extraerFormatoDeDescripcion`, decisión 2026-07-27) y solo se omite del
 * resultado si tampoco hay formato en el texto (no se puede construir un
 * `Material` válido sin inventar un formato — el comercial puede darlo de
 * alta con «Entrada manual» si lo necesita).
 */

import type { Material } from '../domain/types';
import { TAMANO_PAGINA_MAXIMO, type ConsultaCatalogo, type FuenteCatalogo, type ResultadoBusquedaCatalogo } from './catalogo';
import { coincideBusqueda } from './busqueda';
import { obtenerArticuloCataleg, obtenerArticulosCataleg } from './fuenteCataleg';

// Cuelga de BASE_URL porque la app se sirve bajo un subpath (/atelier-studio/).
export const URL_INDICE_CATALEG = `${import.meta.env.BASE_URL}data/indice-cataleg.json`;

/**
 * Texto que parece una referencia exacta: solo dígitos, mínimo 4 (el mismo
 * umbral que usa el indexador del sitemap, `generar-indice-cataleg.mjs`).
 */
const PATRON_REFERENCIA_EXACTA = /^\d{4,}$/;

interface ArticuloIndiceJson {
  readonly referencia: string;
  readonly titulo: string;
  readonly imagenUrl: string;
}

interface IndiceCatalegJson {
  readonly _aviso: string;
  readonly generadoEn: string;
  readonly articulos: readonly ArticuloIndiceJson[];
}

/**
 * Crea la fuente de catálogo real. `url` es inyectable para tests.
 * `prestashopImgBase` se conserva por si algún día hace falta un fallback
 * (el índice ya trae la imagen real; ver cabecera del módulo).
 */
export function crearFuenteIndiceCataleg(
  url: string = URL_INDICE_CATALEG,
  prestashopImgBase: string | null = null,
): FuenteCatalogo {
  let cache: Promise<readonly ArticuloIndiceJson[]> | null = null;

  const cargar = (): Promise<readonly ArticuloIndiceJson[]> => {
    cache ??= (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el índice del catálogo: ${url} (${res.status}). ` +
            `¿Se ha ejecutado "npm run indice:cataleg"?`,
        );
      }
      const json = (await res.json()) as IndiceCatalegJson;
      return json.articulos;
    })();
    return cache;
  };

  return {
    origen: 'cataleg',

    async buscar(consulta: ConsultaCatalogo): Promise<ResultadoBusquedaCatalogo> {
      // El índice no conoce la marca (idmarca del API real es un id numérico
      // sin nombre resuelto, ver PENDIENTES.md): con filtro de marca no hay resultados.
      if (consulta.marca !== null) return { materiales: [], totalCoincidencias: 0 };

      const articulos = await cargar();
      const coincidencias = articulos.filter((a) =>
        coincideBusqueda([a.titulo, a.referencia], consulta.texto),
      );

      // Sin coincidencia local y texto con pinta de referencia exacta:
      // consulta directa al API por código (artículos sin página pública en
      // ferrolan.es no están en el índice; ver cabecera del módulo, punto 4).
      if (coincidencias.length === 0 && consulta.pagina === 1) {
        const referencia = consulta.texto.trim();
        if (PATRON_REFERENCIA_EXACTA.test(referencia)) {
          const directa = await obtenerArticuloCataleg(referencia, prestashopImgBase);
          if (directa.ok && directa.resultado.tipo === 'material') {
            return { materiales: [directa.resultado.material], totalCoincidencias: 1 };
          }
          // no_trobat, error o 'sin_medidas': sin resultado (la UI ya ofrece
          // «Entrada manual» para completar mides a mano).
          return { materiales: [], totalCoincidencias: 0 };
        }
      }

      const tamanoPagina = Math.min(consulta.tamanoPagina, TAMANO_PAGINA_MAXIMO);
      const inicio = (consulta.pagina - 1) * tamanoPagina;
      const candidatos = coincidencias.slice(inicio, inicio + tamanoPagina);
      if (candidatos.length === 0) {
        return { materiales: [], totalCoincidencias: coincidencias.length };
      }

      const { encontrados } = await obtenerArticulosCataleg(
        candidatos.map((c) => c.referencia),
        prestashopImgBase,
      );

      const materiales: Material[] = [];
      for (const candidato of candidatos) {
        const resultado = encontrados.get(candidato.referencia);
        if (resultado?.tipo === 'material') {
          // La imagen real (de PrestaShop, vía el índice) manda sobre lo que
          // devuelva mapearArticuloCataleg (el API de catálogo no la conoce).
          materiales.push({ ...resultado.material, imagenUrl: candidato.imagenUrl });
        }
        // 'sin_medidas' o no encontrado: se omite (ver cabecera del módulo).
      }
      return { materiales, totalCoincidencias: coincidencias.length };
    },

    async marcas(): Promise<readonly string[]> {
      await cargar(); // fuerza la carga (para detectar fallos pronto, p. ej. en CatalogoPanel)
      return [];
    },
  };
}
