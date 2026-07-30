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
import { extraerTerminosBusqueda, normalizarTexto } from './busqueda';
import { obtenerArticuloCataleg, obtenerArticulosCataleg } from './fuenteCataleg';

// Cuelga de BASE_URL porque la app se sirve bajo un subpath (/atelier-studio/).
export const URL_INDICE_CATALEG = `${import.meta.env.BASE_URL}data/indice-cataleg.json`;

/**
 * Lista de artículos ocultos del catálogo (zócalos y piezas especiales por
 * referencia, indicación del encargo 2026-07-28; mosaicos y rodapiés por
 * palabra en el título, indicación de dirección 2026-07-28 — son producto
 * acabado, no material base de corte). Vive en configuración (§0: nada
 * hardcodeado), no en código.
 * PROVISIONAL (solo las referencias): el encargo dio los ids de feature de
 * PrestaShop (ver el propio JSON); el API del catàleg no expone features, así
 * que la lista se mantiene a mano por referencia hasta que el ERP los exponga
 * (PENDIENTES.md §4.8).
 */
export const URL_EXCLUSIONES_CATALOGO = `${import.meta.env.BASE_URL}config/catalogo.json`;

/**
 * Texto que parece una referencia exacta: solo dígitos, mínimo 4 (el mismo
 * umbral que usa el indexador del sitemap, `generar-indice-cataleg.mjs`).
 */
const PATRON_REFERENCIA_EXACTA = /^\d{4,}$/;

/**
 * Predicado «título oculto»: true si el título contiene alguna de las palabras
 * configuradas, comparando NORMALIZADO (minúsculas y sin diacríticos, como la
 * búsqueda): «RODAPIE» oculta también «RODAPIÉ …» — el índice mezcla ambas
 * grafías — y erratas tipo «RODAPIÉTREVERK…». La misma regla aplica el
 * indexador (`generar-indice-cataleg.mjs`) al regenerar el índice.
 */
export function crearPredicadoTituloOculto(
  palabras: readonly string[],
): (titulo: string) => boolean {
  const palabrasNormalizadas = palabras.map(normalizarTexto).filter((p) => p.length > 0);
  if (palabrasNormalizadas.length === 0) return () => false;
  return (titulo) => {
    const tituloNormalizado = normalizarTexto(titulo);
    return palabrasNormalizadas.some((p) => tituloNormalizado.includes(p));
  };
}

/**
 * Artículo del índice tal como se serializa en el JSON: tupla compacta
 * `[referencia, titulo, imagenUrl]`. Los nombres de campo repetidos ~33.000
 * veces eran ~1,1 MB del índice; el orden lo fija el indexador
 * (`generar-indice-cataleg.mjs`).
 */
type ArticuloIndiceJson = readonly [referencia: string, titulo: string, imagenUrl: string];

interface IndiceCatalegJson {
  readonly _aviso: string;
  readonly generadoEn: string;
  readonly articulos: readonly ArticuloIndiceJson[];
}

interface ExclusionesCatalegJson {
  readonly referenciasOcultas?: readonly string[];
  readonly palabrasTituloOcultas?: readonly string[];
}

/** Artículo ya preparado en memoria: campos con nombre + cadena buscable precomputada. */
interface ArticuloIndice {
  readonly referencia: string;
  readonly titulo: string;
  readonly imagenUrl: string;
  /** Título y referencia normalizados UNA vez al cargar (el filtro por texto solo hace `includes`). */
  readonly busqueda: string;
}

interface IndiceCargado {
  /** Artículos del índice SIN las referencias ocultas ni los títulos ocultos. */
  readonly articulos: readonly ArticuloIndice[];
  /** Referencias ocultas (para el camino de consulta directa por código). */
  readonly ocultas: ReadonlySet<string>;
  /** Títulos ocultos por palabra (para la consulta directa por código). */
  readonly tituloOculto: (titulo: string) => boolean;
}

