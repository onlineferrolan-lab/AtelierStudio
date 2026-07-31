#!/usr/bin/env node
/**
 * Genera `public/config/margenes.json` a partir del CSV de subfamilias que
 * entrega el ERP (`marge-subfami.csv`).
 *
 * Uso: `npm run margenes -- <ruta del csv>`
 *      (sin ruta usa `datos-fuente/marge-subfami.csv`)
 *
 * FORMATO DEL CSV (`;` como separador, codificado en cp1252 — trae Ñ y acentos
 * de Windows, NO es UTF-8):
 *
 *     CODIGO;NOMBRE;ACTIVA;MTP;MTC
 *     9411;CASA INFINITA;T;66;66
 *
 *  - CODIGO: subfamilia de 4 dígitos. Es el PREFIJO de la referencia del
 *    artículo: la referencia 94111301 pertenece a la subfamilia 9411
 *    (verificado contra el índice real: casa el 98,3 % de los 28.732
 *    artículos, y los nombres cuadran — 9411 CASA INFINITA son los KHAN,
 *    7735 BALDOCER los DUCALE, 9375 PERONDA…).
 *  - MTP: margen PVP. MTC: margen contratista. En PUNTOS PORCENTUALES, con
 *    coma decimal (44,93). En las 726 filas MTP ≥ MTC.
 *
 * SON MÁRGENES SOBRE COSTE (markup), no sobre precio de venta:
 * `precio = coste × (1 + m/100)`. Se deduce del propio dato — 77 subfamilias
 * tienen MTP ≥ 100 y llegan hasta 200, y un margen sobre precio de venta del
 * 100 % sería una división por cero.
 *
 * La salida guarda los márgenes en CENTÉSIMAS DE PUNTO ENTERAS (44,93 % → 4493)
 * para que el motor no toque floats: ver `src/domain/engine/margen.ts`.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entrada = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(raiz, 'datos-fuente', 'marge-subfami.csv');
const salida = path.join(raiz, 'public', 'config', 'margenes.json');

/** El CSV del ERP viene en cp1252, no en UTF-8: decodificar mal parte los nombres. */
function decodificarCp1252(bytes) {
  return new TextDecoder('windows-1252').decode(bytes);
}

/** «44,93» → 4493 centésimas de punto. Devuelve null si no es un número. */
function aCentesimas(texto) {
  const limpio = (texto ?? '').trim().replace(',', '.');
  if (limpio === '') return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

async function main() {
  const bytes = await readFile(entrada);
  const texto = decodificarCp1252(bytes);
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const cabecera = lineas[0].split(';').map((c) => c.trim().toUpperCase());
  const columnas = ['CODIGO', 'NOMBRE', 'ACTIVA', 'MTP', 'MTC'];
  for (const c of columnas) {
    if (!cabecera.includes(c)) {
      throw new Error(`El CSV no tiene la columna '${c}'. Cabecera: ${cabecera.join(';')}`);
    }
  }
  const indice = Object.fromEntries(columnas.map((c) => [c, cabecera.indexOf(c)]));

  const subfamilias = {};
  const problemas = [];
  let inactivas = 0;

  for (const linea of lineas.slice(1)) {
    const campos = linea.split(';');
    const codigo = (campos[indice.CODIGO] ?? '').trim();
    const nombre = (campos[indice.NOMBRE] ?? '').trim();
    const activa = (campos[indice.ACTIVA] ?? '').trim().toUpperCase();
    const mtp = aCentesimas(campos[indice.MTP]);
    const mtc = aCentesimas(campos[indice.MTC]);

    if (!/^\d{4}$/.test(codigo)) {
      problemas.push(`código no válido: '${codigo}'`);
      continue;
    }
    // Las inactivas se omiten: si el ERP la ha dado de baja, no debe cotizarse
    // con su margen sin que nadie lo revise.
    if (activa !== 'T') {
      inactivas += 1;
      continue;
    }
    if (mtp === null || mtc === null) {
      problemas.push(`subfamilia ${codigo}: MTP o MTC no numéricos`);
      continue;
    }
    if (subfamilias[codigo]) {
      problemas.push(`subfamilia ${codigo} duplicada`);
      continue;
    }
    subfamilias[codigo] = { nombre, pvp: mtp, contratista: mtc };
  }

  if (problemas.length > 0) {
    throw new Error(`El CSV tiene ${problemas.length} problemas:\n- ${problemas.join('\n- ')}`);
  }

  const contenido = {
    _aviso:
      'GENERADO por scripts/generar-margenes.mjs a partir del CSV de subfamilias del ERP ' +
      '(no editar a mano). La clave es la subfamilia: los 4 PRIMEROS DÍGITOS de la ' +
      'referencia del artículo. Los márgenes van en CENTÉSIMAS DE PUNTO enteras ' +
      '(44,93 % = 4493) y son márgenes SOBRE COSTE: precio = coste × (1 + m/100).',
    generadoEn: new Date().toISOString(),
    longitudSubfamilia: 4,
    subfamilias,
  };

  await mkdir(path.dirname(salida), { recursive: true });
  await writeFile(salida, JSON.stringify(contenido), 'utf8');

  const total = Object.keys(subfamilias).length;
  console.log(`Escrito ${salida}`);
  console.log(`  subfamilias activas: ${total}${inactivas ? ` (omitidas ${inactivas} inactivas)` : ''}`);
}

const rutaEjecutada = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (rutaEjecutada && rutaEjecutada === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
