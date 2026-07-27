/**
 * Tests integrales de calcularCotizacion contra la configuración real
 * (tarifas del PDF §2, parámetros PROVISIONALES de taller): tarifas por figura,
 * suplementos, ocupación, merma, stock/pedido, material manual, override de
 * precio, arranque único, IVA, determinismo y ausencia de floats.
 *
 * Parámetros de config usados: disco 3 mm, tolerancia 2 mm, saneado 5 mm/lado,
 * arranque 60 € (6000 céntimos), IVA 21 %.
 */

import { calcularCotizacion } from '../../../src/domain/engine';
import type { Mm, ResultadoCotizacion, SalidaMotor } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
import { centimos } from '../../../src/domain/money';
import { cargarConfigReal, entradaBase, materialErp, materialManual } from './util';

const config = cargarConfigReal();

function esperarOk(salida: SalidaMotor): ResultadoCotizacion {
  if (!salida.ok) {
    throw new Error(
      `Se esperaba ok:true; errores: ${salida.errores.map((e) => e.mensaje).join(' | ')}`,
    );
  }
  return salida.resultado;
}

function esperarErrores(salida: SalidaMotor): readonly string[] {
  if (salida.ok) throw new Error('Se esperaba ok:false');
  return salida.errores.map((e) => e.mensaje);
}

const medidasF2 = { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) };

describe('calcularCotizacion — caso base (Figura 2, stock)', () => {
  const r = esperarOk(calcularCotizacion(entradaBase(), config));

  it('componentes de UNA pieza desde la receta', () => {
    expect(r.componentes).toEqual([
      { id: 'tapa', largoMm: 500, anchoMm: 300 },
      { id: 'frontal', largoMm: 500, anchoMm: 40 },
    ]);
  });

  it('ocupación §4: 300+40 + 1 corte×3 + 2×5 saneado + 2 tolerancia = 355 mm', () => {
    expect(r.ocupacion).toEqual({
      ocupacionMm: 355,
      dimensionUtilMm: 600,
      numCortes: 1,
      baldosaGirada: false,
    });
  });

  it('baldosas = cantidad (veta §4) y merma con ceil: 5 × 1,10 → 6', () => {
    expect(r.baldosasNecesarias).toBe(5);
    expect(r.baldosasConMerma).toBe(6);
  });

  it('stock → se factura por piezas, sin cajas', () => {
    expect(r.unidadesFacturadas).toBe(6);
    expect(r.cajasFacturadas).toBe(0);
    expect(r.m2Facturados).toBe(2.16); // 6 × 0,36 m²
  });

  it('desglose completo con IVA 21 % (171,50 € → 36,02 € half-up → 207,52 €)', () => {
    expect(r.desglose).toEqual({
      materialCentimos: 5400, // 2,16 m² × 25 €/m²
      manipulacionCentimos: 5750, // 50 cm × 0,23 €/cm × 5
      arranqueCentimos: 6000,
      totalSinIvaCentimos: 17150,
      ivaCentimos: 3602, // round(171,50 × 0,21 = 36,015) half-up
      totalConIvaCentimos: 20752,
    });
    expect(r.precioMaterialOriginal).toBe(2500);
  });

  it('línea de manipulación con concepto legible', () => {
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Figura 2 — 50 cm × 5 ud.', centimos: 5750 },
    ]);
  });
});