/**
 * Crea la fuente de catálogo real. `url` y `urlExclusiones` son inyectables
 * para tests. `prestashopImgBase` se conserva por si algún día hace falta un
 * fallback (el índice ya trae la imagen real; ver cabecera del módulo).
 */
export function crearFuenteIndiceCataleg(
  url: string = URL_INDICE_CATALEG,
  prestashopImgBase: string | null = null,
  urlExclusiones: string = URL_EXCLUSIONES_CATALOGO,
): FuenteCatalogo {
  let cache: Promise<IndiceCargado> | null = null;

  const cargar = (): Promise<IndiceCargado> => {
    cache ??= (async () => {
      // Las exclusiones son un extra opcional: si el JSON falta o falla, se
      // busca sin filtrar (nunca bloquea el catálogo).
      const [res, resExclusiones] = await Promise.all([
        fetch(url),
        fetch(urlExclusiones).catch(() => null),
      ]);
      if (!res.ok) {
        throw new Error(
          `No se pudo cargar el índice del catálogo: ${url} (${res.status}). ` +
            `¿Se ha ejecutado "npm run indice:cataleg"?`,
        );
      }
      const json = (await res.json()) as IndiceCatalegJson;
      let ocultas = new Set<string>();
      let tituloOculto = crearPredicadoTituloOculto([]);
      if (resExclusiones?.ok) {
        const exclusiones = (await resExclusiones.json()) as ExclusionesCatalegJson;
        ocultas = new Set(exclusiones.referenciasOcultas ?? []);
        tituloOculto = crearPredicadoTituloOculto(exclusiones.palabrasTituloOcultas ?? []);
      }
      return {
        articulos: json.articulos
          .filter(([referencia, titulo]) => !ocultas.has(referencia) && !tituloOculto(titulo))
          .map(([referencia, titulo, imagenUrl]) => ({
            referencia,
            titulo,
            imagenUrl,
            // Cadena buscable precomputada UNA vez aquí: normalizar (NFD + sin
            // diacríticos + minúsculas) los ~33.000 títulos en cada pulsación
            // de tecla era el coste dominante de buscar(). Equivale a
            // coincideBusqueda([titulo, referencia], texto): los términos de
            // búsqueda nunca contienen espacios, así que ninguno puede casar
            // «a caballo» del espacio que une título y referencia.
            busqueda: `${normalizarTexto(titulo)} ${normalizarTexto(referencia)}`,
          })),
        ocultas,
        tituloOculto,
      };
    })();
    return cache;
  };

  return {
    origen: 'cataleg',

    async buscar(consulta: ConsultaCatalogo): Promise<ResultadoBusquedaCatalogo> {
      // El índice no conoce la marca (idmarca del API real es un id numérico
      // sin nombre resuelto, ver PENDIENTES.md): con filtro de marca no hay resultados.
      if (consulta.marca !== null) return { materiales: [], totalCoincidencias: 0 };

      const { articulos, ocultas, tituloOculto } = await cargar();
      const terminos = extraerTerminosBusqueda(consulta.texto);
      // Filtro local instantáneo: solo `includes` sobre la cadena precomputada.
      // Sin términos (texto vacío o solo espacios) every() es true: casa todo.
      const coincidencias = articulos.filter((a) =>
        terminos.every((termino) => a.busqueda.includes(termino)),
      );

      // Sin coincidencia local y texto con pinta de referencia exacta:
      // consulta directa al API por código (artículos sin página pública en
      // ferrolan.es no están en el índice; ver cabecera del módulo, punto 4).
      if (coincidencias.length === 0 && consulta.pagina === 1) {
        const referencia = consulta.texto.trim();
        if (PATRON_REFERENCIA_EXACTA.test(referencia) && !ocultas.has(referencia)) {
          const directa = await obtenerArticuloCataleg(referencia, prestashopImgBase);
          if (
            directa.ok &&
            directa.resultado.tipo === 'material' &&
            !tituloOculto(directa.resultado.material.descripcion)
          ) {
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
