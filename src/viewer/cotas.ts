/**
 * Dibujo de cotas sobre la pieza 3D (§1 "Visor 3D": cotas visibles y legibles).
 *
 * Cada medida presente genera: dos extensiones desde la pieza, la línea de cota
 * con remates en los extremos y una etiqueta con el valor (`formatearCotaCm`).
 * Las etiquetas son sprites de canvas con `depthTest` desactivado a propósito:
 * se leen siempre, gire lo que gire la cámara, sin depender de overlays HTML
 * proyectados a mano (más frágiles con resize y zoom).
 */

import * as THREE from 'three';
import { formatearCotaCm } from '../domain/units';
import type { CotaPieza } from './geometria';

const COLOR_LINEA = 0x64748b; // slate-500, sobrio sobre fondo claro

/** Altura de la etiqueta en unidades de escena, acotada para piezas pequeñas/grandes. */
function altoEtiqueta(dimensionMaxima: number): number {
  return Math.min(Math.max(dimensionMaxima * 0.1, 1.6), 4);
}

/** Crea el sprite de texto; sin canvas 2D (tests headless) devuelve un sprite vacío. */
function crearSpriteTexto(texto: string, alto: number): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    sprite.scale.set(alto, alto, 1);
    return sprite;
  }
  const escala = 4; // supersampling para que el texto se vea nítido
  const fuentePx = 13 * escala;
  const fuente = `600 ${fuentePx}px Inter, system-ui, sans-serif`;
  ctx.font = fuente;
  const medido = ctx.measureText(texto);
  const padX = 8 * escala;
  const padY = 5 * escala;
  canvas.width = Math.ceil(medido.width + padX * 2);
  canvas.height = Math.ceil(fuentePx * 1.15 + padY * 2);
  // Tras cambiar el tamaño del canvas hay que reasignar la fuente.
  ctx.font = fuente;
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, 4 * escala);
  } else {
    ctx.rect(1, 1, canvas.width - 2, canvas.height - 2);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = escala / 2;
  ctx.stroke();
  ctx.fillStyle = '#334155';
  ctx.fillText(texto, padX, canvas.height / 2);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  material.map = textura;
  material.needsUpdate = true;
  const aspecto = canvas.width / canvas.height;
  sprite.scale.set(alto * aspecto, alto, 1);
  return sprite;
}

interface TrazadoCota {
  readonly extremos: [THREE.Vector3, THREE.Vector3];
  readonly anclajes: [THREE.Vector3, THREE.Vector3];
  readonly direccionRemate: THREE.Vector3;
  readonly desplazamientoEtiqueta: THREE.Vector3;
}

/** Coloca la línea de cota fuera de la pieza según su plano y la caja local. */
function trazarCota(cota: CotaPieza, caja: THREE.Box3, margen: number): TrazadoCota {
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const a1 = new THREE.Vector3();
  const a2 = new THREE.Vector3();
  p1.setComponent(cota.eje === 'x' ? 0 : cota.eje === 'y' ? 1 : 2, cota.desde);
  p2.setComponent(cota.eje === 'x' ? 0 : cota.eje === 'y' ? 1 : 2, cota.hasta);
  a1.copy(p1);
  a2.copy(p2);
  let direccionRemate: THREE.Vector3;
  let desplazamientoEtiqueta: THREE.Vector3;
  switch (cota.plano) {
    case 'frenteInferior':
      // Eje X, delante de la pieza y a la altura de su base.
      p1.z = p2.z = caja.max.z + margen;
      p1.y = p2.y = caja.min.y;
      a1.z = a2.z = caja.max.z;
      a1.y = a2.y = caja.min.y;
      direccionRemate = new THREE.Vector3(0, 1, 0);
      desplazamientoEtiqueta = new THREE.Vector3(0, 0, margen * 0.9);
      break;
    case 'lateralDerecho':
      // Eje Z, a la derecha de la pieza y a la altura de su base.
      p1.x = p2.x = caja.max.x + margen;
      p1.y = p2.y = caja.min.y;
      a1.x = a2.x = caja.max.x;
      a1.y = a2.y = caja.min.y;
      direccionRemate = new THREE.Vector3(0, 1, 0);
      desplazamientoEtiqueta = new THREE.Vector3(margen * 0.9, 0, 0);
      break;
    case 'lateralIzquierdo':
      // Eje Z por la izquierda (retorno de la Figura 4, para no chocar con el fondo).
      p1.x = p2.x = caja.min.x - margen;
      p1.y = p2.y = caja.min.y;
      a1.x = a2.x = caja.min.x;
      a1.y = a2.y = caja.min.y;
      direccionRemate = new THREE.Vector3(0, 1, 0);
      desplazamientoEtiqueta = new THREE.Vector3(-margen * 0.9, 0, 0);
      break;
    case 'verticalFrontal':
      // Eje Y, en la esquina delantera derecha.
      p1.x = p2.x = caja.max.x + margen;
      p1.z = p2.z = caja.max.z;
      a1.x = a2.x = caja.max.x;
      a1.z = a2.z = caja.max.z;
      direccionRemate = new THREE.Vector3(1, 0, 0);
      desplazamientoEtiqueta = new THREE.Vector3(margen * 0.9, 0, 0);
      break;
  }
  return { extremos: [p1, p2], anclajes: [a1, a2], direccionRemate, desplazamientoEtiqueta };
}

/**
 * Construye el grupo de cotas (líneas + etiquetas) para la pieza centrada.
 * Los recursos creados se liberan con `liberarObjeto` al sustituir la pieza.
 */
export function crearGrupoCotas(
  cotas: readonly CotaPieza[],
  caja: THREE.Box3,
  dimensionMaxima: number,
): THREE.Group {
  const grupo = new THREE.Group();
  if (cotas.length === 0) return grupo;

  const margen = Math.max(dimensionMaxima * 0.12, 1.4);
  const remate = Math.max(dimensionMaxima * 0.035, 0.4);
  const alto = altoEtiqueta(dimensionMaxima);
  const puntos: number[] = [];
  const empujar = (a: THREE.Vector3, b: THREE.Vector3): void => {
    puntos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  };

  for (const cota of cotas) {
    const { extremos, anclajes, direccionRemate, desplazamientoEtiqueta } = trazarCota(
      cota,
      caja,
      margen,
    );
    const [p1, p2] = extremos;
    // Línea de cota, extensiones desde la pieza y remates en los extremos.
    empujar(p1, p2);
    empujar(anclajes[0], p1);
    empujar(anclajes[1], p2);
    const r1a = p1.clone().addScaledVector(direccionRemate, remate);
    const r1b = p1.clone().addScaledVector(direccionRemate, -remate);
    const r2a = p2.clone().addScaledVector(direccionRemate, remate);
    const r2b = p2.clone().addScaledVector(direccionRemate, -remate);
    empujar(r1a, r1b);
    empujar(r2a, r2b);

    const etiqueta = crearSpriteTexto(formatearCotaCm(cota.valorMm), alto);
    etiqueta.position.copy(p1).add(p2).multiplyScalar(0.5).add(desplazamientoEtiqueta);
    grupo.add(etiqueta);
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
  const lineas = new THREE.LineSegments(
    geometria,
    new THREE.LineBasicMaterial({ color: COLOR_LINEA }),
  );
  lineas.renderOrder = 10;
  grupo.add(lineas);
  return grupo;
}
