/**
 * Margen comercial por subfamilia (indicación directa 2026-07-31).
 *
 * Estos tests son el único sitio donde el margen NO es 0: el resto de los tests
 * del motor trabajan a coste a propósito, para que sus importes se lean (ver
 * `util.ts`). Aquí se fija lo que de verdad decide el dinero:
 *
 *  - que es un markup sobre COSTE, no un margen sobre precio de venta;
 *  - que se aplica a material, manipulación (suplementos incluidos) y arranque;
 *  - que las líneas del desglose SUMAN el total, que es la razón de aplicarlo
 *    línea a línea y no sobre el total;
 *  - que sin margen para el artículo NO se cotiza, en vez de colar un 0.
 */

import { calcularCotizacion } from '../../../src/domain/engine';
import {
  aplicarMargen,
  resolverMargen,
  subfamiliaDeMaterial,
  subfamiliaDeNumero,
  subfamiliaDeReferencia,
} from '../../../src/domain/engine/margen';
import { centimos } from '../../../src/domain/money';
import type { Configuracion } from '../../../src/domain/config';
import type { ResultadoCotizacion, SalidaMotor, TablaMargenes } from '../../../src/domain/types';
import { cargarConfigReal, entradaBase, materialErp, materialManual } from './util';

/** Tabla mínima y explícita: dos subfamilias con márgenes distintos. */
const tabla: TablaMargenes = {
  longitudSubfamilia: 4,
  subfamilias: {
    '9411': { nombre: 'CASA INFINITA', pvp: 6600, contratista: 5000 },
    '3203': { nombre: 'MUEBLES COCINA PEDINI', pvp: 4493, contratista: 3768 },
  },
};

const configBase = cargarConfigReal();
const config: Configuracion = { ...configBase, margenes: tabla };

function esperarOk(salida: SalidaMotor): ResultadoCotizacion {
  if (!salida.ok) {
    throw new Error(`Se esperaba ok:true; errores: ${salida.errores.map((e) => e.mensaje).join(' | ')}`);
  }
  return salida.resultado;
}

/** Material del catálogo cuya referencia cae en la subfamilia 9411. */
const materialConMargen = () => materialErp({ referencia: '94110600' });

describe('la subfamilia sale del prefijo de la referencia', () => {
  it('coge los 4 primeros dígitos', () => {
    expect(subfamiliaDeReferencia('94111301', 4)).toBe('9411');
    expect(subfamiliaDeReferencia('77356201', 4)).toBe('7735');
  });

  it('null si la referencia no empieza por 4 dígitos', () => {
    expect(subfamiliaDeReferencia('TEST-6060', 4)).toBeNull();
    expect(subfamiliaDeReferencia('941', 4)).toBeNull();
    expect(subfamiliaDeReferencia('MANUAL-1730000000000', 4)).toBeNull();
  });

  it('el material manual la trae en su campo, con ceros a la izquierda si hace falta', () => {
    expect(subfamiliaDeNumero(9411, 4)).toBe('9411');
    expect(subfamiliaDeNumero(203, 4)).toBe('0203');
    expect(subfamiliaDeNumero(12345, 4)).toBeNull(); // no cabe en 4 dígitos
  });

  it('en el material manual manda el campo, no la referencia MANUAL-…', () => {
    expect(subfamiliaDeMaterial(materialManual({ subfamilia: 3203 }), tabla)).toBe('3203');
    expect(subfamiliaDeMaterial(materialConMargen(), tabla)).toBe('9411');
  });
});

describe('aplicarMargen: markup sobre coste', () => {
  /**
   * Es markup, NO margen sobre precio de venta. Se deduce del propio dato del
   * ERP: hay subfamilias con MTP de 100 y hasta 200, y un margen sobre precio de
   * venta del 100 % sería una división por cero.
   */
  it('multiplica por (1 + m/100)', () => {
    expect(aplicarMargen(centimos(10_000), 6600)).toBe(16_600); // 100 € al 66 % → 166 €
    expect(aplicarMargen(centimos(10_000), 20_000)).toBe(30_000); // 200 % → 300 €
    expect(aplicarMargen(centimos(2500), 4493)).toBe(3623); // 25 € × 1,4493 = 36,2325 → 36,23
  });

  it('un margen de 0 deja el importe intacto', () => {
    expect(aplicarMargen(centimos(12_345), 0)).toBe(12_345);
  });

  it('redondea half-up y devuelve céntimos ENTEROS', () => {
    // 1 céntimo al 50 % = 1,5 → 2 (half-up, no truncado).
    expect(aplicarMargen(centimos(1), 5000)).toBe(2);
    // 3 céntimos al 66 % = 4,98 → 5.
    expect(aplicarMargen(centimos(3), 6600)).toBe(5);
    for (const base of [1, 7, 33, 101, 9999]) {
      for (const m of [1700, 4493, 6600, 20_000]) {
        expect(Number.isInteger(aplicarMargen(centimos(base), m))).toBe(true);
      }
    }
  });
});

