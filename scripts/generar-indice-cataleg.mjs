#!/usr/bin/env node
/**
 * Genera `public/data/indice-cataleg.json`: un índice local de artículos
 * REALES (referencia + título + imagen) a partir del SITEMAP PÚBLICO de
 * ferrolan.es (index.php?...sitemap.xml).
 *
 * Por qué existe este script (ver PENDIENTES.md §4.8):
 *  - El API del catálogo de cerámica (studio.ferrolan.es/cataleg/) no tiene
 *    endpoint de listado/búsqueda: solo consulta por código exacto. No hay
 *    forma de "buscar por texto" contra datos reales sin tener antes una
 *    lista de candidatos.
 *  - El sitemap público de la tienda (PrestaShop) SÍ lista, para cada
 *    artículo publicado, su URL (que termina en el mismo código que usa el
 *    API de catálogo, verificado manualmente) y una <image:image> con la
 *    imagen real del producto. No hace falta la webservice key de PrestaShop
 *    (que además solo tiene permiso sobre el recurso `images`, no `products`,
 *    así que no serviría para resolver referencia → id_product de todos modos).
 *
 * Uso: `npm run indice:cataleg` (o `node scripts/generar-indice-cataleg.mjs`).
 * Tarda ~15-30 s (5 ficheros, con pausa entre peticiones por respeto al
 * servidor). En producción lo refresca a diario una tarea programada de Plesk
 * que escribe directamente en el docroot (ver README §Despliegue).
 *
 * La ruta de salida se puede sobreescribir con la variable de entorno
 * `INDICE_CATALEG_SALIDA` (el cron de Plesk la usa para apuntar al
 * `atelier-studio/data/` desplegado, sin tocar el repo). Si el sitemap falla,
 * el script sale con error ANTES de escribir: el índice anterior queda intacto.
 *
 * La salida es un ÍNDICE DE BÚSQUEDA (referencia/título/imagen), no la fuente
 * de verdad de precio ni mides: eso se sigue consultando en vivo por código a
 * `/api/cataleg/` (`enriquecerConCataleg`) al seleccionar un artículo.
 *
 * Formato del JSON: JSON compacto (sin pretty-print) y cada artículo es una
 * TUPLA `[referencia, titulo, imagenUrl]` en vez de un objeto con nombres de
 * campo — con ~33.000 artículos, las claves repetidas eran ~1,1 MB del
 * índice. Quien lo lee es `fuenteIndiceCataleg.ts`; si cambia el formato,
 * hay que cambiarlo en los dos sitios.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITEMAP_INDEX = 'https://ferrolan.es/1_index_sitemap.xml';
const USER_AGENT = 'AtelierStudio-indexador/1.0 (herramienta interna Ferrolan; contacto: equipo de eines)';
const ESPERA_ENTRE_PETICIONES_MS = 2000;
const MIN_DIGITOS_REFERENCIA = 4;

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const salida = process.env.INDICE_CATALEG_SALIDA
  ? path.resolve(process.env.INDICE_CATALEG_SALIDA)
  : path.join(raiz, 'public', 'data', 'indice-cataleg.json');

async function obtenerTexto(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** Extrae el contenido de `<tag><![CDATA[...]]></tag>` (o `<tag>...</tag>` sin CDATA). */
function extraerTag(bloque, tag) {
  const conCdata = bloque.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (conCdata) return conCdata[1];
  const sinCdata = bloque.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return sinCdata ? sinCdata[1] : null;
}

/** El código de artículo va al final del último tramo de la URL (verificado contra el API real). */
function referenciaDeUrl(url) {
  const ultimoTramo = url.split('/').pop() ?? '';
  const m = ultimoTramo.match(new RegExp(`-(\\d{${MIN_DIGITOS_REFERENCIA},})$`));
  return m ? m[1] : null;
}

/**
 * El sitemap publica la miniatura `-large_default` de PrestaShop; nosotros queremos
 * la imagen ORIGINAL (misma URL sin el sufijo de tamaño: `/<id>-large_default/…` → `/<id>/…`).
 */
