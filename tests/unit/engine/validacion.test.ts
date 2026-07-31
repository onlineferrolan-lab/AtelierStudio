/**
 * Tests de validación de medidas crudas (texto en cm → mm enteros), §1.③:
 * mensajes concretos por medida, coma o punto decimal, mínimos/máximos/opciones.
 */

import {
  figuraPorId,
  largoCmPorMetros,
  validarMedidasCrudas,
  validarMedidasPorMetros,
} from '../../../src/domain/engine';
import { comprobarCampoMm } from '../../../src/domain/engine/validacion';
import type { CampoMedida, Figura } from '../../../src/domain/config';
import { mm } from '../../../src/domain/units';
import { cargarConfigReal } from './util';

const config = cargarConfigReal();

function figura(id: string): Figura {
  const f = figuraPorId(config, id);
  if (!f) throw new Error(`Figura '${id}' no encontrada en la configuración de pruebas`);
  return f;
}

describe('validarMedidasCrudas — conversión a mm', () => {
  const f1 = figura('figura-1');

  it('convierte cm a mm enteros (coma o punto decimal)', () => {
    const r = validarMedidasCrudas(f1, { longitud: '120,5', fondo: '30', alturaFrontal: '4.5' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.medidasMm).toEqual({ longitud: 1205, fondo: 300, alturaFrontal: 45 });
    }
  });

  it('acepta enteros y redondea a mm (7,15 cm → 72 mm)', () => {
    const rodapie = figura('rodapie-medida-romado');
    const r = validarMedidasCrudas(rodapie, { longitud: '100', altura: '7,15' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['altura']).toBe(72);
  });

  it('recorta espacios alrededor del valor', () => {
    const r = validarMedidasCrudas(f1, { longitud: '  50 ', fondo: '30', alturaFrontal: '4' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['longitud']).toBe(500);
  });
});

describe('validarMedidasCrudas — errores concretos por medida', () => {
  const f1 = figura('figura-1');

  it('medida ausente o vacía → obligatoria, un error por cada una', () => {
    const r = validarMedidasCrudas(f1, { longitud: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toHaveLength(3);
      // Los errores salen en el orden en que la figura declara sus medidas
      // (figuras.json): primero el ancho, después el largo.
      expect(r.errores.map((e) => e.medida)).toEqual(['fondo', 'longitud', 'alturaFrontal']);
      for (const e of r.errores) {
        expect(e.paso).toBe('medidas');
        expect(e.mensaje).toMatch(/es obligatoria/);
      }
      expect(r.errores[0].mensaje).toContain('«Ancho»');
    }
  });

  it('valor no numérico → mensaje con el texto tecleado y la medida', () => {
    const r = validarMedidasCrudas(f1, { longitud: 'abc', fondo: '12a', alturaFrontal: '4' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toHaveLength(2);
      // Mismo orden de declaración: el ancho ('12a') antes que el largo ('abc').
      expect(r.errores[0].mensaje).toContain('«12a»');
      expect(r.errores[0].mensaje).toContain('«Ancho»');
      expect(r.errores[0].mensaje).toMatch(/no es un número válido/);
      expect(r.errores[1].mensaje).toContain('«abc»');
      expect(r.errores[1].mensaje).toContain('«Largo»');
    }
  });

  it('doble coma o doble punto → no numérico', () => {
    const r = validarMedidasCrudas(f1, { longitud: '1,2,3', fondo: '3.0.1', alturaFrontal: '4' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toHaveLength(2);
  });

  it('por debajo del mínimo → mensaje con mínimo y valor indicado', () => {
    const r = validarMedidasCrudas(f1, { longitud: '0,5', fondo: '30', alturaFrontal: '4' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toHaveLength(1);
      expect(r.errores[0].medida).toBe('longitud');
      expect(r.errores[0].mensaje).toBe(
        'La medida «Largo» no puede ser menor que 1 cm (indicado: 0,5 cm).',
      );
    }
  });

  it('cero y negativos caen por el mínimo', () => {
    const r = validarMedidasCrudas(f1, { longitud: '0', fondo: '-2', alturaFrontal: '4' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toHaveLength(2);
      expect(r.errores[0].mensaje).toMatch(/no puede ser menor que 1 cm/);
    }
  });
});

describe('validarMedidasCrudas — máximo y opciones', () => {
  // Desde 2026-07-31 ninguna figura del catálogo usa `opcionesCm` (la altura de
  // los rodapiés dejó de ser una elección y pasó a ir en el nombre), así que
  // estos dos límites se comprueban sobre el campo directamente para que la
  // regla no se quede sin test al no quedar figura que la ejerza.
  const altura: CampoMedida = {
    id: 'altura',
    etiqueta: 'Altura (cm)',
    minCm: 7.2,
    maxCm: 8,
    opcionesCm: [7.2, 8],
    valorFijoCm: null,
  };

  it('por encima del máximo → mensaje concreto', () => {
    expect(comprobarCampoMm(altura, mm(90), 9)).toBe(
      'La medida «Altura» no puede ser mayor que 8 cm (indicado: 9 cm).',
    );
  });

  it('valor fuera de las opciones → lista las opciones admitidas', () => {
    expect(comprobarCampoMm(altura, mm(75), 7.5)).toBe(
      'La medida «Altura» solo admite 7,2 u 8 cm (indicado: 7,5 cm).',
    );
  });

  it('por debajo del mínimo (7,2 cm)', () => {
    expect(comprobarCampoMm(altura, mm(70), 7)).toBe(
      'La medida «Altura» no puede ser menor que 7,2 cm (indicado: 7 cm).',
    );
  });

  it.each([72, 80])('%i mm es válido', (valor) => {
    expect(comprobarCampoMm(altura, mm(valor), valor / 10)).toBeNull();
  });
});

describe('validarMedidasCrudas — medida fija por la figura (rodapiés de 7,2 y de 8)', () => {
  it('la altura no se teclea y aun así sale en mm', () => {
    const r = validarMedidasCrudas(figura('rodapie-72-recto'), { longitud: '100' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm).toEqual({ longitud: 1000, altura: 72 });
  });

  it('cada altura es la de su figura', () => {
    const r = validarMedidasCrudas(figura('rodapie-8-romado'), { longitud: '100' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['altura']).toBe(80);
  });

  it('lo que se teclee en una medida fija se ignora: manda la figura', () => {
    const r = validarMedidasCrudas(figura('rodapie-72-microbiselado'), {
      longitud: '100',
      altura: '25',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['altura']).toBe(72);
  });

  it('la altura sigue siendo libre en los rodapiés a medida', () => {
    const r = validarMedidasCrudas(figura('rodapie-medida-recto'), {
      longitud: '100',
      altura: '25',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['altura']).toBe(250);
  });
});

/**
 * Segundo modo de cálculo de los rodapiés (2026-07-31, indicación directa): el
 * comercial dice cuántos metros quiere y en cuántas unidades, y el largo de cada
 * pieza sale de dividir.
 */
describe('validarMedidasPorMetros — largo deducido de los metros', () => {
  const rodapie = figura('rodapie-medida-romado');

  it('reparte los metros entre las unidades (30 m en 12 ud → 250 cm)', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '30', 12);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm).toEqual({ longitud: 2500, altura: 100 });
  });

  it('una sola unidad se lleva todos los metros', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '2,5', 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['longitud']).toBe(2500);
  });

  it('el largo deducido se redondea a mm enteros como cualquier otra medida', () => {
    // 10 m en 3 unidades = 333,333… cm → 3333 mm.
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '10', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['longitud']).toBe(3333);
  });

  it('metros vacíos → error en el campo «metros», no en el largo', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '  ', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toEqual([
        { paso: 'medidas', medida: 'metros', mensaje: '«Metros» es obligatorio.' },
      ]);
    }
  });

  it('metros no numéricos → mensaje con el texto tecleado', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '3o', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0].medida).toBe('metros');
      expect(r.errores[0].mensaje).toContain('«3o» no es un número válido');
    }
  });

  it('metros ≤ 0 → error concreto', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '0', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0].mensaje).toBe('Los metros tienen que ser mayores que 0.');
  });

  it('si el largo deducido no llega al mínimo, el error explica la cuenta', () => {
    // 0,5 m en 100 unidades = 0,5 cm por pieza, por debajo del mínimo de 1 cm.
    const r = validarMedidasPorMetros(rodapie, { altura: '10' }, '0,5', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0].medida).toBe('metros');
      expect(r.errores[0].mensaje).toBe(
        'Con 0,5 m en 100 unidades cada pieza sale de 0,5 cm de largo. ' +
          'La medida «Largo» no puede ser menor que 1 cm (indicado: 0,5 cm).',
      );
    }
  });

  it('los errores de las demás medidas siguen colgando de su campo', () => {
    const r = validarMedidasPorMetros(rodapie, { altura: '' }, '30', 12);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toEqual([
        { paso: 'medidas', medida: 'altura', mensaje: '«Altura» es obligatoria.' },
      ]);
    }
  });

  it('en las figuras que no se venden por metros no aplica: valida el largo tecleado', () => {
    const f1 = figura('figura-1');
    expect(f1.medidaPorMetros).toBeNull();
    const r = validarMedidasPorMetros(
      f1,
      { longitud: '120', fondo: '30', alturaFrontal: '4' },
      'lo que sea',
      3,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm['longitud']).toBe(1200);
  });

  it('la altura fija de los de 7,2 y 8 también se rellena en este modo', () => {
    const r = validarMedidasPorMetros(figura('rodapie-72-romado'), {}, '30', 12);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.medidasMm).toEqual({ longitud: 2500, altura: 72 });
  });
});

describe('largoCmPorMetros — la cuenta, sin validación alrededor', () => {
  it.each([
    [30, 12, 250],
    [2.5, 1, 250],
    [10, 4, 250],
  ])('%f m en %i unidades → %f cm', (metros, unidades, esperado) => {
    expect(largoCmPorMetros(metros, unidades)).toBeCloseTo(esperado, 6);
  });
});

describe('validarMedidasCrudas — acumulación y campos ajenos', () => {
  it('acumula errores de varias medidas a la vez', () => {
    const f4 = figura('figura-4');
    const r = validarMedidasCrudas(f4, {
      longitud: '0',
      fondo: 'x',
      alturaFrontal: '',
      retorno: '5',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toHaveLength(3);
  });

  it('ignora claves que no son medidas de la figura', () => {
    const romo = figura('peldano-romo');
    const r = validarMedidasCrudas(romo, { longitud: '50', fondo: '30', alturaFrontal: '99' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.medidasMm).sort()).toEqual(['fondo', 'longitud']);
  });
});
