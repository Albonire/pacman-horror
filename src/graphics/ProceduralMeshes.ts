import * as THREE from "three";
import { COLORS } from "../config/constants";

export interface GhostBuild {
  group: THREE.Group;
  materials: THREE.Material[];
  bodyParts: THREE.Object3D[]; // partes que se ocultan cuando es comido
  eyes: THREE.Mesh[];
}

function std(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.1,
    ...opts,
  });
}

// ---------- EL ACECHADOR (Blinky) : silueta alta facetada oscura ----------
export function makeAcechador(): GhostBuild {
  const group = new THREE.Group();
  const mat = std(COLORS.ghostRed, { roughness: 1, metalness: 0.3, emissive: 0x220000, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), mat);
  body.scale.set(0.9, 2.1, 0.7);
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);

  // aristas estáticas
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.5 })
  );
  edges.scale.copy(body.scale);
  edges.position.y = 1.15;
  group.add(edges);
  (group.userData as Record<string, unknown>).edges = edges;

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat);
  head.position.y = 2.45;
  group.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2018, emissive: 0xff2018, emissiveIntensity: 2.2 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.12, 2.5, 0.16);
  e2.position.set(0.12, 2.5, 0.16);
  group.add(e1, e2);

  const light = new THREE.PointLight(0xff2a1a, 0.6, 6, 2);
  light.position.y = 1.4;
  group.add(light);

  return { group, materials: [mat, edges.material as THREE.Material], bodyParts: [body, edges, head], eyes: [e1, e2] };
}

// ---------- EL INTERCEPTOR (Pinky) : figura pálida angular ----------
export function makeInterceptor(): GhostBuild {
  const group = new THREE.Group();
  const mat = std(COLORS.ghostPale, { roughness: 0.9, emissive: 0x201a10, emissiveIntensity: 0.25 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.82, 0.36), mat);
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.34), mat);
  head.position.y = 1.62;
  group.add(head);
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  const armL = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.36, 1.0, 0);
  armL.rotation.z = 0.35;
  const armR = armL.clone();
  armR.position.x = 0.36;
  armR.rotation.z = -0.35;
  group.add(armL, armR);
  const legGeo = new THREE.BoxGeometry(0.14, 0.5, 0.14);
  const legL = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.16, 0.25, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legL, legR);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: 0x331100, emissiveIntensity: 1.2 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.09, 1.68, 0.16);
  e2.position.set(0.09, 1.68, 0.16);
  group.add(e1, e2);

  const light = new THREE.PointLight(0xe8ddc8, 0.5, 5, 2);
  light.position.y = 1.3;
  group.add(light);

  return { group, materials: [mat], bodyParts: [torso, head, armL, armR, legL, legR], eyes: [e1, e2] };
}

// ---------- EL RESONADOR (Inky) : anillos concéntricos oxidados ----------
export function makeResonador(): GhostBuild {
  const group = new THREE.Group();
  const mat = std(COLORS.ghostRing, { roughness: 0.6, metalness: 0.7, emissive: 0x2a1408, emissiveIntensity: 0.5 });
  const rings: THREE.Mesh[] = [];
  const radii = [0.52, 0.38, 0.24];
  radii.forEach((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 24), mat);
    ring.rotation.x = Math.PI / 2 * (i === 1 ? 0.6 : 1);
    ring.rotation.y = i * 0.5;
    ring.position.y = 1.1;
    ring.castShadow = true;
    group.add(ring);
    rings.push(ring);
  });
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.14, 0),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.6 })
  );
  core.position.y = 1.1;
  group.add(core);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff8800, emissiveIntensity: 2 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.1, 1.2, 0.4);
  e2.position.set(0.1, 1.2, 0.4);
  group.add(e1, e2);

  const light = new THREE.PointLight(0xff7a2a, 0.7, 6, 2);
  light.position.y = 1.1;
  group.add(light);

  return { group, materials: [mat], bodyParts: [...rings, core], eyes: [e1, e2] };
}

// ---------- EL ESTÁTICO (Clyde) : maniquí con ruido blanco ----------
export function makeEstatico(staticTex: THREE.Texture): GhostBuild {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.ghostStatic,
    map: staticTex,
    roughness: 1,
    metalness: 0,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.7, 4, 8), mat);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat);
  head.position.y = 1.62;
  group.add(head);
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.5, 3, 6);
  const armL = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.3, 1.05, 0);
  armL.rotation.z = 0.5;
  const armR = armL.clone();
  armR.position.x = 0.3;
  armR.rotation.z = -0.5;
  group.add(armL, armR);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x000000 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
  const e2 = e1.clone();
  e1.position.set(-0.08, 1.66, 0.18);
  e2.position.set(0.08, 1.66, 0.18);
  group.add(e1, e2);

  const light = new THREE.PointLight(0xcfc9ba, 0.45, 5, 2);
  light.position.y = 1.3;
  group.add(light);

  return { group, materials: [mat], bodyParts: [body, head, armL, armR], eyes: [e1, e2] };
}

// ---------- CUERPO DEL JUGADOR (visible en iso) ----------
export function makePlayerBody(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3a3a, roughness: 0.8, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.7, 4, 8), mat);
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c2626, roughness: 0.9 })
  );
  head.position.y = 1.5;
  g.add(head);
  return g;
}

// ---------- PUERTA DE SALIDA ----------
export function makeExitDoor(unlocked: boolean): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.7, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 })
  );
  frame.position.y = 1.35;
  g.add(frame);
  const doorMat = new THREE.MeshStandardMaterial({
    color: unlocked ? COLORS.exitOpen : COLORS.exitLocked,
    emissive: unlocked ? COLORS.exitOpen : 0x330000,
    emissiveIntensity: unlocked ? 1.2 : 0.5,
    roughness: 0.7,
    metalness: 0.3,
  });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), doorMat);
  door.position.y = 1.2;
  door.name = "doorPanel";
  g.add(door);
  const light = new THREE.PointLight(unlocked ? COLORS.exitOpen : 0xff3322, unlocked ? 1.2 : 0.5, 7, 2);
  light.position.set(0, 1.4, 0.4);
  g.add(light);
  return g;
}

// ---------- CAJA ELÉCTRICA (power pellet) ----------
export function makePowerBox(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.7, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x3a3428, roughness: 0.7, metalness: 0.4 })
  );
  box.position.y = 0.6;
  box.castShadow = true;
  g.add(box);
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff4400, emissiveIntensity: 1.4, roughness: 0.4 })
  );
  panel.position.set(0, 0.6, 0.22);
  g.add(panel);
  const light = new THREE.PointLight(0xff5a1f, 0.8, 5, 2);
  light.position.set(0, 0.7, 0.4);
  g.add(light);
  return g;
}
