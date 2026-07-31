/**
 * Tests integrales de calcularCotizacion contra la configuración real
 * (tarifas del PDF §2, parámetros PROVISIONALES de taller): tarifas por figura,
 * suplementos, ocupación, merma, stock/pedido, material manual, azulejos no
 * incluidos, arranque único, IVA, determinismo y ausencia de floats.
 *
 * Parámetros de config usados: disco 3 mm, tolerancia 2 mm, saneado 5 mm/lado,
 * arranque 60 € (6000 céntimos), IVA 21 %.
 */

import { calcularCotizacion, figuraPorId } from '../../../src/domain/engine';
import type { Configuracion, Figura } from '../../../src/domain/config';
import type { Mm, ResultadoCotizacion, SalidaMotor } from '../../../src/domain/types';
import { mm } from '../../../src/domain/units';
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
      piezasPorBaldosa: 1, // una pieza de 35,5×50 cm llena prácticamente la baldosa 60×60
    });
  });

  it('baldosas = ceil(cantidad / piezasPorBaldosa); aquí cabe 1 pieza por baldosa → 5, y merma con ceil: 5 × 1,10 → 6', () => {
    expect(r.baldosasNecesarias).toBe(5);
    expect(r.baldosasConMerma).toBe(6);
  });

  it('stock también se factura por cajas completas (2026-07-30)', () => {
    // 6 baldosas con merma, 4 por caja → 2 cajas y se cobran las 8 piezas.
    expect(r.cajasFacturadas).toBe(2);
    expect(r.unidadesFacturadas).toBe(8);
    expect(r.m2Facturados).toBe(2.88); // 2 × 1,44 m²/caja
  });

  it('desglose completo con IVA 21 % (189,50 € → 39,80 € half-up → 229,30 €)', () => {
    expect(r.desglose).toEqual({
      materialCentimos: 7200, // 2,88 m² × 25 €/m²
      manipulacionCentimos: 5750, // 50 cm × 0,23 €/cm × 5
      arranqueCentimos: 6000,
      totalSinIvaCentimos: 18950,
      ivaCentimos: 3980, // round(189,50 × 0,21 = 39,795) half-up
      totalConIvaCentimos: 22930,
    });
  });

  it('línea de manipulación con concepto legible', () => {
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Figura 2 — 50 cm × 5 ud.', centimos: 5750 },
    ]);
  });
});

