/**
 * Materiales de la pieza: textura del material (imagen PrestaShop) o gris
 * neutro cuando no hay imagen o falla la carga (§1 "Visor 3D": el fallo de
 * textura NO bloquea; se avisa con la insignia «Textura no disponible»).
 *
 * La textura se ESCALA PARA AJUSTAR a la pieza (indicación del encargo,
 * 2026-07-29, que reemplaza al "mapeo a escala real" de 2026-07-28): la
 * imagen completa cubre la caja envolvente de la pieza (uv ∈ [0,1] por eje
 * dominante), con la misma escala en todas las caras y sin repetir
 * (`ClampToEdgeWrapping`). Heurística solo visual, sin efecto en cálculo.
 */

import * as THREE from 'three';

/** Material neutro gris (sin textura o textura fallida). */
export function crearMaterialNeutro(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#9aa4b2', roughness: 0.85, metalness: 0.02 });
}

/**
 * Carga la textura con CORS anónimo (las imágenes vienen del web service de
 * PrestaShop, §1.①). Rechaza la promesa si la carga falla: el llamador cae
 * entonces al material neutro + aviso. Sin repetición: la imagen se ajusta a
 * la pieza, nunca se tilea (ver cabecera del módulo).
 */
export async function cargarTextura(url: string): Promise<THREE.Texture> {
  const cargador = new THREE.TextureLoader();
  cargador.setCrossOrigin('anonymous');
  const textura = await cargador.loadAsync(url);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = THREE.ClampToEdgeWrapping;
  textura.wrapT = THREE.ClampToEdgeWrapping;
  textura.anisotropy = 8;
  return textura;
}

/**
 * Reescribe los UV de la geometría para que la textura AJUSTE a la pieza:
 * uv = (coordenada − mínimo) / dimensión de la caja envolvente, por vértice,
 * usando como ejes de textura los dos ejes dominantes de cada cara. Resultado:
 * uv ∈ [0,1] en toda la pieza — la imagen completa cubre la caja envolvente
 * con la misma escala en todas las caras (sin estiramientos por cara ni
 * mosaico). Heurística solo visual, sin efecto en cálculo.
 */
export function remapearUvAAjuste(geometria: THREE.BufferGeometry): void {
  if (!geometria.getAttribute('normal')) geometria.computeVertexNormals();
  geometria.computeBoundingBox();
  const caja = geometria.boundingBox;
  const posiciones = geometria.getAttribute('position');
  const normales = geometria.getAttribute('normal');
  if (!caja || !posiciones || !normales) return;
  const tamX = caja.max.x - caja.min.x || 1;
  const tamY = caja.max.y - caja.min.y || 1;
  const tamZ = caja.max.z - caja.min.z || 1;
  const uv = new Float32Array(posiciones.count * 2);
  for (let i = 0; i < posiciones.count; i += 1) {
    const nx = Math.abs(normales.getX(i));
    const ny = Math.abs(normales.getY(i));
    const nz = Math.abs(normales.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      // Cara lateral (normal ±X): textura sobre (z, y).
      u = (posiciones.getZ(i) - caja.min.z) / tamZ;
      v = (posiciones.getY(i) - caja.min.y) / tamY;
    } else if (ny >= nz) {
      // Cara horizontal (normal ±Y): textura sobre (x, z).
      u = (posiciones.getX(i) - caja.min.x) / tamX;
      v = (posiciones.getZ(i) - caja.min.z) / tamZ;
    } else {
      // Cara frontal/trasera (normal ±Z): textura sobre (x, y).
      u = (posiciones.getX(i) - caja.min.x) / tamX;
      v = (posiciones.getY(i) - caja.min.y) / tamY;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometria.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function sustituirMaterial(mesh: THREE.Mesh, material: THREE.Material): void {
  const anterior = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(anterior)) {
    for (const m of anterior) m.dispose();
  } else {
    anterior.dispose();
  }
  mesh.material = material;
}

/**
 * Aplica la textura a todas las mallas de la pieza, liberando los materiales
 * neutros anteriores. Los UV se remapean antes para que la imagen ajuste a la
 * caja envolvente de la pieza (ver `remapearUvAAjuste`).
 */
export function aplicarTextura(malla: THREE.Group, textura: THREE.Texture): void {
  const materialBase = new THREE.MeshStandardMaterial({
    map: textura,
    roughness: 0.85,
    metalness: 0.02,
  });
  malla.traverse((objeto) => {
    const mesh = objeto as THREE.Mesh;
    if (!mesh.isMesh) return;
    remapearUvAAjuste(mesh.geometry);
    sustituirMaterial(mesh, materialBase);
  });
}
