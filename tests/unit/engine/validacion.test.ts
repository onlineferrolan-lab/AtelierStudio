/**
 * Tests de validación de medidas crudas (texto en cm → mm enteros), §1.③:
 * mensajes concretos por medida, coma o punto decimal, mínimos/máximos/opciones.
 */

import { figuraPorId, validarMedidasCrudas } from '../../../src/domain/engine';
import type { Figura } from '../../../src/domain/config';
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
    const rodapie = figura('rodapie-no-estandar');
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

describe('validarMedidasCrudas — máximo y opciones (rodapié estándar)', () => {
  const rodapie = figura('rodapie-estandar');

  it('altura por encima del máximo → mensaje concreto', () => {
    const r = validarMedidasCrudas(rodapie, { longitud: '100', altura: '9' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0].mensaje).toBe(
        'La medida «Altura» no puede ser mayor que 8 cm (indicado: 9 cm).',
      );
    }
  });

  it('altura entre opciones no permitida → lista las opciones admitidas', () => {
    const r = validarMedidasCrudas(rodapie, { longitud: '100', altura: '7,5' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0].mensaje).toBe(
        'La medida «Altura» solo admite 7,2 u 8 cm (indicado: 7,5 cm).',
      );
    }
  });

  it('altura por debajo del mínimo (7,2 cm)', () => {
    const r = validarMedidasCrudas(rodapie, { longitud: '100', altura: '7' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores[0].mensaje).toBe(
        'La medida «Altura» no puede ser menor que 7,2 cm (indicado: 7 cm).',
      );
    }
  });

  it.each(['7,2', '8'])('altura %s cm es válida', (altura) => {
    const r = validarMedidasCrudas(rodapie, { longitud: '100', altura });
    expect(r.ok).toBe(true);
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
