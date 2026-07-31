/**
 * El carrito del pedido: añadir, quitar, duplicar, editar y persistir.
 *
 * Se prueba a través del proveedor real (`renderHook` + `useAtelier`) y no
 * llamando al reductor a pelo: el reductor es interno a propósito, y lo que
 * importa es lo que ve la UI.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProveedorAtelier,
  useAtelier,
  type AccionAtelier,
  type EstadoAtelier,
} from '../../../../src/ui/state/quote-state';
import { centimos } from '../../../../src/domain/money';
import { mm } from '../../../../src/domain/units';
import type { Material } from '../../../../src/domain/types';

const material: Material = {
  referencia: '94111301',
  descripcion: 'Baldosa de prueba 60×60',
  marca: 'Pruebas',
  formato: { largoMm: mm(600), anchoMm: mm(600) },
  precioM2Centimos: centimos(2500),
  precioUnidadCentimos: null,
  piezasPorCaja: 4,
  m2PorCaja: 1.44,
  subfamilia: null,
  imagenUrl: null,
  esManual: false,
};

const otroMaterial: Material = { ...material, referencia: '94111302', descripcion: 'Otra' };

function montar(): {
  estado: () => EstadoAtelier;
  enviar: (...acciones: readonly AccionAtelier[]) => void;
} {
  const { result } = renderHook(() => useAtelier(), { wrapper: ProveedorAtelier });
  return {
    estado: () => result.current.estado,
    enviar: (...acciones) => {
      act(() => {
        for (const accion of acciones) result.current.dispatch(accion);
      });
    },
  };
}

/** Deja el editor con una pieza completa lista para añadir. */
function configurarPieza(
  enviar: (...acciones: readonly AccionAtelier[]) => void,
  opciones: { material?: Material; figuraId?: string; longitud?: string } = {},
): void {
  enviar(
    { tipo: 'seleccionarMaterial', material: opciones.material ?? material },
    { tipo: 'seleccionarFigura', figuraId: opciones.figuraId ?? 'figura-2' },
    { tipo: 'cambiarMedida', medida: 'longitud', valor: opciones.longitud ?? '50' },
    { tipo: 'cambiarMedida', medida: 'fondo', valor: '30' },
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('añadir al pedido', () => {
  it('mueve la pieza al carrito y deja el editor listo para la siguiente', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });

    expect(estado().carrito).toHaveLength(1);
    expect(estado().carrito[0].figuraId).toBe('figura-2');
    expect(estado().carrito[0].medidas.longitud).toBe('50');
    // La figura y las medidas se limpian: son de la pieza que ya se añadió.
    expect(estado().figuraId).toBeNull();
    expect(estado().medidas).toEqual({});
  });

  /**
   * El material se conserva a propósito: encadenar cortes del mismo artículo es
   * de donde sale el ahorro de cajas, y volver a buscarlo cada vez sería absurdo.
   */
  it('conserva el material para encadenar cortes del mismo artículo', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });
    expect(estado().material).toEqual(material);
  });

  it('no añade nada si aún no hay material o figura', () => {
    const { estado, enviar } = montar();
    enviar({ tipo: 'anadirAlPedido' });
    expect(estado().carrito).toHaveLength(0);

    enviar({ tipo: 'seleccionarMaterial', material }, { tipo: 'anadirAlPedido' });
    expect(estado().carrito).toHaveLength(0);
  });

  it('da a cada línea un id distinto', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });
    const [a, b] = estado().carrito;
    expect(a.id).not.toBe(b.id);
  });

  it('las líneas no comparten objetos con el editor', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });
    const medidasGuardadas = { ...estado().carrito[0].medidas };
    // Tocar el editor después de añadir no debe alterar la línea del pedido.
    enviar({ tipo: 'cambiarMedida', medida: 'longitud', valor: '999' });
    expect(estado().carrito[0].medidas).toEqual(medidasGuardadas);
  });
});