describe('calcularCotizacion — cada figura activa contra su tarifa (§2; pasamanos PROVISIONAL §6.6)', () => {
  // Cantidad 1, merma 0 → baldosasConMerma 1 → 1 caja (4 piezas, 1,44 m²);
  // material = 1,44 m² × 25 € = 3600 céntimos, igual en todos los casos.
  const casos: [string, Record<string, Mm>, number][] = [
    ['figura-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) }, 950], // ≤5 cm: 0,19
    ['figura-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(60) }, 1150], // >5 cm: 0,23
    ['figura-2', medidasF2, 1150], // 0,23
    ['figura-3', medidasF2, 1250], // 0,25
    ['figura-4', { ...medidasF2, retorno: mm(100) }, 1450], // 0,29
    ['peldano-romo', { longitud: mm(500), fondo: mm(300) }, 225], // 0,045
    // Pasamanos: tarifa PROVISIONAL = precio del peldaño equivalente (§6.6, PENDIENTES.md).
    ['pasamanos-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(40) }, 950], // ≤5 cm: 0,19
    ['pasamanos-1', { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(60) }, 1150], // >5 cm: 0,23
    ['pasamanos-2', medidasF2, 1150], // 0,23
    ['pasamanos-3', medidasF2, 1250], // 0,25
    ['pasamanos-4', { ...medidasF2, retorno: mm(50) }, 1450], // 0,29
    ['pasamanos-romo', { longitud: mm(500), fondo: mm(300) }, 225], // 0,045
    // Rodapiés: tarifa por altura, nunca por canto (2026-07-31). Se prueban los
    // tres cantos de 7,2 con el mismo importe, que es lo que dice la regla.
    ['rodapie-72-recto', { longitud: mm(500), altura: mm(72) }, 85], // 0,017
    ['rodapie-72-microbiselado', { longitud: mm(500), altura: mm(72) }, 85], // 0,017
    ['rodapie-72-romado', { longitud: mm(500), altura: mm(72) }, 85], // 0,017
    ['rodapie-8-romado', { longitud: mm(500), altura: mm(80) }, 85], // 0,017
    ['rodapie-medida-recto', { longitud: mm(500), altura: mm(100) }, 170], // 0,034
    ['rodapie-medida-romado', { longitud: mm(500), altura: mm(100) }, 170], // 0,034
    ['corte', { largo: mm(300), ancho: mm(200) }, 170], // 0,017 × perímetro 100 cm
  ];
  it.each(casos)(
    '%s %s → %i céntimos de manipulación',
    (figuraId, medidas, esperada) => {
      const r = esperarOk(
        calcularCotizacion(
          entradaBase({ figuraId, medidasMm: medidas, cantidad: 1, mermaPorcentaje: 0 }),
          config,
        ),
      );
      expect(r.desglose.manipulacionCentimos).toBe(esperada);
      expect(r.desglose.materialCentimos).toBe(3600);
      expect(r.desglose.arranqueCentimos).toBe(6000);
      expect(r.desglose.totalSinIvaCentimos).toBe(3600 + esperada + 6000);
    },
  );

  /**
   * La caída (altura frontal) tiene un mínimo de 4 cm (2026-07-30, indicación
   * directa). Se comprueba el borde por los dos lados: 4 cm entra, 3,9 no.
   */
  it('caída mínima de 4 cm: 40 mm vale, 39 mm no', () => {
    const medidasCon = (alturaFrontal: Mm) => ({
      longitud: mm(500),
      fondo: mm(300),
      alturaFrontal,
    });
    expect(calcularCotizacion(entradaBase({ medidasMm: medidasCon(mm(40)) }), config).ok).toBe(true);
    const corta = calcularCotizacion(entradaBase({ medidasMm: medidasCon(mm(39)) }), config);
    expect(corta.ok).toBe(false);
    expect(esperarErrores(corta).join(' ')).toMatch(/Altura frontal.*menor que 4 cm/);
  });

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

  it('pasamanos: la receta duplica el frontal (y el retorno en el 4) sobre la baldosa', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ figuraId: 'pasamanos-1', cantidad: 1, mermaPorcentaje: 0 }),
        config,
      ),
    );
    expect(r.componentes.map((c) => c.id)).toEqual(['tapa', 'frontal', 'frontal-trasero']);
    const r4 = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'pasamanos-4',
          medidasMm: { ...medidasF2, retorno: mm(50) },
          cantidad: 1,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(r4.componentes.map((c) => c.id)).toEqual([
      'tapa',
      'frontal',
      'frontal-trasero',
      'retorno',
      'retorno-trasero',
    ]);
  });

  it('pasamanos: la línea de manipulación nombra la tarifa del pasamanos, no la del peldaño', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ figuraId: 'pasamanos-2', cantidad: 1, mermaPorcentaje: 0 }),
        config,
      ),
    );
    expect(r.lineasManipulacion[0].concepto).toBe('Pasamanos 2 — 50 cm × 1 ud.');
  });
});

