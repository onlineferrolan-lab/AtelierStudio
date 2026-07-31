/**
 * Compactado del campo «imagen» del índice (`src/data/imagenIndice.mjs`).
 *
 * Lo que de verdad protege este fichero son dos cosas:
 *
 *  1. Que la regla de slug reproduce la de PrestaShop. Los casos vienen de URL
 *     REALES del índice, no inventados: los decimales («29,5X120» → `295x120`) y
 *     el `&` («B&W» → `bw`) se comen, no se convierten en guion. Ese detalle es
 *     el que hace que el 94,6 % de las URL sean reconstruibles en vez del 72 %.
 *
 *  2. Que la decisión de compactar solo se toma cuando la reconstrucción sale
 *     EXACTA. Es lo que garantiza que un cambio de regla en PrestaShop engorde
 *     el índice en vez de romper las imágenes del catálogo.
 *
 * El indexador (`scripts/generar-indice-cataleg.mjs`) importa este mismo módulo
 * —es `.mjs` justamente para eso—, así que no hay dos copias que puedan
 * divergir.
 */

import {
  compactarImagen,
  desescaparTitulo,
  slugImagen,
  urlImagenDeIndice,
  urlImagenDesdeId,
} from '../../../src/data/imagenIndice.mjs';

/** Casos tomados de URL reales del índice (referencia, título, URL publicada). */
const REALES: readonly (readonly [string, string, string])[] = [
  [
    '94111301',
    'KHAN WHITE MATE 75X75 RECTIFICADO',
    'https://ferrolan.es/1050852/khan-white-mate-75x75-rectificado-94111301.jpg',
  ],
  // Decimal: «29,5X120» pierde la coma, no la convierte en guion.
  [
    '77356217',
    'DUCALE CEDAR MATE 29,5X120 RECTIFICADO',
    'https://ferrolan.es/1/ducale-cedar-mate-295x120-rectificado-77356217.jpg',
  ],
  [
    '77510273',
    'KAMEN PERLA 33,3X100',
    'https://ferrolan.es/2/kamen-perla-333x100-77510273.jpg',
  ],
  // El & también se come: «B&W» → `bw`.
  [
    '95219661',
    'EQUIPE CAPRICE BALANCE B&W MATE 20X20',
    'https://ferrolan.es/3/equipe-caprice-balance-bw-mate-20x20-95219661.jpg',
  ],
  // Diacríticos fuera.
  [
    '12345678',
    'RODAPIÉ MARFIL 8X60',
    'https://ferrolan.es/4/rodapie-marfil-8x60-12345678.jpg',
  ],
];

describe('slugImagen y reconstrucción de la URL', () => {
  it.each(REALES)('reconstruye la URL real de %s', (referencia, titulo, url) => {
    const id = Number(/ferrolan\.es\/(\d+)\//.exec(url)?.[1]);
    expect(urlImagenDesdeId(id, titulo, referencia)).toBe(url);
  });

  it('se come los decimales y el &, y convierte el resto en guiones', () => {
    expect(slugImagen('DUCALE CEDAR MATE 29,5X120')).toBe('ducale-cedar-mate-295x120');
    expect(slugImagen('EQUIPE B&W MATE')).toBe('equipe-bw-mate');
    expect(slugImagen('RODAPIÉ MARFIL')).toBe('rodapie-marfil');
    expect(slugImagen('  ESPACIOS   RAROS  ')).toBe('espacios-raros');
    expect(slugImagen('60X60 / 30X30')).toBe('60x60-30x30');
  });
});

describe('desescaparTitulo', () => {
  /**
   * Los títulos del sitemap venían DOBLEMENTE escapados: 55 artículos del índice
   * real mostraban «B&amp;amp;W» en pantalla al comercial.
   */
  it('decodifica entidades incluso doblemente escapadas', () => {
    expect(desescaparTitulo('EQUIPE CAPRICE BALANCE B&amp;amp;W MATE 20X20')).toBe(
      'EQUIPE CAPRICE BALANCE B&W MATE 20X20',
    );
    expect(desescaparTitulo('B&amp;W')).toBe('B&W');
    expect(desescaparTitulo('SIN ENTIDADES 60X60')).toBe('SIN ENTIDADES 60X60');
  });

  it('no se cuelga con un texto que parece entidad pero no lo es', () => {
    expect(desescaparTitulo('100 % ALGODÓN & CO')).toBe('100 % ALGODÓN & CO');
  });
});

describe('compactarImagen', () => {
  it('devuelve el id cuando la URL se reconstruye exacta', () => {
    const [referencia, titulo, url] = REALES[0];
    expect(compactarImagen(url, titulo, referencia)).toBe(1050852);
  });

  /**
   * La garantía del formato: si la reconstrucción NO coincide, se guarda la URL
   * completa. Un cambio de regla en PrestaShop engorda el índice; no rompe nada.
   */
  it('devuelve la URL completa cuando no coincide', () => {
    // Caso real: el título dice 100X275 y la URL dice 100x260.
    const url = 'https://ferrolan.es/9/chicago-mocha-shaped-100x260-rectificado-93750503.jpg';
    expect(compactarImagen(url, 'CHICAGO MOCHA SHAPED 100X275 RECTIFICADO', '93750503')).toBe(url);
  });

  it('devuelve la URL completa si no sigue el patrón de imagen de producto', () => {
    // Imágenes de categoría del sitemap real: /c/<id>-category_default/…
    const url = 'https://ferrolan.es/c/19449-category_default/rovira-1880.jpg';
    expect(compactarImagen(url, 'ROVIRA 1880', '19449')).toBe(url);
    expect(compactarImagen('https://otro-dominio.example/x.jpg', 'X', '1')).toBe(
      'https://otro-dominio.example/x.jpg',
    );
  });
});

describe('urlImagenDeIndice', () => {
  it('número → reconstruye; cadena → la usa tal cual', () => {
    const [referencia, titulo, url] = REALES[0];
    expect(urlImagenDeIndice(1050852, titulo, referencia)).toBe(url);
    expect(urlImagenDeIndice('https://ferrolan.es/loquesea.jpg', titulo, referencia)).toBe(
      'https://ferrolan.es/loquesea.jpg',
    );
  });
});