describe('calcularCotizacion — cada figura activa contra su tarifa del PDF (§2)', () => {
  // Cantidad 1, merma 0 → baldosasConMerma 1; material = 0,36 m² × 25 € = 900 céntimos.
  const casos: [string, Record<string, Mm>, boolean, number][] = [
    ['figura-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) }, false, 950], // ≤5 cm: 0,19
    ['figura-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(60) }, false, 1150], // >5 cm: 0,23
    ['figura-2', medidasF2, false, 1150], // 0,23
    ['figura-3', medidasF2, false, 1250], // 0,25
    ['figura-4', { ...medidasF2, retorno: mm(100) }, false, 1450], // 0,29
    ['peldano-romo', { longitud: mm(500), fondo: mm(300) }, false, 225], // 0,045
    ['rodapie-estandar', { longitud: mm(500), altura: mm(72) }, false, 85], // 0,017
    ['rodapie-estandar', { longitud: mm(500), altura: mm(72) }, true, 125], // pintado 0,025
    ['rodapie-no-estandar', { longitud: mm(500), altura: mm(100) }, false, 170], // 0,034
    ['rodapie-no-estandar', { longitud: mm(500), altura: mm(100) }, true, 210], // pintado 0,042
    ['corte', { largo: mm(300), ancho: mm(200) }, false, 170], // 0,017 × perímetro 100 cm
  ];
  it.each(casos)(
    '%s %s pintado=%s → %i céntimos de manipulación',
    (figuraId, medidas, pintado, esperada) => {
      const r = esperarOk(
        calcularCotizacion(
          entradaBase({ figuraId, medidasMm: medidas, pintado, cantidad: 1, mermaPorcentaje: 0 }),
          config,
        ),
      );
      expect(r.desglose.manipulacionCentimos).toBe(esperada);
      expect(r.desglose.materialCentimos).toBe(900);
      expect(r.desglose.arranqueCentimos).toBe(6000);
      expect(r.desglose.totalSinIvaCentimos).toBe(900 + esperada + 6000);
    },
  );

  it('umbral frontal 5 cm: exactamente 50 mm → 0,19; 51 mm → 0,23', () => {
    const le = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'figura-1',
          medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(50) },
          cantidad: 1,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(le.desglose.manipulacionCentimos).toBe(950); // 0,19 €/cm
    const gt = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'figura-1',
          medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(51) },
          cantidad: 1,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(gt.desglose.manipulacionCentimos).toBe(1150); // 0,23 €/cm
  });
});

describe('calcularCotizacion — suplementos (tarifas del PDF §2)', () => {
  it('Figuras 1–4: angular 2 €/pieza; ranuras/goterón 0,02; espesado 0,06 €/cm', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ suplementos: ['angular-f14', 'ranuras-f14', 'goteron-f14', 'espesado-f14'] }),
        config,
      ),
    );
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Figura 2 — 50 cm × 5 ud.', centimos: 5750 },
      { concepto: 'Angular — 5 ud.', centimos: 1000 }, // 2 € × 5
      { concepto: 'Tres ranuras antideslizantes — 50 cm × 5 ud.', centimos: 500 }, // 0,02 × 50 × 5
      { concepto: 'Ranura (goterón) — 50 cm × 5 ud.', centimos: 500 },
      { concepto: 'Material espesado — 50 cm × 5 ud.', centimos: 1500 }, // 0,06 × 50 × 5
    ]);
    expect(r.desglose.manipulacionCentimos).toBe(9250);
  });

  it('Peldaño romo: angular 1 €/pieza; espesado 0,03 €/cm', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'peldano-romo',
          medidasMm: { longitud: mm(500), fondo: mm(300) },
          cantidad: 2,
          mermaPorcentaje: 0,
          suplementos: ['angular-romo', 'espesado-romo'],
        }),
        config,
      ),
    );
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Peldaño romo — 50 cm × 2 ud.', centimos: 450 },
      { concepto: 'Angular — 2 ud.', centimos: 200 },
      { concepto: 'Material espesado — 50 cm × 2 ud.', centimos: 300 }, // 0,03 × 50 × 2
    ]);
    expect(r.desglose.manipulacionCentimos).toBe(950);
  });

  it('el orden de líneas es el canónico de la configuración, no el de la entrada', () => {
    const r = esperarOk(
      calcularCotizacion(entradaBase({ suplementos: ['espesado-f14', 'angular-f14'] }), config),
    );
    expect(r.lineasManipulacion.map((l) => l.concepto)).toEqual([
      'Figura 2 — 50 cm × 5 ud.',
      'Angular — 5 ud.',
      'Material espesado — 50 cm × 5 ud.',
    ]);
  });
});

describe('calcularCotizacion — arranque de máquina (§2)', () => {
  it('se aplica una sola vez por orden aunque haya varias líneas de manipulación', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ suplementos: ['angular-f14', 'ranuras-f14', 'goteron-f14', 'espesado-f14'] }),
        config,
      ),
    );
    expect(r.lineasManipulacion).toHaveLength(5);
    expect(r.desglose.arranqueCentimos).toBe(6000);
  });
});

describe('calcularCotizacion — merma (§4: ceil, sin "mínimo 3" §6.1)', () => {
  it.each([
    [1, 10, 2], // 1 × 1,10 = 1,1 → 2 (sin "mínimo 3": NO implementado, §6.1)
    [5, 10, 6], // 5,5 → 6
    [10, 10, 11],
    [10, 0, 10],
    [8, 12.5, 9], // 8 × 1,125 = 9 exacto
    [3, 33.33, 4], // 3 × 1,3333 = 3,9999 → 4
  ])('cantidad %i con merma %i%% → %i baldosas', (cantidad, merma, esperado) => {
    const r = esperarOk(
      calcularCotizacion(entradaBase({ cantidad, mermaPorcentaje: merma }), config),
    );
    expect(r.baldosasNecesarias).toBe(cantidad);
    expect(r.baldosasConMerma).toBe(esperado);
  });
});

