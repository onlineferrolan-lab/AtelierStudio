/**
 * Estado inicial de la cotización.
 *
 * Ya NO hay origen de material (stock/pedido): se suprimió el 2026-07-30 al pasar
 * a facturar siempre por cajas completas, porque dejó de cambiar el importe.
 *
 * Tampoco hay merma inicial fija: desde el 2026-07-31 se sugiere a partir del
 * formato de la baldosa, así que el estado guarda solo la EDICIÓN del comercial.
 */

import { estadoInicial } from '../../../../src/ui/state/quote-state';

describe('estadoInicial', () => {
  it('arranca sin material ni figura y con una sola pieza', () => {
    const estado = estadoInicial();
    expect(estado.material).toBeNull();
    expect(estado.figuraId).toBeNull();
    expect(estado.cantidad).toBe('1');
    expect(estado.medidas).toEqual({});
    expect(estado.suplementos).toEqual({});
    expect(estado.unidadesSuplemento).toEqual({});
    expect(estado.pintado).toBe(false);
    expect(estado.comentarios).toBe('');
    expect(estado.adjuntos).toEqual([]);
  });

  /**
   * La merma arranca VACÍA, no con un número: vacío significa «usa la sugerida
   * por el formato» (2026-07-31). Si se inicializara con un valor concreto,
   * quedaría congelado y no se recalcularía al elegir material o figura.
   */
  it('arranca sin merma editada, para que valga la sugerida por el formato', () => {
    expect(estadoInicial().mermaEditadaPorcentaje).toBe('');
  });
});
