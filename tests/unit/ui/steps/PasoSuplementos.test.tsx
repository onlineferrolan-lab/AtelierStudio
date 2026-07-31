/**
 * Tests del paso ④ Suplementos: conmutadores por suplemento de la figura con
 * los precios leídos de configuración (tarifas.json) y mensajes guía según el
 * estado (§1.④, §2).
 */

import { act, fireEvent, screen } from '@testing-library/react';
import type { Configuracion } from '../../../../src/domain/config';
import { PasoSuplementos } from '../../../../src/ui/steps/PasoSuplementos';
import { construirConfigPrueba, materialPrueba } from './config-prueba';
import { montarPasos } from './utilidades-prueba';

/**
 * Configuración que ve el componente: la real de `/public/config` salvo que un
 * test ponga otra en `configuracion.actual` (se usa para llegar a estados que el
 * catálogo real ya no produce). `vi.hoisted` porque `vi.mock` se iza.
 */
const configuracion = vi.hoisted(() => ({ actual: null as Configuracion | null }));

afterEach(() => {
  configuracion.actual = null;
});

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('./config-prueba');
  return { ...mod, useConfig: () => configuracion.actual ?? construirConfigPrueba() };
});

describe('PasoSuplementos', () => {
  it('guía al paso 2 cuando no hay figura seleccionada', () => {
    montarPasos(<PasoSuplementos />);
    expect(screen.getByText(/Selecciona primero una figura en el paso 2/)).toBeInTheDocument();
  });

  it('lista los suplementos de la figura con sus precios de configuración y conmuta', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    // Precios de tarifas.json: angular-f14 2,00 €/peldaño; ranuras y goterón
    // 0,02 €/cm; espesado 0,06 €/cm (\s cubre el espacio duro de Intl es-ES).
    expect(screen.getByText(/^\+2,00\s€\/peldaño$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^\+0,02\s€\/cm$/)).toHaveLength(2);
    expect(screen.getByText(/^\+0,06\s€\/cm$/)).toBeInTheDocument();

    const angular = screen.getByRole('checkbox', { name: /Angular/ });
    expect(angular).not.toBeChecked();
    fireEvent.click(angular);
    expect(api().estado.suplementos['angular-f14']).toBe(true);
    fireEvent.click(angular);
    expect(api().estado.suplementos['angular-f14']).toBe(false);
  });

  it('los rodapiés no tienen suplementos ni conmutador de pintado', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));

    expect(screen.getByText('Esta figura no tiene suplementos.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Pintado/ })).not.toBeInTheDocument();
  });

  // Acabados de canto del corte de piezas (2026-07-31): inglete y microbisel a
  // 0,034 €/cm de coste; «Sin microbisel» existe para dejar constancia de la
  // elección en la orden, y por eso se rotula «Sin coste» y no «+0,00 €/cm».
  it('lista los acabados de canto del corte de piezas', () => {
    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'corte' }));

    expect(screen.getAllByText(/^\+0,034\s€\/cm$/)).toHaveLength(2);
    expect(screen.getByText('Sin coste')).toBeInTheDocument();

    const inglete = screen.getByRole('checkbox', { name: /Inglete/ });
    fireEvent.click(inglete);
    expect(api().estado.suplementos['inglete-corte']).toBe(true);
    // Van por cm: recorren el canto, no se eligen unidades.
    expect(screen.queryByLabelText(/Piezas con Inglete/)).not.toBeInTheDocument();
  });

  it('informa cuando la figura no tiene suplementos', () => {
    // Hoy TODAS las figuras del catálogo tienen suplementos o pintado, así que
    // el vacío solo se alcanza con una configuración recortada; el mensaje sigue
    // haciendo falta para la próxima figura que se dé de alta sin ninguno.
    const base = construirConfigPrueba();
    configuracion.actual = {
      ...base,
      figuras: base.figuras.map((f) =>
        f.id === 'corte' ? { ...f, suplementos: [], tienePintado: false } : f,
      ),
    };

    const { api } = montarPasos(<PasoSuplementos />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'corte' }));
    expect(screen.getByText('Esta figura no tiene suplementos.')).toBeInTheDocument();
  });
});

/**
 * «Angular» es un remate del extremo: en un tramo de escalera solo lo llevan las
 * piezas de esquina, así que se elige a cuántas se aplica (2026-07-30).
 */
describe('PasoSuplementos — piezas con suplemento por pieza', () => {
  function conFigura1(): ReturnType<typeof montarPasos> {
    const montaje = montarPasos(<PasoSuplementos />);
    act(() => montaje.api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    return montaje;
  }

  it('solo el suplemento por pieza pide unidades; los de por cm no', () => {
    const { api } = conFigura1();
    expect(screen.queryByLabelText(/Piezas con Angular/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));
    expect(screen.getByLabelText(/Piezas con Angular/)).toBeInTheDocument();

    // Las ranuras van por cm: recorren la pieza entera, no se eligen unidades.
    fireEvent.click(screen.getByRole('checkbox', { name: /Tres ranuras/ }));
    expect(screen.queryByLabelText(/Piezas con Tres ranuras/)).not.toBeInTheDocument();
    expect(api().estado.suplementos['ranuras-f14']).toBe(true);
  });

  it('al activarlo propone UNA pieza, no todas', () => {
    const { api } = conFigura1();
    act(() => api().dispatch({ tipo: 'cambiarCantidad', cantidad: '12' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));

    expect(screen.getByLabelText(/Piezas con Angular/)).toHaveValue('1');
    expect(api().estado.unidadesSuplemento['angular-f14']).toBe('1');
    expect(screen.getByText('de 12')).toBeInTheDocument();
  });

  it('el comercial cambia cuántas piezas lo llevan', () => {
    const { api } = conFigura1();
    act(() => api().dispatch({ tipo: 'cambiarCantidad', cantidad: '12' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));

    fireEvent.change(screen.getByLabelText(/Piezas con Angular/), { target: { value: '2' } });
    expect(api().estado.unidadesSuplemento['angular-f14']).toBe('2');
  });

  it('avisa si se aplica a más piezas de las que hay', () => {
    const { api } = conFigura1();
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'cambiarCantidad', cantidad: '3' }));
    for (const [medida, valor] of [
      ['longitud', '100'],
      ['fondo', '30'],
      ['alturaFrontal', '4'],
    ]) {
      act(() => api().dispatch({ tipo: 'cambiarMedida', medida, valor }));
    }
    fireEvent.click(screen.getByRole('checkbox', { name: /Angular/ }));
    fireEvent.change(screen.getByLabelText(/Piezas con Angular/), { target: { value: '5' } });

    expect(screen.getByText(/a 5 piezas: solo hay 3/)).toBeInTheDocument();
  });

  it('al desmarcarlo desaparece el campo', () => {
    conFigura1();
    const angular = screen.getByRole('checkbox', { name: /Angular/ });
    fireEvent.click(angular);
    expect(screen.getByLabelText(/Piezas con Angular/)).toBeInTheDocument();
    fireEvent.click(angular);
    expect(screen.queryByLabelText(/Piezas con Angular/)).not.toBeInTheDocument();
  });
});
