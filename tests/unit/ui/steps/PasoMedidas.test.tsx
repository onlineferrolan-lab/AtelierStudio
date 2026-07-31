/**
 * Tests del paso ③ Medidas y cantidad: campos dinámicos según la figura
 * seleccionada (entrada libre o segmentada con `opcionesCm`) y errores del
 * motor mostrados junto a su campo, nunca como un genérico (§1.③).
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { PasoMedidas } from '../../../../src/ui/steps/PasoMedidas';
import { materialPrueba } from './config-prueba';
import { montarPasos } from './utilidades-prueba';

vi.mock('../../../../src/ui/state/config-context', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/ui/state/config-context')>();
  const { construirConfigPrueba } = await import('./config-prueba');
  return { ...mod, useConfig: () => construirConfigPrueba() };
});

describe('PasoMedidas', () => {
  it('guía al paso 2 cuando no hay figura seleccionada', () => {
    montarPasos(<PasoMedidas />);
    expect(screen.getByText(/Selecciona primero una figura en el paso 2/)).toBeInTheDocument();
  });

  it('renderiza los campos de medida de la figura seleccionada', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-4' }));

    expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ancho/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Altura frontal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Retorno/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Cantidad/)).toBeInTheDocument();
  });

  it('la altura de los rodapiés de 7,2 y 8 se enseña, pero no se teclea', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-microbiselado' }));

    // La altura va en el nombre de la figura: se ve el valor y su etiqueta, pero
    // no hay campo donde escribirla (2026-07-31).
    expect(screen.getByText('Altura (cm)')).toBeInTheDocument();
    expect(screen.getByText(/la fija la figura/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Altura/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
  });

  it('la altura sigue siendo un campo normal en los rodapiés a medida', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-medida-recto' }));

    const altura = screen.getByLabelText(/^Altura/);
    fireEvent.change(altura, { target: { value: '12' } });
    expect(api().estado.medidas.altura).toBe('12');
  });

  /**
   * Segundo modo de cálculo (2026-07-31, indicación directa): metros + unidades.
   * El campo de los metros ocupa el hueco del largo y «Cantidad» pasa a llamarse
   * «Unidades», que es como se pide en este modo.
   */
  describe('modo de cálculo por metros', () => {
    it('solo lo ofrecen las figuras que se venden por metro lineal', () => {
      const { api } = montarPasos(<PasoMedidas />);
      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-4' }));
      expect(screen.queryByRole('radio', { name: /Por metros/ })).not.toBeInTheDocument();

      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));
      expect(screen.getByRole('radio', { name: 'Por metros y unidades' })).toBeInTheDocument();
    });

    it('al cambiar de modo el largo deja paso a los metros y la cantidad pasa a unidades', () => {
      const { api } = montarPasos(<PasoMedidas />);
      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));

      expect(screen.getByLabelText(/^Largo/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Cantidad/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('radio', { name: 'Por metros y unidades' }));

      expect(api().estado.modoMedida).toBe('metros');
      expect(screen.queryByLabelText(/^Largo/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Metros totales/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Unidades/)).toBeInTheDocument();
    });

    it('enseña el largo que sale de repartir los metros entre las unidades', () => {
      const { api } = montarPasos(<PasoMedidas />);
      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Por metros y unidades' }));

      fireEvent.change(screen.getByLabelText(/^Unidades/), { target: { value: '12' } });
      fireEvent.change(screen.getByLabelText(/^Metros totales/), { target: { value: '30' } });

      expect(screen.getByText('Cada pieza: 250 cm · total 30 m')).toBeInTheDocument();
    });

    it('el redondeo a milímetros se ve en el total resultante', () => {
      const { api } = montarPasos(<PasoMedidas />);
      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Por metros y unidades' }));

      // 10 m en 3 unidades = 333,333… cm → 333,3 cm por pieza, 9,999 m en total.
      fireEvent.change(screen.getByLabelText(/^Unidades/), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(/^Metros totales/), { target: { value: '10' } });

      expect(screen.getByText('Cada pieza: 333,3 cm · total 9,999 m')).toBeInTheDocument();
    });

    it('volver al modo normal conserva lo tecleado en cada uno', () => {
      const { api } = montarPasos(<PasoMedidas />);
      act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-72-romado' }));
      fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '80' } });

      fireEvent.click(screen.getByRole('radio', { name: 'Por metros y unidades' }));
      fireEvent.change(screen.getByLabelText(/^Metros totales/), { target: { value: '30' } });

      fireEvent.click(screen.getByRole('radio', { name: 'Por largo y cantidad' }));
      expect(screen.getByLabelText(/^Largo/)).toHaveValue('80');
      expect(api().estado.metrosTotales).toBe('30');
    });
  });

  it('muestra el error concreto del motor junto a su campo', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    const cantidad = screen.getByLabelText(/^Cantidad/);
    fireEvent.change(cantidad, { target: { value: '0' } });

    // El mensaje concreto aparece en el propio campo Cantidad, marcado como inválido.
    expect(
      screen.getByText('La cantidad debe ser un número entero mayor que 0.'),
    ).toBeInTheDocument();
    expect(cantidad).toHaveClass('border-red-400');
  });

  it('recién elegida la figura no enseña «obligatoria» sin haber tecleado nada', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    // Las medidas están vacías (recién elegida la figura): no debe verse ningún error todavía,
    // aunque el motor internamente ya devuelva "obligatoria" (medidasTecleadas lo oculta).
    expect(screen.queryByText(/es obligatoria/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Largo/)).not.toHaveClass('border-red-400');
  });

  it('teclear en una medida NO pinta en rojo las demás, que aún no ha tocado', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '100' } });

    expect(screen.queryByText('«Ancho» es obligatoria.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Ancho/)).not.toHaveClass('border-red-400');
  });

  it('al salir de una medida dejándola vacía, esa sí se marca (y solo esa)', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText(/^Ancho/)); // pasa por Fondo y lo deja vacío

    expect(screen.getByText('«Ancho» es obligatoria.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ancho/)).toHaveClass('border-red-400');
    // «Altura frontal» sigue sin tocar: no se señala.
    expect(screen.queryByText('«Altura frontal» es obligatoria.')).not.toBeInTheDocument();
  });

  it('si se cierra el paso sin rellenarlo, al reabrirlo ya se ven todas las que faltan', () => {
    const { api, pasos } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    fireEvent.change(screen.getByLabelText(/^Largo/), { target: { value: '100' } });
    expect(screen.queryByText('«Ancho» es obligatoria.')).not.toBeInTheDocument();

    act(() => pasos().alternar(3)); // el comercial cierra el paso: lo ha saltado
    act(() => pasos().alternar(3)); // y vuelve

    expect(screen.getByText('«Ancho» es obligatoria.')).toBeInTheDocument();
    expect(screen.getByText('«Altura frontal» es obligatoria.')).toBeInTheDocument();
  });

  it('cambiar de figura vuelve a empezar sin campos marcados', () => {
    const { api, pasos } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarMaterial', material: materialPrueba() }));
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));
    act(() => pasos().alternar(3));
    act(() => pasos().alternar(3));
    expect(screen.getByText('«Ancho» es obligatoria.')).toBeInTheDocument();

    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-2' }));

    expect(screen.queryByText(/es obligatoria/)).not.toBeInTheDocument();
  });
});
