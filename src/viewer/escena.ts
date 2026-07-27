/**
 * Escena three.js del visor: renderer, cámara, luces y OrbitControls.
 *
 * La escena se crea UNA vez por montaje del componente y se destruye entera al
 * desmontar (renderer, contexto WebGL, controles, observador y bucle). Al
 * cambiar figura/medidas/textura solo se sustituye el grupo de la pieza con
 * `establecerPieza`, que libera los recursos del grupo anterior.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { liberarObjeto } from './recursos';

const COLOR_FONDO = '#f1f5f9'; // slate-100: fondo neutro claro (§1 "Visor 3D")

export class EscenaVisor {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara: THREE.PerspectiveCamera;
  private readonly controles: OrbitControls;
  private readonly observador: ResizeObserver;
  private raiz: THREE.Object3D | null = null;
  private vistaInicial: { posicion: THREE.Vector3; objetivo: THREE.Vector3 } | null = null;
  private fotograma = 0;
  private destruida = false;

  constructor(private readonly contenedor: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const ancho = Math.max(contenedor.clientWidth, 1);
    const alto = Math.max(contenedor.clientHeight, 1);
    this.renderer.setSize(ancho, alto);
    contenedor.appendChild(this.renderer.domElement);

    this.escena.background = new THREE.Color(COLOR_FONDO);
    this.camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.1, 4000);
    this.camara.position.set(30, 24, 36);

    // Pieza aislada: luz ambiental suave + dos direccionales, sin suelo ni sombras.
    this.escena.add(new THREE.HemisphereLight(0xffffff, 0xd6d3d1, 1.15));
    const principal = new THREE.DirectionalLight(0xffffff, 1.9);
    principal.position.set(35, 55, 40);
    this.escena.add(principal);
    const relleno = new THREE.DirectionalLight(0xffffff, 0.65);
    relleno.position.set(-40, 25, -35);
    this.escena.add(relleno);

    // Rotar + zoom (§1); el desplazamiento lateral queda desactivado para no
    // perder la pieza de vista.
    this.controles = new OrbitControls(this.camara, this.renderer.domElement);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.enablePan = false;
    this.controles.maxDistance = 1500;

    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(contenedor);

    const bucle = (): void => {
      if (this.destruida) return;
      this.fotograma = requestAnimationFrame(bucle);
      this.controles.update();
      this.renderer.render(this.escena, this.camara);
    };
    bucle();
  }

  /** Sustituye la pieza mostrada liberando la anterior, y encuadra la cámara. */
  establecerPieza(raiz: THREE.Object3D | null): void {
    if (this.raiz) {
      this.escena.remove(this.raiz);
      liberarObjeto(this.raiz);
      this.raiz = null;
    }
    if (raiz) {
      this.raiz = raiz;
      this.escena.add(raiz);
      this.encuadrar(raiz);
    }
  }

  /** Encuadra la pieza (con sus cotas) en la vista y guarda la vista inicial. */
  private encuadrar(objetivo: THREE.Object3D): void {
    objetivo.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(objetivo);
    if (caja.isEmpty()) return;
    const centro = caja.getCenter(new THREE.Vector3());
    const tamano = caja.getSize(new THREE.Vector3());
    const radio = Math.max(tamano.length() / 2, 1);
    const distancia = (radio / Math.tan(THREE.MathUtils.degToRad(this.camara.fov / 2))) * 1.25;
    const direccion = new THREE.Vector3(1, 0.62, 1.25).normalize();
    this.camara.position.copy(centro).addScaledVector(direccion, distancia);
    this.camara.near = Math.max(distancia / 100, 0.1);
    this.camara.far = distancia * 100;
    this.camara.updateProjectionMatrix();
    this.controles.target.copy(centro);
    this.controles.update();
    this.vistaInicial = { posicion: this.camara.position.clone(), objetivo: centro.clone() };
  }

  /** Vuelve a la vista encuadrada inicial (botón «Restablecer cámara», §1). */
  restablecerCamara(): void {
    if (!this.vistaInicial) return;
    this.camara.position.copy(this.vistaInicial.posicion);
    this.controles.target.copy(this.vistaInicial.objetivo);
    this.controles.update();
  }

  redimensionar(): void {
    const ancho = this.contenedor.clientWidth;
    const alto = this.contenedor.clientHeight;
    if (this.destruida || ancho === 0 || alto === 0) return;
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    this.renderer.setSize(ancho, alto);
  }

  /** Destruye la escena entera: bucle, observador, controles, pieza y renderer. */
  dispose(): void {
    this.destruida = true;
    cancelAnimationFrame(this.fotograma);
    this.observador.disconnect();
    this.controles.dispose();
    this.establecerPieza(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
