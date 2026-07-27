// Smoke E2E del motor con la config real: peldaño Figura 1, frontal 4 cm, stock.
import { describe, expect, it } from 'vitest';
import { calcularCotizacion, validarMedidasCrudas } from '../../src/domain/engine/index';
import { construirConfiguracion } from '../../src/domain/config';
import { eurosACentimos } from '../../src/domain/money';
import { mm } from '../../src/domain/units';
import parametros from '../../public/config/parametros.json';
import tarifas from '../../public/config/tarifas.json';
import figuras from '../../public/config/figuras.json';

describe('smoke e2e', () => {
  it('cotiza Figura 1 frontal ≤5 cm con suplementos', () => {
    const config = construirConfiguracion(parametros as never, tarifas as never, figuras as never);
    const figura = config.figuras.find((f) => f.id === 'figura-1')!;
    const v = validarMedidasCrudas(figura, { longitud: '100', fondo: '30', alturaFrontal: '4' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const salida = calcularCotizacion(
      {
        material: {
          referencia: 'T-1', descripcion: 'Test', marca: null,
          formato: { largoMm: mm(1200), anchoMm: mm(600) },
          precioM2Centimos: eurosACentimos(25), precioUnidadCentimos: null,
          piezasPorCaja: 2, m2PorCaja: 1.44, imagenUrl: null, esManual: false,
        },
        origen: 'stock', figuraId: 'figura-1', medidasMm: v.medidasMm,
        cantidad: 10, suplementos: ['angular-f14', 'ranuras-f14'], pintado: false,
        precioMaterialEditado: null, mermaPorcentaje: 10,
      },
      config,
    );
    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    const d = salida.resultado.desglose;
    console.log({
      baldosas: salida.resultado.baldosasNecesarias,
      conMerma: salida.resultado.baldosasConMerma,
      material: d.materialCentimos, manipulacion: d.manipulacionCentimos,
      arranque: d.arranqueCentimos, sinIva: d.totalSinIvaCentimos, conIva: d.totalConIvaCentimos,
    });
    // 10 baldosas → 11 con merma; material 11×0,72 m²×25 € = 198 €; manipulación
    // (0,19×100 + 2 + 0,02×100)×10 = 230 €; +60 arranque; IVA 21 %.
    expect(d.totalSinIvaCentimos).toBe(48800);
    expect(d.totalConIvaCentimos).toBe(59048);
  });
});