describe('calcularCotizacion — stock vs pedido (§4)', () => {
  it('pedido → cajas completas; el sobrante se cobra al cliente', () => {
    const r = esperarOk(calcularCotizacion(entradaBase({ origen: 'pedido' }), config));
    expect(r.baldosasConMerma).toBe(6);
    expect(r.cajasFacturadas).toBe(2); // ceil(6 / 4 piezas por caja)
    expect(r.unidadesFacturadas).toBe(8); // 2 × 4: sobrante facturado
    expect(r.m2Facturados).toBe(2.88); // 2 × 1,44 m²/caja
    expect(r.desglose.materialCentimos).toBe(7200); // 2,88 × 25 €/m²
    expect(r.desglose.totalSinIvaCentimos).toBe(7200 + 5750 + 6000);
  });

  it('pedido sin «piezas por caja» en el ERP → error claro de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ origen: 'pedido', material: materialErp({ piezasPorCaja: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/piezas por caja/);
  });

  it('pedido sin «m² por caja» en el ERP → error claro de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ origen: 'pedido', material: materialErp({ m2PorCaja: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/m² por caja/);
  });
});

describe('calcularCotizacion — material manual y precio editado', () => {
  it('manual → precio por unidad × unidades facturadas', () => {
    const r = esperarOk(calcularCotizacion(entradaBase({ material: materialManual() }), config));
    expect(r.unidadesFacturadas).toBe(6);
    expect(r.desglose.materialCentimos).toBe(4800); // 6 × 8 €
    expect(r.precioMaterialOriginal).toBe(800);
  });

  it('manual a pedido sin datos logísticos → error claro', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(entradaBase({ material: materialManual(), origen: 'pedido' }), config),
    );
    expect(mensajes.join(' ')).toMatch(/piezas por caja/);
  });

  it('manual sin precio y sin edición del comercial → error de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ material: materialManual({ precioUnidadCentimos: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/no tiene precio por unidad/);
  });

  it('ERP sin tarifa TARP y sin edición → error de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ material: materialErp({ precioM2Centimos: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/TARP/);
  });

  it('precioMaterialEditado sustituye a la tarifa €/m² y el original se conserva', () => {
    const r = esperarOk(
      calcularCotizacion(entradaBase({ precioMaterialEditado: centimos(3000) }), config),
    );
    expect(r.desglose.materialCentimos).toBe(6480); // 2,16 m² × 30 €/m²
    expect(r.precioMaterialOriginal).toBe(2500); // tarifa TARP intacta
  });

  it('precioMaterialEditado en manual sustituye al precio por unidad', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ material: materialManual(), precioMaterialEditado: centimos(900) }),
        config,
      ),
    );
    expect(r.desglose.materialCentimos).toBe(5400); // 6 × 9 €
    expect(r.precioMaterialOriginal).toBe(800);
  });

  it('sin tarifa original pero con precio editado: el original mostrado es el editado', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialErp({ precioM2Centimos: null }),
          precioMaterialEditado: centimos(3000),
        }),
        config,
      ),
    );
    expect(r.desglose.materialCentimos).toBe(6480);
    expect(r.precioMaterialOriginal).toBe(3000);
  });
});

describe('calcularCotizacion — ocupación: no cabe y giro 90°', () => {
  it('no cabe por longitud → mensaje corto con los números reales', () => {
    const salida = calcularCotizacion(
      entradaBase({ medidasMm: { longitud: mm(900), fondo: mm(300), alturaFrontal: mm(40) } }),
      config,
    );
    expect(salida.ok).toBe(false);
    const mensajes = esperarErrores(salida);
    expect(mensajes).toEqual(['La pieza mide 90 cm; el formato solo llega a 60 cm.']);
  });

  it('giro de 90° cuando solo cabe en la otra orientación', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialErp({ formato: { largoMm: mm(1000), anchoMm: mm(330) } }),
          medidasMm: { longitud: mm(300), fondo: mm(300), alturaFrontal: mm(40) },
        }),
        config,
      ),
    );
    expect(r.ocupacion.baldosaGirada).toBe(true);
    expect(r.ocupacion.dimensionUtilMm).toBe(1000);
  });
});

