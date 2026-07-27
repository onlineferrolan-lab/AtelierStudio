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
 * servidor). Se recomienda volver a ejecutarlo periódicamente (el catálogo
 * cambia; no hay automatismo todavía, ver PENDIENTES.md).
 *
 * La salida es un ÍNDICE DE BÚSQUEDA (referencia/título/imagen), no la fuente
 * de verdad de precio ni mides: eso se sigue consultando en vivo por código a
 * `/api/cataleg/` (`enriquecerConCataleg`) al seleccionar un artículo.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITEMAP_INDEX = 'https://ferrolan.es/1_index_sitemap.xml';
const USER_AGENT = 'AtelierStudio-indexador/1.0 (herramienta interna Ferrolan; contacto: equipo de eines)';
const ESPERA_ENTRE_PETICIONES_MS = 2000;
const MIN_DIGITOS_REFERENCIA = 4;

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const salida = path.join(raiz, 'public', 'data', 'indice-cataleg.json');

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
    articulos.set(referencia, { referencia, titulo, imagenUrl });
  }
  return articulos;
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
  const contenido = {
    _aviso:
      'GENERADO por scripts/generar-indice-cataleg.mjs a partir del sitemap público de ' +
      'ferrolan.es (no editar a mano). Es un ÍNDICE DE BÚSQUEDA (referencia/título/imagen); ' +
      'el precio y las mides se consultan en vivo por código a /api/cataleg/ al seleccionar.',
    generadoEn: new Date().toISOString(),
    articulos: [...articulos.values()],
  };
  await writeFile(salida, JSON.stringify(contenido), 'utf8');
  console.log(`\nEscrito ${salida} con ${contenido.articulos.length} artículos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
