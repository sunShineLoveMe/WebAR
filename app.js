import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

const container = document.querySelector("#ar-container");
const statusText = document.querySelector("#status-text");
const startButton = document.querySelector("#start-btn");

const helloAudio = new Audio("./assets/hello.mp3");
const introAudio = new Audio("./assets/intro.mp3");
helloAudio.preload = "auto";
introAudio.preload = "auto";
helloAudio.volume = 0.82;
introAudio.volume = 1.0;

const STAGE = {
  IDLE: "idle",
  CITY_LIGHT_UP: "city_light_up",
  CHARACTER_ENTRANCE: "character_entrance",
  INTERACTIVE: "interactive"
};

const lowPowerDevice =
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

let model;
let modelRoot;
let modelReady = false;
let baseY = 0.32;

let stage = STAGE.IDLE;
let stageElapsed = 0;
let targetVisible = false;
let audioUnlocked = false;
let helloPlayedThisRound = false;
let introPlaying = false;
let animationFrameId = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

const mindARThree = new MindARThree({
  container,
  imageTargetSrc: "./assets/targets.mind"
});

const { renderer, scene, camera } = mindARThree;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPowerDevice ? 1.7 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.AmbientLight(0x89b7ff, 0.75));
const keyLight = new THREE.DirectionalLight(0xc8f6ff, 1.1);
keyLight.position.set(0.6, 1.5, 0.5);
scene.add(keyLight);

const anchor = mindARThree.addAnchor(0);
const loader = new GLTFLoader();

// ---------- City FX layers ----------
const cityRoot = new THREE.Group();
cityRoot.visible = false;
anchor.group.add(cityRoot);

const cityPlate = new THREE.Mesh(
  new THREE.CylinderGeometry(0.78, 0.84, 0.06, 64),
  new THREE.MeshStandardMaterial({
    color: 0x0a1230,
    emissive: 0x103f91,
    emissiveIntensity: 0.08,
    metalness: 0.25,
    roughness: 0.55
  })
);
cityPlate.position.y = 0.03;
cityRoot.add(cityPlate);

const roadRing = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.72, 96),
  new THREE.MeshBasicMaterial({
    color: 0x4dd2ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
roadRing.rotation.x = -Math.PI / 2;
roadRing.position.y = 0.062;
cityRoot.add(roadRing);

const sweepRing = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.24, 64),
  new THREE.MeshBasicMaterial({
    color: 0x8efaff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
sweepRing.rotation.x = -Math.PI / 2;
sweepRing.position.y = 0.065;
cityRoot.add(sweepRing);

const landmarks = [];
const neonLineMtl = new THREE.LineBasicMaterial({
  color: 0x77f0ff,
  transparent: true,
  opacity: 0.15
});
const createNeonTowerMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: 0x112a4e,
    emissive: 0x45d4ff,
    emissiveIntensity: 0,
    metalness: 0.25,
    roughness: 0.35
  });

const addLandmark = (name, group, triggerAt, targetIntensity) => {
  const meshes = [];
  group.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  group.userData = { name, triggerAt, targetIntensity, meshes };
  cityRoot.add(group);
  landmarks.push(group);
};

// 东方明珠（科幻霓虹版）
const pearl = new THREE.Group();
pearl.position.set(-0.24, 0.065, 0.1);
const pearlMast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 20), createNeonTowerMaterial());
pearlMast.position.y = 0.22;
const pearlBottomSphere = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 24), createNeonTowerMaterial());
pearlBottomSphere.position.y = 0.14;
const pearlTopSphere = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 24), createNeonTowerMaterial());
pearlTopSphere.position.y = 0.31;
const pearlCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.07, 20), createNeonTowerMaterial());
pearlCrown.position.y = 0.41;
pearl.add(pearlMast, pearlBottomSphere, pearlTopSphere, pearlCrown);
pearl.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.03, 0.02, 0.07, 20)), neonLineMtl));
addLandmark("pearl", pearl, 0.08, 1.1);

// 上海中心（流线高塔）
const tower = new THREE.Group();
tower.position.set(0.02, 0.065, 0.02);
const towerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.034, 0.64, 28), createNeonTowerMaterial());
towerBody.position.y = 0.32;
towerBody.rotation.y = 0.3;
const towerTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 20), createNeonTowerMaterial());
towerTip.position.y = 0.68;
tower.add(towerBody, towerTip);
tower.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.058, 0.034, 0.64, 16)), neonLineMtl));
addLandmark("shanghai-tower", tower, 0.34, 1.35);