describe('calcularCotizacion — errores como valor (nunca lanza por entrada de usuario)', () => {
  it.each([
    ['figura inexistente', entradaBase({ figuraId: 'no-existe' }), /no existe en la configuración/],
    [
      'figura pendiente (§6.5)',
      entradaBase({ figuraId: 'figura-5' }),
      /no está disponible todavía/,
    ],
    ['cantidad 0', entradaBase({ cantidad: 0 }), /cantidad debe ser un número entero mayor que 0/],
    ['cantidad no entera', entradaBase({ cantidad: 2.5 }), /cantidad debe ser un número entero/],
    ['merma negativa', entradaBase({ mermaPorcentaje: -5 }), /merma debe ser un porcentaje válido/],
    [
      'medida ausente',
      entradaBase({ medidasMm: { longitud: mm(500), alturaFrontal: mm(40) } }),
      /Falta la medida «Fondo»/,
    ],
    [
      'medida fuera de rango (revalidación del motor)',
      entradaBase({ medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(5) } }),
      /no puede ser menor que 1 cm/,
    ],
    [
      'suplemento inexistente',
      entradaBase({ suplementos: ['no-existe'] }),
      /no existe en la configuración/,
    ],
    [
      'suplemento no aplicable a la figura',
      entradaBase({
        figuraId: 'rodapie-estandar',
        medidasMm: { longitud: mm(500), altura: mm(72) },
        suplementos: ['angular-f14'],
      }),
      /no disponible para «Rodapié 7,2 y 8 cm»/,
    ],
    [
      'precio editado negativo',
      entradaBase({ precioMaterialEditado: centimos(-100) }),
      /no puede ser negativo/,
    ],
  ])('%s', (_nombre, entrada, patron) => {
    const salida = calcularCotizacion(entrada, config);
    expect(salida.ok).toBe(false);
    const mensajes = esperarErrores(salida);
    expect(mensajes.join(' ')).toMatch(patron);
  });

  it('el motivo de la figura pendiente se incluye en el mensaje', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(entradaBase({ figuraId: 'pasamanos' }), config),
    );
    expect(mensajes.join(' ')).toMatch(/Sin tarifa confirmada \(§6\.6\)/);
  });
});

describe('calcularCotizacion — determinismo y precisión entera (§1)', () => {
  it('mismo input → mismo output, siempre', () => {
    const entrada = entradaBase({ suplementos: ['angular-f14', 'ranuras-f14'], origen: 'pedido' });
    const a = calcularCotizacion(entrada, config);
    const b = calcularCotizacion(entrada, config);
    expect(a).toEqual(b);
  });

  it('todos los importes del resultado son céntimos ENTEROS (prohibido float)', () => {
    const casos = [
      entradaBase(),
      entradaBase({ origen: 'pedido' }),
      entradaBase({
        figuraId: 'peldano-romo',
        medidasMm: { longitud: mm(333), fondo: mm(222) },
        cantidad: 7,
      }),
      entradaBase({
        figuraId: 'rodapie-no-estandar',
        medidasMm: { longitud: mm(123), altura: mm(45) },
        cantidad: 3,
        pintado: true,
      }),
      entradaBase({
        suplementos: ['angular-f14', 'ranuras-f14', 'goteron-f14', 'espesado-f14'],
        cantidad: 7,
      }),
    ];
    for (const entrada of casos) {
      const r = esperarOk(calcularCotizacion(entrada, config));
      const importes = [
        ...Object.values(r.desglose),
        r.precioMaterialOriginal,
        ...r.lineasManipulacion.map((l) => l.centimos),
      ];
      for (const importe of importes) {
        expect(Number.isInteger(importe)).toBe(true);
      }
      // Las medidas calculadas también son mm enteros.
      for (const c of r.componentes) {
        expect(Number.isInteger(c.largoMm)).toBe(true);
        expect(Number.isInteger(c.anchoMm)).toBe(true);
      }
      expect(Number.isInteger(r.ocupacion.ocupacionMm)).toBe(true);
    }
  });

  it('redondeo half-up POR PIEZA, luego multiplicar: 0,045 €/cm × 33,3 cm', () => {
    // 45 milésimas/cm × 333 mm = 1498,5 milésimas → 150 céntimos (half-up por
    // pieza, una sola vez) × 3 piezas = 450. Orden elegido y documentado en
    // cotizacion.ts: se redondea por pieza y luego se multiplica por la cantidad.
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'peldano-romo',
          medidasMm: { longitud: mm(333), fondo: mm(222) },
          cantidad: 3,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(r.desglose.manipulacionCentimos).toBe(450); // 150 × 3
  });
});
