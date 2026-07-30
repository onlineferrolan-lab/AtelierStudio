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

  it('usa control segmentado cuando la medida tiene opcionesCm', () => {
    const { api } = montarPasos(<PasoMedidas />);
    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'rodapie-estandar' }));

    // Altura de rodapié estándar: solo 7,2 u 8 cm (figuras.json).
    expect(screen.getByRole('radio', { name: '7,2' })).toBeInTheDocument();
    const opcion8 = screen.getByRole('radio', { name: '8' });
    fireEvent.click(opcion8);

    expect(api().estado.medidas.altura).toBe('8');
    expect(opcion8).toHaveAttribute('aria-checked', 'true');
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