describe('calcularCotizacion — suplementos (tarifas del PDF §2)', () => {
  it('Figuras 1–4: angular 2 €/pieza; ranuras/goterón 0,02; espesado 0,06 €/cm', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          suplementos: ['angular-f14', 'ranuras-f14', 'goteron-f14', 'espesado-f14'],
          // El angular remata solo 2 de las 5 piezas; los de por cm van a todas.
          unidadesSuplemento: { 'angular-f14': 2 },
        }),
        config,
      ),
    );
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Figura 2 — 50 cm × 5 ud.', centimos: 5750 },
      { concepto: 'Angular — 2 ud.', centimos: 400 }, // 2 € × 2 piezas, no × 5
      { concepto: 'Tres ranuras antideslizantes — 50 cm × 5 ud.', centimos: 500 }, // 0,02 × 50 × 5
      { concepto: 'Ranura (goterón) — 50 cm × 5 ud.', centimos: 500 },
      { concepto: 'Material espesado — 50 cm × 5 ud.', centimos: 1500 }, // 0,06 × 50 × 5
    ]);
    expect(r.desglose.manipulacionCentimos).toBe(8650);
  });

  it('sin unidades declaradas, el angular se cobra a UNA pieza (no a todas)', () => {
    const r = esperarOk(
      calcularCotizacion(entradaBase({ suplementos: ['angular-f14'] }), config),
    );
    expect(r.lineasManipulacion[1]).toEqual({ concepto: 'Angular — 1 ud.', centimos: 200 });
  });

  it('el angular se puede aplicar a todas las piezas si de verdad lo llevan todas', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ suplementos: ['angular-f14'], unidadesSuplemento: { 'angular-f14': 5 } }),
        config,
      ),
    );
    expect(r.lineasManipulacion[1]).toEqual({ concepto: 'Angular — 5 ud.', centimos: 1000 });
  });

  it('rechaza aplicar el angular a más piezas de las que hay', () => {
    const salida = calcularCotizacion(
      entradaBase({ suplementos: ['angular-f14'], unidadesSuplemento: { 'angular-f14': 6 } }),
      config,
    );
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.errores[0].mensaje).toMatch(/a 6 piezas: solo hay 5/);
  });

  it('rechaza unidades de angular que no sean enteros mayores que 0', () => {
    for (const unidades of [0, -1, 1.5]) {
      const salida = calcularCotizacion(
        entradaBase({
          suplementos: ['angular-f14'],
          unidadesSuplemento: { 'angular-f14': unidades },
        }),
        config,
      );
      expect(salida.ok).toBe(false);
      if (salida.ok) continue;
      expect(salida.errores[0].mensaje).toMatch(/entero mayor que 0/);
    }
  });

  it('las unidades solo afectan a los suplementos por pieza, no a los de por cm', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          suplementos: ['ranuras-f14'],
          unidadesSuplemento: { 'ranuras-f14': 1 },
        }),
        config,
      ),
    );
    // Las ranuras recorren la pieza entera: 0,02 × 50 cm × las 5 piezas.
    expect(r.lineasManipulacion[1]).toEqual({
      concepto: 'Tres ranuras antideslizantes — 50 cm × 5 ud.',
      centimos: 500,
    });
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
          unidadesSuplemento: { 'angular-romo': 2 },
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

  /**
   * Acabados de canto del corte de piezas (2026-07-31, indicación directa).
   * Inglete y microbisel a 0,034 €/cm de COSTE; se cobran sobre la misma
   * longitud que la tarifa de corte, que en esta figura es el PERÍMETRO.
   */
  it('Corte de piezas: inglete y microbisel a 0,034 €/cm sobre el perímetro', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'corte',
          medidasMm: { largo: mm(300), ancho: mm(200) },
          cantidad: 2,
          mermaPorcentaje: 0,
          suplementos: ['inglete-corte', 'microbisel-corte'],
        }),
        config,
      ),
    );
    // Perímetro 2 × (30 + 20) = 100 cm.
    expect(r.lineasManipulacion).toEqual([
      { concepto: 'Corte de piezas — 100 cm × 2 ud.', centimos: 340 }, // 0,017 × 100 × 2
      { concepto: 'Inglete — 100 cm × 2 ud.', centimos: 680 }, // 0,034 × 100 × 2
      { concepto: 'Microbisel — 100 cm × 2 ud.', centimos: 680 },
    ]);
  });

  /** «Sin microbisel» no cobra: está para que la elección conste en la orden. */
  it('Corte de piezas: «Sin microbisel» aparece en el desglose a 0 €', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'corte',
          medidasMm: { largo: mm(300), ancho: mm(200) },
          cantidad: 2,
          mermaPorcentaje: 0,
          suplementos: ['sin-microbisel-corte'],
        }),
        config,
      ),
    );
    expect(r.lineasManipulacion[1]).toEqual({
      concepto: 'Sin microbisel — 100 cm × 2 ud.',
      centimos: 0,
    });
    expect(r.desglose.manipulacionCentimos).toBe(340);
  });

  it('el orden de líneas es el canónico de la configuración, no el de la entrada', () => {
    const r = esperarOk(
      calcularCotizacion(entradaBase({ suplementos: ['espesado-f14', 'angular-f14'] }), config),
    );
    expect(r.lineasManipulacion.map((l) => l.concepto)).toEqual([
      'Figura 2 — 50 cm × 5 ud.',
      'Angular — 1 ud.',
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

describe('calcularCotizacion — empaquetado: varias piezas por baldosa (dirección 2026-07-28)', () => {
  // El ejemplo del encargo: piezas de 10×10 cm cortadas de una baldosa de
  // 110×110 cm. Con la receta provisional (disco 3 mm, saneado 5 mm/lado,
  // tolerancia 2 mm): a lo ancho floor((1100−10−2+3)/103) = 10 y a lo largo
  // floor((1100+3)/103) = 10 → 100 piezas por baldosa.
  // m2PorCaja coherente con el formato: 4 piezas × 1,21 m² = 4,84 m²/caja. Antes
  // heredaba 1,44 (el de la baldosa 60×60), imposible para una de 110×110; no se
  // notaba porque en stock los m² salían del formato y la caja no se usaba.
  const baldosa110 = materialErp({
    formato: { largoMm: mm(1100), anchoMm: mm(1100) },
    m2PorCaja: 4.84,
  });
  const corte10x10 = { largo: mm(100), ancho: mm(100) };

  it('3 piezas de 10×10 cm salen de UNA baldosa de 110×110, no de 3', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: baldosa110,
          figuraId: 'corte',
          medidasMm: corte10x10,
          cantidad: 3,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(r.ocupacion.piezasPorBaldosa).toBe(100);
    expect(r.baldosasNecesarias).toBe(1);
    // Basta 1 baldosa, pero se factura la caja entera: 4 piezas, 4,84 m².
    expect(r.unidadesFacturadas).toBe(4);
    expect(r.m2Facturados).toBe(4.84);
    expect(r.desglose.materialCentimos).toBe(12100); // 4,84 m² × 25 €/m²
  });

  it('baldosas = ceil(cantidad / piezasPorBaldosa): 250 piezas de 10×10 → 3 baldosas', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: baldosa110,
          figuraId: 'corte',
          medidasMm: corte10x10,
          cantidad: 250,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(r.baldosasNecesarias).toBe(3);
  });

  it('rodapié de 50×10 cm en baldosa 60×60: 5 por baldosa; 5 ud → 1 baldosa, 6 ud → 2', () => {
    // a lo ancho floor((600−10−2+3)/103) = 5; a lo largo floor(603/503) = 1 → 5.
    const medidas = { longitud: mm(500), altura: mm(100) };
    const cinco = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'rodapie-medida-romado',
          medidasMm: medidas,
          cantidad: 5,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(cinco.ocupacion.piezasPorBaldosa).toBe(5);
    expect(cinco.baldosasNecesarias).toBe(1);
    const seis = esperarOk(
      calcularCotizacion(
        entradaBase({
          figuraId: 'rodapie-medida-romado',
          medidasMm: medidas,
          cantidad: 6,
          mermaPorcentaje: 0,
        }),
        config,
      ),
    );
    expect(seis.baldosasNecesarias).toBe(2);
    // 2 baldosas caben en 1 caja de 4 → se factura la caja: 1,44 m² × 25 €/m².
    expect(seis.desglose.materialCentimos).toBe(3600);
  });

  it('la merma se aplica sobre las baldosas ya empaquetadas: 101 piezas de 10×10 → 2 baldosas → 3 con merma 10 %', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: baldosa110,
          figuraId: 'corte',
          medidasMm: corte10x10,
          cantidad: 101,
          mermaPorcentaje: 10,
        }),
        config,
      ),
    );
    expect(r.baldosasNecesarias).toBe(2);
    expect(r.baldosasConMerma).toBe(3); // ceil(2 × 1,10)
  });
});