// 环球金融中心（开瓶器轮廓）
const swfc = new THREE.Group();
swfc.position.set(0.24, 0.065, 0.05);
const swfcBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.08), createNeonTowerMaterial());
swfcBody.position.y = 0.29;
const swfcHole = new THREE.Mesh(
  new THREE.BoxGeometry(0.058, 0.06, 0.09),
  new THREE.MeshStandardMaterial({ color: 0x03050b, emissive: 0x112235, emissiveIntensity: 0.2 })
);
swfcHole.position.y = 0.53;
const swfcTopFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.08), createNeonTowerMaterial());
swfcTopFrame.position.y = 0.56;
swfc.add(swfcBody, swfcHole, swfcTopFrame);
swfc.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.12, 0.58, 0.08)), neonLineMtl));
addLandmark("swfc", swfc, 0.62, 1.25);

const particleCount = lowPowerDevice ? 180 : 420;
const particleGeom = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
const particleVel = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i += 1) {
  const radius = 0.18 + Math.random() * 0.55;
  const angle = Math.random() * Math.PI * 2;
  particlePos[i * 3] = Math.cos(angle) * radius;
  particlePos[i * 3 + 1] = 0.08 + Math.random() * 0.45;
  particlePos[i * 3 + 2] = Math.sin(angle) * radius;
  particleVel[i] = 0.0009 + Math.random() * 0.0022;
}
particleGeom.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
const particles = new THREE.Points(
  particleGeom,
  new THREE.PointsMaterial({
    color: 0x89e7ff,
    size: lowPowerDevice ? 0.006 : 0.008,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
cityRoot.add(particles);

// ---------- Character + portal FX ----------
const characterContainer = new THREE.Group();
characterContainer.visible = false;
anchor.group.add(characterContainer);

const portalRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.24, 0.018, 16, 84),
  new THREE.MeshBasicMaterial({
    color: 0x63ddff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
portalRing.rotation.x = Math.PI / 2;
portalRing.position.y = 0.08;
characterContainer.add(portalRing);

const portalBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.09, 0.18, 0.65, 42, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x4db9ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
portalBeam.position.y = 0.36;
characterContainer.add(portalBeam);

const portalCoreBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.07, 0.62, 26, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xa4f7ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
portalCoreBeam.position.y = 0.35;
characterContainer.add(portalCoreBeam);

const clickPulse = new THREE.Mesh(
  new THREE.RingGeometry(0.09, 0.12, 48),
  new THREE.MeshBasicMaterial({
    color: 0x9ffbff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
clickPulse.rotation.x = -Math.PI / 2;
clickPulse.position.y = 0.07;
characterContainer.add(clickPulse);

let clickPulseT = 1;

const setStatus = (text) => {
  statusText.textContent = text;
};

const resetCity = () => {
  cityPlate.material.emissiveIntensity = 0.08;
  roadRing.material.opacity = 0.1;
  sweepRing.material.opacity = 0;
  sweepRing.scale.setScalar(1);

  for (const l of landmarks) {
    for (const mesh of l.userData.meshes) {
      if ("emissiveIntensity" in mesh.material) {
        mesh.material.emissiveIntensity = 0;
      }
    }
  }

  particles.material.opacity = 0.12;
};

const resetCharacter = () => {
  if (!modelRoot) return;

  characterContainer.visible = false;
  modelRoot.visible = false;
  modelRoot.position.set(0, baseY, 0);
  modelRoot.scale.setScalar(0.08);
  modelRoot.rotation.set(0, 0, 0);

  portalRing.material.opacity = 0;
  portalBeam.material.opacity = 0;
  portalCoreBeam.material.opacity = 0;
  clickPulse.material.opacity = 0;
  clickPulse.scale.setScalar(1);
  clickPulseT = 1;
};

const switchStage = (nextStage) => {
  stage = nextStage;
  stageElapsed = 0;

  if (stage === STAGE.CITY_LIGHT_UP) {
    setStatus("城市亮起中...");
    cityRoot.visible = true;
    characterContainer.visible = false;
    resetCity();
    resetCharacter();
  }

  if (stage === STAGE.CHARACTER_ENTRANCE) {
    setStatus("光柱召唤沪小宝...");
    if (modelRoot) {
      characterContainer.visible = true;
      modelRoot.visible = true;
      modelRoot.scale.setScalar(0.08);
      modelRoot.position.set(0, baseY - 0.16, 0);
    }
  }

  if (stage === STAGE.INTERACTIVE) {
    setStatus("上海已点亮，点击沪小宝开始讲解");
    if (!helloPlayedThisRound) {
      helloPlayedThisRound = true;
      playHelloOnce();
    }
  }
};

loader.load(
  "./assets/huxiaobao.glb",
  (gltf) => {
    modelRoot = new THREE.Group();
    model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    model.position.x -= center.x;
    model.position.y -= box.min.y;
    model.position.z -= center.z;

    const targetHeight = 0.36;
    const scale = targetHeight / Math.max(size.y, 0.001);
    model.scale.setScalar(scale);

    modelRoot.add(model);
    modelRoot.position.set(0, baseY, 0);
    modelRoot.visible = false;
    characterContainer.add(modelRoot);
    modelReady = true;

    // If target was found before model finished loading, continue pipeline safely.
    if (targetVisible && stage === STAGE.CHARACTER_ENTRANCE) {
      characterContainer.visible = true;
      modelRoot.visible = true;
    }
  },
  undefined,
  (err) => {
    console.error("Failed to load huxiaobao.glb", err);
    setStatus("模型加载失败，请检查 assets/huxiaobao.glb");
  }
);

const unlockAudioIfNeeded = async () => {
  if (audioUnlocked) return;

  try {
    await helloAudio.play();
    helloAudio.pause();
    helloAudio.currentTime = 0;

    await introAudio.play();
    introAudio.pause();
    introAudio.currentTime = 0;

    audioUnlocked = true;
  } catch (error) {
    console.warn("Audio unlock blocked:", error);
  }
};

const playHelloOnce = async () => {
  if (!audioUnlocked || !targetVisible) return;

  try {
    helloAudio.currentTime = 0;
    await helloAudio.play();
  } catch (error) {
    console.warn("hello.mp3 playback failed:", error);
  }
};

const forEachMeshMaterial = (obj, fn) => {
  if (!obj.isMesh || !obj.material) return;
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) fn(m);
};

const playIntro = async () => {
  if (!audioUnlocked || !targetVisible || stage !== STAGE.INTERACTIVE) return;
  if (introPlaying) return;

  helloAudio.pause();
  helloAudio.currentTime = 0;

  introPlaying = true;
  setStatus("正在讲解上海亮点...");
  clickPulseT = 0;

  if (model) {
    model.traverse((obj) => {
      forEachMeshMaterial(obj, (mat) => {
        if (!("emissiveIntensity" in mat)) return;
        mat.emissive = new THREE.Color(0x86f5ff);
        mat.emissiveIntensity = 0.65;
      });
    });
  }

  try {
    introAudio.currentTime = 0;
    await introAudio.play();
  } catch (error) {
    console.warn("intro.mp3 playback failed:", error);
    introPlaying = false;
    setStatus("上海已点亮，点击沪小宝开始讲解");
  }
};

introAudio.addEventListener("ended", () => {
  introPlaying = false;
  setStatus("上海已点亮，点击沪小宝开始讲解");

  if (!model) return;
  model.traverse((obj) => {
    forEachMeshMaterial(obj, (mat) => {
      if (!("emissiveIntensity" in mat)) return;
      mat.emissiveIntensity = 0.06;
    });
  });
});

const onPointerDown = (event) => {
  if (!targetVisible || !model || stage !== STAGE.INTERACTIVE) return;

  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = -(event.clientY / window.innerHeight) * 2 + 1;
  pointer.set(x, y);

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObject(model, true);
  if (intersects.length > 0) {
    playIntro();
  }
};
renderer.domElement.addEventListener("pointerdown", onPointerDown);

anchor.onTargetFound = () => {
  targetVisible = true;
  helloPlayedThisRound = false;
  introPlaying = false;
  introAudio.pause();
  introAudio.currentTime = 0;

  switchStage(STAGE.CITY_LIGHT_UP);
};

anchor.onTargetLost = () => {
  targetVisible = false;
  stage = STAGE.IDLE;
  stageElapsed = 0;

  introPlaying = false;
  introAudio.pause();
  introAudio.currentTime = 0;

  cityRoot.visible = false;
  resetCharacter();
  setStatus("扫描图片，点亮上海");
};

const start = async () => {
  startButton.disabled = true;
  setStatus("正在启动 AR 相机...");

  if (!window.isSecureContext) {
    setStatus("移动端需要 HTTPS 访问 AR 页面，请更换 https:// 链接");
    startButton.disabled = false;
    return;
  }

  await unlockAudioIfNeeded();

  try {
    await mindARThree.start();
    startButton.classList.add("hidden");
    setStatus("扫描图片，点亮上海");
    loop();
  } catch (error) {
    console.error("MindAR failed to start", error);
    startButton.disabled = false;
    setStatus("AR 启动失败：请检查相机权限、HTTPS 与 Safari 设置");
  }
};
startButton.addEventListener("click", start);

const animateCity = (elapsed, dt) => {
  const cityProgress = Math.min(elapsed / 1.25, 1);
  cityPlate.material.emissiveIntensity = 0.08 + cityProgress * 0.95;
  roadRing.material.opacity = 0.14 + cityProgress * 0.36;

  // Progressive light-up for Shanghai's three iconic towers in neon style.
  for (const l of landmarks) {
    const local = THREE.MathUtils.clamp((cityProgress - l.userData.triggerAt) / 0.24, 0, 1);
    const eased = local * local * (3 - 2 * local);
    for (const mesh of l.userData.meshes) {
      if ("emissiveIntensity" in mesh.material) {
        mesh.material.emissiveIntensity = eased * l.userData.targetIntensity;
      }
    }
  }

  const sweep = (elapsed * 1.15) % 1;
  sweepRing.scale.setScalar(0.9 + sweep * 4.2);
  sweepRing.material.opacity = Math.max(0, 0.55 - sweep * 0.65);

  const positions = particles.geometry.attributes.position.array;
  for (let i = 0; i < particleCount; i += 1) {
    const yIndex = i * 3 + 1;
    positions[yIndex] += particleVel[i] * (1.1 + cityProgress * 1.8);
    if (positions[yIndex] > 0.66) {
      positions[yIndex] = 0.09;
    }
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.material.opacity = 0.18 + cityProgress * 0.45;
  particles.rotation.y += dt * 0.32;

  for (const l of landmarks) {
    l.rotation.y += dt * 0.08;
  }

  if (cityProgress >= 1) {
    switchStage(STAGE.CHARACTER_ENTRANCE);
  }
};

const animateCharacterEntrance = (elapsed) => {
  if (!modelReady || !modelRoot) return;

  const p = Math.min(elapsed / 0.95, 1);
  const eased = 1 - Math.pow(1 - p, 3);

  characterContainer.visible = true;
  modelRoot.visible = true;

  portalRing.rotation.z += 0.05;
  portalRing.material.opacity = (1 - p) * 0.45;
  portalRing.scale.setScalar(0.9 + p * 0.35);

  portalBeam.material.opacity = (1 - p) * 0.72;
  portalBeam.scale.y = 0.9 + (1 - p) * 0.55;
  portalCoreBeam.material.opacity = (1 - p) * 0.88;
  portalCoreBeam.scale.y = 0.92 + (1 - p) * 0.65;

  modelRoot.scale.setScalar(0.08 + 0.92 * eased);
  modelRoot.position.y = baseY - (1 - eased) * 0.16;

  if (p >= 1) {
    portalRing.material.opacity = 0;
    portalBeam.material.opacity = 0;
    portalCoreBeam.material.opacity = 0;
    switchStage(STAGE.INTERACTIVE);
  }
};

const animateInteractive = (elapsed, dt) => {
  if (!modelRoot) return;

  modelRoot.position.y = baseY + Math.sin(elapsed * 2) * 0.03;
  modelRoot.rotation.y += 0.005;

  roadRing.rotation.z += dt * 0.22;
  roadRing.material.opacity = 0.25 + Math.sin(elapsed * 3.5) * 0.06;
  particles.rotation.y += dt * 0.2;

  const glow = 0.78 + Math.sin(elapsed * 4.2) * 0.18;
  for (const l of landmarks) {
    for (const mesh of l.userData.meshes) {
      if ("emissiveIntensity" in mesh.material) {
        mesh.material.emissiveIntensity = Math.max(mesh.material.emissiveIntensity, glow);
      }
    }
  }

  if (clickPulseT < 1) {
    clickPulseT = Math.min(1, clickPulseT + 0.045);
    const pulseEase = 1 - Math.pow(1 - clickPulseT, 2);
    clickPulse.scale.setScalar(1 + pulseEase * 3.2);
    clickPulse.material.opacity = (1 - pulseEase) * 0.95;
  }
};

const loop = () => {
  animationFrameId = window.requestAnimationFrame(loop);
  const dt = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (targetVisible) {
    stageElapsed += dt;

    if (stage === STAGE.CITY_LIGHT_UP) animateCity(stageElapsed, dt);
    if (stage === STAGE.CHARACTER_ENTRANCE) animateCharacterEntrance(stageElapsed);
    if (stage === STAGE.INTERACTIVE) animateInteractive(elapsed, dt);
  }

  renderer.render(scene, camera);
};

window.addEventListener("beforeunload", () => {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
  }

  renderer.domElement.removeEventListener("pointerdown", onPointerDown);
  introAudio.pause();
  helloAudio.pause();
  mindARThree.stop();
  mindARThree.renderer.dispose();
});