describe('quitar, duplicar y vaciar', () => {
  it('quita la línea por id, no por posición', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar, { longitud: '50' });
    enviar({ tipo: 'anadirAlPedido' });
    configurarPieza(enviar, { longitud: '80' });
    enviar({ tipo: 'anadirAlPedido' });

    const idPrimera = estado().carrito[0].id;
    enviar({ tipo: 'quitarDelPedido', id: idPrimera });
    expect(estado().carrito).toHaveLength(1);
    expect(estado().carrito[0].medidas.longitud).toBe('80');
  });

  it('la copia queda justo detrás de la original y con id propio', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar, { longitud: '50' });
    enviar({ tipo: 'anadirAlPedido' });
    configurarPieza(enviar, { longitud: '80' });
    enviar({ tipo: 'anadirAlPedido' });

    const idPrimera = estado().carrito[0].id;
    enviar({ tipo: 'duplicarLineaPedido', id: idPrimera });
    expect(estado().carrito.map((l) => l.medidas.longitud)).toEqual(['50', '50', '80']);
    expect(estado().carrito[1].id).not.toBe(idPrimera);
  });

  it('vaciar deja el pedido sin líneas', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' }, { tipo: 'vaciarPedido' });
    expect(estado().carrito).toHaveLength(0);
  });

  /** Perder diez piezas por pulsar «Reiniciar» sería un accidente caro. */
  it('«Reiniciar» limpia la pieza pero NO el pedido', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar);
    enviar({ tipo: 'anadirAlPedido' });
    configurarPieza(enviar, { longitud: '80' });
    enviar({ tipo: 'reiniciar' });

    expect(estado().carrito).toHaveLength(1);
    expect(estado().material).toBeNull();
    expect(estado().medidas).toEqual({});
  });

  it('«Reiniciar» conserva el tipo de margen del pedido', () => {
    const { estado, enviar } = montar();
    enviar({ tipo: 'cambiarTipoMargen', tipoMargen: 'contratista' }, { tipo: 'reiniciar' });
    expect(estado().tipoMargen).toBe('contratista');
  });
});

describe('editar una línea del pedido', () => {
  it('trae la línea al editor y la saca del pedido', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar, { longitud: '50' });
    enviar({ tipo: 'anadirAlPedido' });

    const id = estado().carrito[0].id;
    enviar({ tipo: 'editarLineaPedido', id });
    expect(estado().carrito).toHaveLength(0);
    expect(estado().figuraId).toBe('figura-2');
    expect(estado().medidas.longitud).toBe('50');
  });

  /**
   * Editar es un INTERCAMBIO: lo que hubiera empezado en el editor se guarda en
   * el pedido en vez de tirarse a la basura sin avisar.
   */
  it('guarda en el pedido la pieza que hubiera en el editor', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar, { longitud: '50' });
    enviar({ tipo: 'anadirAlPedido' });
    configurarPieza(enviar, { longitud: '80', material: otroMaterial });

    const id = estado().carrito[0].id;
    enviar({ tipo: 'editarLineaPedido', id });

    expect(estado().medidas.longitud).toBe('50'); // la línea traída
    expect(estado().carrito).toHaveLength(1);
    expect(estado().carrito[0].medidas.longitud).toBe('80'); // la que estaba a medias
  });

  it('con el editor vacío no guarda una línea fantasma', () => {
    const { estado, enviar } = montar();
    configurarPieza(enviar, { longitud: '50' });
    enviar({ tipo: 'anadirAlPedido' });
    // Tras añadir, el editor conserva el material pero no tiene medidas.
    const id = estado().carrito[0].id;
    enviar({ tipo: 'editarLineaPedido', id });
    expect(estado().carrito).toHaveLength(0);
  });
});

describe('el pedido sobrevive a una recarga', () => {
  it('se guarda en localStorage y se vuelve a leer', () => {
    const primera = montar();
    configurarPieza(primera.enviar, { longitud: '50' });
    primera.enviar({ tipo: 'anadirAlPedido' });
    expect(primera.estado().carrito).toHaveLength(1);

    // Segundo montaje = recargar la página.
    const segunda = montar();
    expect(segunda.estado().carrito).toHaveLength(1);
    expect(segunda.estado().carrito[0].medidas.longitud).toBe('50');
  });

  it('los ids no se repiten tras restaurar (o «quitar» borraría dos líneas)', () => {
    const primera = montar();
    configurarPieza(primera.enviar);
    primera.enviar({ tipo: 'anadirAlPedido' });
    const idGuardado = primera.estado().carrito[0].id;

    const segunda = montar();
    configurarPieza(segunda.enviar, { longitud: '80' });
    segunda.enviar({ tipo: 'anadirAlPedido' });

    const ids = segunda.estado().carrito.map((l) => l.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain(idGuardado);
  });

  it('vaciar el pedido también lo borra del navegador', () => {
    const primera = montar();
    configurarPieza(primera.enviar);
    primera.enviar({ tipo: 'anadirAlPedido' }, { tipo: 'vaciarPedido' });

    const segunda = montar();
    expect(segunda.estado().carrito).toHaveLength(0);
  });

  it('un pedido guardado corrupto no rompe el arranque', () => {
    window.localStorage.setItem('atelier-studio.pedido', '{no es json');
    expect(montar().estado().carrito).toEqual([]);
  });

  it('un pedido guardado de otra versión se descarta', () => {
    window.localStorage.setItem(
      'atelier-studio.pedido',
      JSON.stringify({ version: 999, carrito: [{ id: 'l1', figuraId: 'x', material, medidas: {} }] }),
    );
    expect(montar().estado().carrito).toEqual([]);
  });
});