describe('resolverMargen', () => {
  it('coge el de la tabla según el tipo elegido', () => {
    const pvp = resolverMargen(materialConMargen(), tabla, 'pvp', null);
    const contratista = resolverMargen(materialConMargen(), tabla, 'contratista', null);
    expect(pvp.ok && pvp.margen.centesimas).toBe(6600);
    expect(contratista.ok && contratista.margen.centesimas).toBe(5000);
    expect(pvp.ok && pvp.margen.nombreSubfamilia).toBe('CASA INFINITA');
    expect(pvp.ok && pvp.margen.manual).toBe(false);
  });

  it('el margen a mano MANDA sobre el de la tabla', () => {
    const r = resolverMargen(materialConMargen(), tabla, 'pvp', 1000);
    expect(r.ok && r.margen.centesimas).toBe(1000);
    expect(r.ok && r.margen.manual).toBe(true);
  });

  /** La regla que impide facturar sin margen sin que nadie se entere. */
  it('sin margen en la tabla y sin margen a mano: NO resuelve', () => {
    const fuera = materialErp({ referencia: '25110001' }); // subfamilia real que no está
    const r = resolverMargen(fuera, tabla, 'pvp', null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.subfamilia).toBe('2511');
  });
});

describe('la cotización aplica el margen a TODO lo que se factura', () => {
  /**
   * Mismo caso con margen 0 y con el 66 %, para poder comparar. Figura 2 de
   * 50×30×4, 5 piezas, merma 10 %, con los dos suplementos.
   */
  const conSuplementos = {
    material: materialConMargen(),
    suplementos: ['angular-f14', 'ranuras-f14'],
    unidadesSuplemento: { 'angular-f14': 2 },
  };
  const aCoste = esperarOk(
    calcularCotizacion(entradaBase({ ...conSuplementos, margenManualCentesimas: 0 }), config),
  );
  const conMargen = esperarOk(
    calcularCotizacion(entradaBase({ ...conSuplementos, margenManualCentesimas: null }), config),
  );

  it('el margen aplicado queda registrado en el resultado', () => {
    expect(conMargen.margen).toEqual({
      tipo: 'pvp',
      centesimas: 6600,
      subfamilia: '9411',
      nombreSubfamilia: 'CASA INFINITA',
      manual: false,
    });
  });

  it('material, manipulación y arranque llevan el markup', () => {
    const m = (c: number) => aplicarMargen(centimos(c), 6600);
    expect(conMargen.desglose.materialCentimos).toBe(m(aCoste.desglose.materialCentimos));
    expect(conMargen.desglose.arranqueCentimos).toBe(m(aCoste.desglose.arranqueCentimos));
    // 60 € de arranque al 66 % son 99,60 €.
    expect(conMargen.desglose.arranqueCentimos).toBe(9960);
  });

  it('cada línea de manipulación lleva el markup, suplementos incluidos', () => {
    expect(conMargen.lineasManipulacion).toHaveLength(aCoste.lineasManipulacion.length);
    for (const [i, linea] of conMargen.lineasManipulacion.entries()) {
      expect(linea.concepto).toBe(aCoste.lineasManipulacion[i].concepto);
      expect(linea.centimos).toBe(aplicarMargen(aCoste.lineasManipulacion[i].centimos, 6600));
    }
  });

  /**
   * La razón de aplicarlo línea a línea: el desglose que se ve en pantalla y en
   * la orden de trabajo tiene que cuadrar. Si el margen se aplicara al total, la
   * suma de las líneas no daría el subtotal de manipulación.
   */
  it('las líneas SUMAN el subtotal de manipulación, y las partes el total', () => {
    const suma = conMargen.lineasManipulacion.reduce((t, l) => t + l.centimos, 0);
    expect(suma).toBe(conMargen.desglose.manipulacionCentimos);
    expect(
      conMargen.desglose.materialCentimos +
        conMargen.desglose.manipulacionCentimos +
        conMargen.desglose.arranqueCentimos,
    ).toBe(conMargen.desglose.totalSinIvaCentimos);
    expect(
      conMargen.desglose.totalSinIvaCentimos + conMargen.desglose.ivaCentimos,
    ).toBe(conMargen.desglose.totalConIvaCentimos);
  });

  it('el de contratista sale más barato que el de PVP', () => {
    const contratista = esperarOk(
      calcularCotizacion(
        entradaBase({ ...conSuplementos, margenManualCentesimas: null, tipoMargen: 'contratista' }),
        config,
      ),
    );
    expect(contratista.margen.centesimas).toBe(5000);
    expect(contratista.desglose.totalConIvaCentimos).toBeLessThan(
      conMargen.desglose.totalConIvaCentimos,
    );
  });

  /** El precio editado a mano es COSTE: el margen va encima (indicación directa). */
  it('el precio de material editado también lleva margen encima', () => {
    const editado = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialConMargen(),
          precioMaterialEditado: centimos(3000),
          margenManualCentesimas: null,
        }),
        config,
      ),
    );
    const sinMargen = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialConMargen(),
          precioMaterialEditado: centimos(3000),
          margenManualCentesimas: 0,
        }),
        config,
      ),
    );
    expect(editado.desglose.materialCentimos).toBe(
      aplicarMargen(sinMargen.desglose.materialCentimos, 6600),
    );
  });

  it('todos los importes siguen siendo céntimos ENTEROS', () => {
    for (const v of Object.values(conMargen.desglose)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

/**
 * Contra la tabla REAL de `public/config/margenes.json` (726 subfamilias). Si
 * alguien regenera el fichero desde un CSV cambiado o con otra codificación,
 * estos tests lo cazan: comprueban subfamilias concretas del catálogo real y sus
 * márgenes tal como los entregó el ERP.
 */
describe('tabla real de márgenes', () => {
  const real = configBase.margenes;

  it('trae las 726 subfamilias con clave de 4 dígitos', () => {
    expect(real.longitudSubfamilia).toBe(4);
    expect(Object.keys(real.subfamilias)).toHaveLength(726);
    expect(Object.keys(real.subfamilias).every((c) => /^\d{4}$/.test(c))).toBe(true);
  });

  it('resuelve las subfamilias cerámicas que usa el catálogo real', () => {
    // Comprobados uno a uno contra el CSV del ERP.
    expect(real.subfamilias['9411']).toEqual({ nombre: 'CASA INFINITA', pvp: 6600, contratista: 6600 });
    expect(real.subfamilias['9375']).toEqual({ nombre: 'PERONDA', pvp: 6600, contratista: 6600 });
    expect(real.subfamilias['9341']).toEqual({ nombre: 'NATUCER', pvp: 6600, contratista: 6600 });
  });

  it('conserva los decimales y los acentos del CSV', () => {
    // 44,93 % → 4493 centésimas; 37,68 % → 3768.
    expect(real.subfamilias['3203']).toEqual({
      nombre: 'MUEBLES COCINA PEDINI',
      pvp: 4493,
      contratista: 3768,
    });
    const conEnye = Object.values(real.subfamilias).filter((s) => /[ÑÁÉÍÓÚñ]/.test(s.nombre));
    expect(conEnye.length).toBeGreaterThan(0); // si se leyera como UTF-8, saldría «Ã‘»
    expect(Object.values(real.subfamilias).some((s) => s.nombre.includes('Ã'))).toBe(false);
  });

  it('MTC nunca es mayor que MTP: el contratista no paga más que el público', () => {
    for (const [codigo, s] of Object.entries(real.subfamilias)) {
      expect(s.contratista, `subfamilia ${codigo}`).toBeLessThanOrEqual(s.pvp);
    }
  });

  it('cotiza un artículo real de principio a fin con su margen de tabla', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialErp({ referencia: '94111301' }), // KHAN, subfamilia 9411
          margenManualCentesimas: null,
        }),
        configBase,
      ),
    );
    expect(r.margen.subfamilia).toBe('9411');
    expect(r.margen.nombreSubfamilia).toBe('CASA INFINITA');
    expect(r.margen.centesimas).toBe(6600);
    // Arranque de 60 € al 66 % = 99,60 €.
    expect(r.desglose.arranqueCentimos).toBe(9960);
  });
});

describe('sin margen no se cotiza', () => {
  it('da un error que dice qué falta y dónde ponerlo', () => {
    const salida = calcularCotizacion(
      entradaBase({ material: materialErp({ referencia: '25110001' }), margenManualCentesimas: null }),
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    const mensaje = salida.errores.map((e) => e.mensaje).join(' ');
    expect(mensaje).toMatch(/2511/);
    expect(mensaje).toMatch(/Par[áa]metros avanzados/);
    expect(salida.errores[0].paso).toBe('material');
  });

  it('con el margen a mano ya cotiza', () => {
    const salida = calcularCotizacion(
      entradaBase({ material: materialErp({ referencia: '25110001' }), margenManualCentesimas: 3000 }),
      config,
    );
    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.resultado.margen.manual).toBe(true);
    expect(salida.resultado.margen.centesimas).toBe(3000);
  });
});
