/**
 * Adjuntos de la orden: qué archivo se acepta, cuál viaja dentro del PDF y cómo
 * se lee del selector. Los mensajes de error se comprueban literales porque se
 * pintan tal cual en el paso de comentarios.
 */

import {
  MAX_ADJUNTOS,
  MAX_BYTES_ADJUNTO,
  errorDeArchivo,
  formatearTamano,
  leerArchivoComoAdjunto,
  seIncrustaEnPdf,
  type AdjuntoOrden,
} from '../../../src/orden/adjuntos';

function adjunto(tipoMime: string): AdjuntoOrden {
  return { id: 'a1', nombre: 'x', tipoMime, bytes: 10, dataUrl: 'data:,' };
}

describe('seIncrustaEnPdf', () => {
  it('acepta los formatos que jsPDF incrusta sin canvas', () => {
    expect(seIncrustaEnPdf(adjunto('image/png'))).toBe(true);
    expect(seIncrustaEnPdf(adjunto('image/jpeg'))).toBe(true);
    expect(seIncrustaEnPdf(adjunto('image/webp'))).toBe(true);
    // El navegador puede declarar el tipo en mayúsculas.
    expect(seIncrustaEnPdf(adjunto('IMAGE/PNG'))).toBe(true);
  });

  /**
   * Lo que no es imagen incrustable se cita por nombre en la hoja: jsPDF no
   * fusiona documentos, y GIF/BMP/SVG necesitarían canvas (no hay en jsdom, y en
   * el navegador daría problemas de tamaño).
   */
  it('rechaza documentos y formatos de imagen que no se pueden incrustar', () => {
    expect(seIncrustaEnPdf(adjunto('application/pdf'))).toBe(false);
    expect(seIncrustaEnPdf(adjunto('image/gif'))).toBe(false);
    expect(seIncrustaEnPdf(adjunto('image/svg+xml'))).toBe(false);
    expect(seIncrustaEnPdf(adjunto('image/heic'))).toBe(false);
    // Archivo sin extensión conocida: el navegador no declara tipo.
    expect(seIncrustaEnPdf(adjunto(''))).toBe(false);
  });
});

describe('formatearTamano', () => {
  it('usa B, kB y MB con decimales es-ES', () => {
    expect(formatearTamano(842)).toBe('842 B');
    expect(formatearTamano(1024)).toBe('1 kB');
    expect(formatearTamano(32_154)).toBe('31,4 kB');
    expect(formatearTamano(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('errorDeArchivo', () => {
  it('acepta un archivo normal', () => {
    expect(errorDeArchivo({ name: 'plano.png', size: 120_000 }, 0)).toBeNull();
    expect(errorDeArchivo({ name: 'plano.png', size: MAX_BYTES_ADJUNTO }, MAX_ADJUNTOS - 1)).toBeNull();
  });

  it('rechaza cuando ya hay el máximo de documentos', () => {
    expect(errorDeArchivo({ name: 'plano.png', size: 100 }, MAX_ADJUNTOS)).toBe(
      'Solo se pueden adjuntar 6 documentos por orden.',
    );
  });

  it('rechaza el archivo vacío (arrastrar una carpeta, un archivo a medio copiar)', () => {
    expect(errorDeArchivo({ name: 'vacio.png', size: 0 }, 0)).toBe('«vacio.png» está vacío.');
  });

  it('rechaza el archivo que pasa del tope, diciendo cuánto pesa y cuál es el máximo', () => {
    expect(errorDeArchivo({ name: 'foto.jpg', size: 6 * 1024 * 1024 }, 0)).toBe(
      '«foto.jpg» pesa 6 MB; el máximo por documento es 5 MB.',
    );
  });
});

describe('leerArchivoComoAdjunto', () => {
  it('devuelve nombre, tipo, tamaño y el contenido como data URL', async () => {
    const archivo = new File([new Uint8Array([1, 2, 3, 4])], 'plano.png', { type: 'image/png' });
    const leido = await leerArchivoComoAdjunto(archivo);

    expect(leido.nombre).toBe('plano.png');
    expect(leido.tipoMime).toBe('image/png');
    expect(leido.bytes).toBe(4);
    expect(leido.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(seIncrustaEnPdf(leido)).toBe(true);
  });

  /**
   * Dos archivos con el MISMO nombre (el mismo `foto.jpg` de dos carpetas) tienen
   * que poder distinguirse: si compartieran id, quitar uno quitaría los dos.
   */
  it('da un id distinto a cada archivo, aunque se llamen igual', async () => {
    const uno = await leerArchivoComoAdjunto(new File(['a'], 'foto.jpg', { type: 'image/jpeg' }));
    const otro = await leerArchivoComoAdjunto(new File(['b'], 'foto.jpg', { type: 'image/jpeg' }));
    expect(uno.id).not.toBe(otro.id);
  });
});
