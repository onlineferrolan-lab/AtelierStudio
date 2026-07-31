/**
 * Comentarios para taller: el texto libre y el clip que engancha documentos.
 *
 * El `<input type="file">` está oculto (se llega por el botón del clip), así que
 * los tests le ponen los archivos a mano y disparan 'change' — es lo que hace el
 * navegador al elegir en el diálogo, que jsdom no abre.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import { MAX_ADJUNTOS, MAX_BYTES_ADJUNTO } from '../../../../src/orden/adjuntos';
import { Comentarios } from '../../../../src/ui/steps/Comentarios';
import { montarPasos } from './utilidades-prueba';

function archivo(nombre: string, tipo: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

/** Simula elegir archivos en el diálogo del sistema. */
function elegir(...archivos: File[]): void {
  const entrada = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (entrada === null) throw new Error('No se encontró el selector de archivos');
  Object.defineProperty(entrada, 'files', { value: archivos, configurable: true });
  fireEvent.change(entrada);
}

describe('Comentarios', () => {
  it('escribe los comentarios en el estado de la orden', () => {
    const { api } = montarPasos(<Comentarios />);
    // Por rol: «Comentarios para taller» es también el aria-label de la tarjeta.
    fireEvent.change(screen.getByRole('textbox', { name: 'Comentarios para taller' }), {
      target: { value: 'Cortar el frontal a 45°' },
    });
    expect(api().estado.comentarios).toBe('Cortar el frontal a 45°');
  });

  it('el clip adjunta el documento elegido y lo lista con su tamaño', async () => {
    const { api } = montarPasos(<Comentarios />);
    expect(screen.getByLabelText('Adjuntar documentos')).toBeInTheDocument();

    elegir(archivo('plano.png', 'image/png', 2048));

    expect(await screen.findByText('plano.png')).toBeInTheDocument();
    expect(screen.getByText('2 kB')).toBeInTheDocument();
    expect(api().estado.adjuntos).toHaveLength(1);
    expect(api().estado.adjuntos[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  /**
   * Lo que distingue a un adjunto: las imágenes salen como página de la orden de
   * trabajo; el resto solo se cita por nombre y hay que mandarlo aparte. El
   * comercial tiene que verlo ANTES de dar la orden por enviada.
   */
  it('avisa de qué adjuntos viajan en el PDF y cuáles van aparte', async () => {
    montarPasos(<Comentarios />);
    elegir(archivo('plano.png', 'image/png'), archivo('medicion.pdf', 'application/pdf'));

    expect(await screen.findByText('plano.png')).toBeInTheDocument();
    expect(screen.getByText('En el PDF')).toBeInTheDocument();
    expect(screen.getByText('Aparte')).toBeInTheDocument();
  });

  it('quita un adjunto sin tocar los demás', async () => {
    const { api } = montarPasos(<Comentarios />);
    elegir(archivo('plano.png', 'image/png'), archivo('foto.jpg', 'image/jpeg'));
    await screen.findByText('plano.png');

    fireEvent.click(screen.getByLabelText('Quitar plano.png'));

    expect(screen.queryByText('plano.png')).not.toBeInTheDocument();
    expect(screen.getByText('foto.jpg')).toBeInTheDocument();
    expect(api().estado.adjuntos).toHaveLength(1);
  });

  it('rechaza el archivo que pasa del tope de tamaño y no lo adjunta', async () => {
    const { api } = montarPasos(<Comentarios />);
    elegir(archivo('enorme.jpg', 'image/jpeg', MAX_BYTES_ADJUNTO + 1));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '«enorme.jpg» pesa 5 MB; el máximo por documento es 5 MB.',
    );
    expect(api().estado.adjuntos).toEqual([]);
  });

  /**
   * Con el cupo lleno el clip se deshabilita, pero el tope se aplica igual al
   * añadir de golpe: los data URL viven en memoria y el estado se copia en cada
   * tecla del formulario.
   */
  it('no pasa del máximo de documentos y deshabilita el clip al llenarse', async () => {
    const { api } = montarPasos(<Comentarios />);
    const muchos = Array.from({ length: MAX_ADJUNTOS + 2 }, (_, i) =>
      archivo(`plano-${i}.png`, 'image/png'),
    );
    elegir(...muchos);

    expect(await screen.findByText('plano-0.png')).toBeInTheDocument();
    expect(api().estado.adjuntos).toHaveLength(MAX_ADJUNTOS);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Solo se pueden adjuntar 6 documentos por orden.',
    );
    expect(screen.getByLabelText('Adjuntar documentos')).toBeDisabled();
  });

  /**
   * Los adjuntos son de la ORDEN, no de la pieza: igual que los comentarios,
   * cambiar de figura no los borra (el reductor sí vacía medidas y suplementos).
   */
  it('cambiar de figura no borra los adjuntos ni los comentarios', async () => {
    const { api } = montarPasos(<Comentarios />);
    elegir(archivo('plano.png', 'image/png'));
    await screen.findByText('plano.png');
    act(() => api().dispatch({ tipo: 'cambiarComentarios', comentarios: 'Aviso' }));

    act(() => api().dispatch({ tipo: 'seleccionarFigura', figuraId: 'figura-1' }));

    expect(api().estado.adjuntos).toHaveLength(1);
    expect(api().estado.comentarios).toBe('Aviso');
    expect(screen.getByText('plano.png')).toBeInTheDocument();
  });

  it('reiniciar la cotización se lleva los adjuntos', async () => {
    const { api } = montarPasos(<Comentarios />);
    elegir(archivo('plano.png', 'image/png'));
    await screen.findByText('plano.png');

    act(() => api().dispatch({ tipo: 'reiniciar' }));

    expect(api().estado.adjuntos).toEqual([]);
    expect(screen.queryByText('plano.png')).not.toBeInTheDocument();
  });
});