describe('calcularCotizacion — facturación por cajas (§4)', () => {
  it('se factura la caja completa; el sobrante se cobra al cliente', () => {
    const r = esperarOk(calcularCotizacion(entradaBase(), config));
    expect(r.baldosasConMerma).toBe(6);
    expect(r.cajasFacturadas).toBe(2); // ceil(6 / 4 piezas por caja)
    expect(r.unidadesFacturadas).toBe(8); // 2 × 4: sobrante facturado
    expect(r.m2Facturados).toBe(2.88); // 2 × 1,44 m²/caja
    expect(r.desglose.materialCentimos).toBe(7200); // 2,88 × 25 €/m²
    expect(r.desglose.totalSinIvaCentimos).toBe(7200 + 5750 + 6000);
  });

  it('sin «piezas por caja» → error claro de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(entradaBase({ material: materialErp({ piezasPorCaja: null }) }), config),
    );
    expect(mensajes.join(' ')).toMatch(/piezas por caja/);
  });

  it('sin «m² por caja» → error claro de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(entradaBase({ material: materialErp({ m2PorCaja: null }) }), config),
    );
    expect(mensajes.join(' ')).toMatch(/m² por caja/);
  });
});

describe('calcularCotizacion — material manual y azulejos no incluidos', () => {
  it('manual → precio por unidad × unidades facturadas', () => {
    const r = esperarOk(calcularCotizacion(entradaBase({ material: materialManual() }), config));
    expect(r.unidadesFacturadas).toBe(8); // 2 cajas de 4
    expect(r.desglose.materialCentimos).toBe(6400); // 8 × 8 €
  });

  it('manual sin datos de caja → error claro (no se puede facturar por cajas)', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ material: materialManual({ piezasPorCaja: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/piezas por caja/);
  });

  it('manual sin precio y con azulejos incluidos → error de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ material: materialManual({ precioUnidadCentimos: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/no tiene precio por unidad/);
  });

  it('ERP sin tarifa TARP y con azulejos incluidos → error de validación', () => {
    const mensajes = esperarErrores(
      calcularCotizacion(
        entradaBase({ material: materialErp({ precioM2Centimos: null }) }),
        config,
      ),
    );
    expect(mensajes.join(' ')).toMatch(/TARP/);
  });

  it('azulejos no incluidos → material a 0; manipulación y arranque se cobran igual', () => {
    const r = esperarOk(calcularCotizacion(entradaBase({ azulejosNoIncluidos: true }), config));
    expect(r.desglose.materialCentimos).toBe(0);
    // Mismos importes que el caso base salvo el material (7200 céntimos menos).
    expect(r.desglose.manipulacionCentimos).toBe(5750);
    expect(r.desglose.arranqueCentimos).toBe(6000);
    expect(r.desglose.totalSinIvaCentimos).toBe(11750);
    // Lo logístico no cambia: el cliente tiene que traer estas baldosas.
    expect(r.baldosasConMerma).toBe(6);
    expect(r.cajasFacturadas).toBe(2);
    expect(r.m2Facturados).toBe(2.88);
  });

  it('azulejos no incluidos en material manual → también 0', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({ material: materialManual(), azulejosNoIncluidos: true }),
        config,
      ),
    );
    expect(r.desglose.materialCentimos).toBe(0);
  });

  it('azulejos no incluidos permite cotizar un artículo sin tarifa TARP', () => {
    const r = esperarOk(
      calcularCotizacion(
        entradaBase({
          material: materialErp({ precioM2Centimos: null }),
          azulejosNoIncluidos: true,
        }),
        config,
      ),
    );
    expect(r.desglose.materialCentimos).toBe(0);
    expect(r.desglose.totalSinIvaCentimos).toBe(11750);
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
    ['cantidad 0', entradaBase({ cantidad: 0 }), /cantidad debe ser un número entero mayor que 0/],
    ['cantidad no entera', entradaBase({ cantidad: 2.5 }), /cantidad debe ser un número entero/],
    ['merma negativa', entradaBase({ mermaPorcentaje: -5 }), /merma debe ser un porcentaje válido/],
    [
      'medida ausente',
      entradaBase({ medidasMm: { longitud: mm(500), alturaFrontal: mm(40) } }),
      /Falta la medida «Ancho»/,
    ],
    [
      'medida fuera de rango (revalidación del motor)',
      entradaBase({ medidasMm: { longitud: mm(500), fondo: mm(300), alturaFrontal: mm(5) } }),
      /no puede ser menor que 4 cm/,
    ],
    [
      'suplemento inexistente',
      entradaBase({ suplementos: ['no-existe'] }),
      /no existe en la configuración/,
    ],
    [
      'suplemento no aplicable a la figura',
      entradaBase({
        figuraId: 'rodapie-72-romado',
        medidasMm: { longitud: mm(500), altura: mm(72) },
        suplementos: ['angular-f14'],
      }),
      /no disponible para «Rodapié 7,2 canto romado»/,
    ],
  ])('%s', (_nombre, entrada, patron) => {
    const salida = calcularCotizacion(entrada, config);
    expect(salida.ok).toBe(false);
    const mensajes = esperarErrores(salida);
    expect(mensajes.join(' ')).toMatch(patron);
  });

  it('el motivo de la figura pendiente se incluye en el mensaje', () => {
    // Las figuras pendientes se retiraron de la galería (2026-07-29); el estado
    // 'pendiente' sigue soportado y se prueba con una figura sintética (§6.6).
    const base = figuraPorId(config, 'figura-2');
    if (!base) throw new Error('figura-2 no encontrada en la configuración de pruebas');
    const pendiente: Figura = {
      ...base,
      id: 'prueba-pendiente',
      nombre: 'Prueba pendiente',
      estado: 'pendiente',
      motivoPendiente: 'Sin tarifa confirmada (§6.6).',
    };
    const configConPendiente: Configuracion = {
      ...config,
      figuras: [...config.figuras, pendiente],
    };
    const mensajes = esperarErrores(
      calcularCotizacion(entradaBase({ figuraId: 'prueba-pendiente' }), configConPendiente),
    );
    expect(mensajes.join(' ')).toMatch(/no está disponible todavía/);
    expect(mensajes.join(' ')).toMatch(/Sin tarifa confirmada \(§6\.6\)/);
  });
});

describe('calcularCotizacion — determinismo y precisión entera (§1)', () => {
  it('mismo input → mismo output, siempre', () => {
    const entrada = entradaBase({ suplementos: ['angular-f14', 'ranuras-f14'] });
    const a = calcularCotizacion(entrada, config);
    const b = calcularCotizacion(entrada, config);
    expect(a).toEqual(b);
  });

  it('todos los importes del resultado son céntimos ENTEROS (prohibido float)', () => {
    const casos = [
      entradaBase(),
      entradaBase({
        figuraId: 'peldano-romo',
        medidasMm: { longitud: mm(333), fondo: mm(222) },
        cantidad: 7,
      }),
      entradaBase({
        figuraId: 'rodapie-medida-romado',
        medidasMm: { longitud: mm(123), altura: mm(45) },
        cantidad: 3,
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