function imagenOriginal(url) {
  return url.replace(/(\d+)-large_default\//, '$1/');
}

/** Un `<url>...</url>` por artículo/página; solo interesan los que tienen `<image:image>`. */
function extraerArticulos(xml) {
  const articulos = new Map();
  const bloques = xml.split('<url>').slice(1);
  for (const bloque of bloques) {
    const loc = extraerTag(bloque, 'loc');
    if (!loc) continue;
    const referencia = referenciaDeUrl(loc);
    if (!referencia) continue; // páginas estáticas/categoría: sin código, se ignoran
    const imagenBloque = bloque.match(/<image:image>([\s\S]*?)<\/image:image>/);
    if (!imagenBloque) continue; // artículo sin imagen publicada en la web
    const imagenUrl = extraerTag(imagenBloque[1], 'image:loc');
    if (!imagenUrl) continue;
    if (articulos.has(referencia)) continue; // ya visto (duplicados en el propio sitemap)
    const titulo = extraerTag(imagenBloque[1], 'image:title') ?? '';
    articulos.set(referencia, { referencia, titulo, imagenUrl: imagenOriginal(imagenUrl) });
  }
  return articulos;
}

/**
 * Palabras que ocultan un artículo por título (mosaicos y rodapiés,
 * `public/config/catalogo.json`). Es la MISMA regla que aplica el buscador en
 * vivo (`crearPredicadoTituloOculto` en fuenteIndiceCataleg.ts): comparación
 * normalizada (minúsculas, sin diacríticos) por contenido — «RODAPIE» cubre
 * «RODAPIÉ …» y erratas tipo «RODAPIÉTREVERK…». Si cambia, hay que cambiarla
 * en los dos sitios. Sin el JSON de config no se excluye nada.
 */
async function cargarPatronesTituloOcultos() {
  try {
    const config = JSON.parse(
      await readFile(path.join(raiz, 'public', 'config', 'catalogo.json'), 'utf8'),
    );
    const normalizar = (t) =>
      t
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    const palabras = (config.palabrasTituloOcultas ?? [])
      .map((p) => normalizar(String(p).trim()))
      .filter((p) => p.length > 0);
    if (palabras.length === 0) return () => false;
    return (titulo) => palabras.some((p) => normalizar(titulo).includes(p));
  } catch {
    return () => false;
  }
}

async function main() {
  console.log(`Descargando índice de sitemaps: ${SITEMAP_INDEX}`);
  const indiceXml = await obtenerTexto(SITEMAP_INDEX);
  const subSitemaps = [...indiceXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (subSitemaps.length === 0) {
    throw new Error('El índice de sitemaps no tiene entradas <loc>; ¿ha cambiado el formato?');
  }
  console.log(`${subSitemaps.length} sitemaps a procesar.`);

  const articulos = new Map();
  for (const url of subSitemaps) {
    console.log(`Descargando ${url}…`);
    const xml = await obtenerTexto(url);
    const encontrados = extraerArticulos(xml);
    for (const [referencia, datos] of encontrados) {
      if (!articulos.has(referencia)) articulos.set(referencia, datos);
    }
    console.log(`  ${encontrados.size} artículos con imagen (${articulos.size} acumulados en total)`);
    await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_PETICIONES_MS));
  }

  await mkdir(path.dirname(salida), { recursive: true });
  let lista = [...articulos.values()];
  const tituloOculto = await cargarPatronesTituloOcultos();
  const antes = lista.length;
  lista = lista.filter((a) => !tituloOculto(a.titulo));
  if (antes !== lista.length) {
    console.log(`Excluidos ${antes - lista.length} artículos por título oculto (config/catalogo.json).`);
  }
  const contenido = {
    _aviso:
      'GENERADO por scripts/generar-indice-cataleg.mjs a partir del sitemap público de ' +
      'ferrolan.es (no editar a mano). Es un ÍNDICE DE BÚSQUEDA (referencia/título/imagen); ' +
      'el precio y las mides se consultan en vivo por código a /api/cataleg/ al seleccionar. ' +
      'Cada artículo es una tupla [referencia, titulo, imagenUrl] (sin nombres de campo, ' +
      'para que el índice pese menos).',
    generadoEn: new Date().toISOString(),
    articulos: lista.map((a) => [a.referencia, a.titulo, a.imagenUrl]),
  };
  await writeFile(salida, JSON.stringify(contenido), 'utf8');
  console.log(`\nEscrito ${salida} con ${contenido.articulos.length} artículos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
