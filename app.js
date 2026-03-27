import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

const container = document.querySelector("#ar-container");
const statusText = document.querySelector("#status-text");
const startButton = document.querySelector("#start-btn");
const guidePanel = document.querySelector("#guide-panel");
const guideAnswer = document.querySelector("#guide-answer");
const questionButtons = Array.from(document.querySelectorAll(".question-chip"));

const helloAudio = new Audio("./assets/hello.mp3");
helloAudio.preload = "auto";
helloAudio.volume = 0.82;

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
let animationFrameId = null;
let guideBusy = false;
let guidePrimed = false;
let lastGuideAnswer = "";

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

const makeFacadeTexture = (baseHex, lineHex) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `#${baseHex.toString(16).padStart(6, "0")}`;
  ctx.fillRect(0, 0, 256, 256);

  const line = `#${lineHex.toString(16).padStart(6, "0")}`;
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.28;
  for (let x = 0; x <= 256; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.16;
  for (let y = 0; y <= 256; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.0)");
  grad.addColorStop(1, "rgba(255,255,255,0.12)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 14);
  tex.needsUpdate = true;
  return tex;
};

const makeWindowGlowTexture = (tintHex) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = `#${tintHex.toString(16).padStart(6, "0")}`;
  for (let y = 8; y < 256; y += 14) {
    for (let x = 8; x < 256; x += 14) {
      const on = Math.random() > 0.38;
      if (!on) continue;
      const w = 6 + Math.random() * 3;
      const h = 8 + Math.random() * 2;
      ctx.globalAlpha = 0.35 + Math.random() * 0.6;
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 16);
  tex.needsUpdate = true;
  return tex;
};

const createModernMaterial = ({ baseColor, emissiveColor, metalness, roughness, transmission = 0 }) => {
  const map = makeFacadeTexture(baseColor, 0x8ad8ff);
  const emissiveMap = makeWindowGlowTexture(0xa8ecff);
  return new THREE.MeshPhysicalMaterial({
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity: 0,
    emissiveMap,
    metalness,
    roughness,
    transmission,
    thickness: transmission > 0 ? 0.6 : 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    map,
    roughnessMap: map,
    bumpMap: map,
    bumpScale: 0.065
  });
};

const addLandmark = ({ name, group, triggerAt, targetIntensity, sweepColor }) => {
  const meshes = [];
  const lightNodes = [];
  group.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });

  const sweep = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.15, 64),
    new THREE.MeshBasicMaterial({
      color: sweepColor,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.y = 0.004;
  group.add(sweep);

  group.userData = { name, triggerAt, targetIntensity, meshes, sweep, lightNodes };
  cityRoot.add(group);
  landmarks.push(group);
};

// 东方明珠（结构修正：三根支撑腿 + 双球 + 天线）
const pearl = new THREE.Group();
pearl.position.set(-0.28, 0.065, -0.02);
const pearlFrameMat = createModernMaterial({
  baseColor: 0x2a1e26,
  emissiveColor: 0xff6a8a,
  metalness: 0.44,
  roughness: 0.2
});
const pearlBallMat = new THREE.MeshPhysicalMaterial({
  color: 0xb9152f,
  emissive: 0xff355e,
  emissiveIntensity: 0,
  metalness: 0.28,
  roughness: 0.22,
  clearcoat: 1,
  clearcoatRoughness: 0.12
});
for (let i = 0; i < 3; i += 1) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.18, 16), pearlFrameMat);
  const a = (Math.PI * 2 * i) / 3;
  leg.position.set(Math.cos(a) * 0.045, 0.09, Math.sin(a) * 0.045);
  leg.rotation.z = 0.2 * Math.cos(a);
  leg.rotation.x = 0.2 * Math.sin(a);
  pearl.add(leg);
}
const pearlLowerSphere = new THREE.Mesh(new THREE.SphereGeometry(0.072, 26, 26), pearlBallMat);
pearlLowerSphere.position.y = 0.2;
const pearlMidSphere = new THREE.Mesh(new THREE.SphereGeometry(0.03, 22, 22), pearlBallMat);
pearlMidSphere.position.y = 0.305;
const pearlUpperSphere = new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 24), pearlBallMat);
pearlUpperSphere.position.y = 0.39;
const pearlMidMast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 16), pearlFrameMat);
pearlMidMast.position.y = 0.31;
const pearlAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 12), pearlFrameMat);
pearlAntenna.position.y = 0.55;
const pearlLowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.0035, 10, 32), new THREE.MeshBasicMaterial({
  color: 0xff8aa5,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending
}));
pearlLowerRing.rotation.x = Math.PI / 2;
pearlLowerRing.position.y = 0.2;
const pearlUpperRing = pearlLowerRing.clone();
pearlUpperRing.scale.setScalar(0.72);
pearlUpperRing.position.y = 0.39;
const pearlMidRing = pearlLowerRing.clone();
pearlMidRing.scale.setScalar(0.42);
pearlMidRing.position.y = 0.305;
pearl.add(pearlMidMast, pearlLowerSphere, pearlMidSphere, pearlUpperSphere, pearlAntenna, pearlLowerRing, pearlMidRing, pearlUpperRing);
addLandmark({ name: "pearl", group: pearl, triggerAt: 0.06, targetIntensity: 1.35, sweepColor: 0xff89df });

// 上海中心（玻璃流线塔 + 螺旋线）
const shCenter = new THREE.Group();
shCenter.position.set(0, 0.065, -0.09);
const centerMat = createModernMaterial({
  baseColor: 0x1a3354,
  emissiveColor: 0x3ee5ff,
  metalness: 0.22,
  roughness: 0.08,
  transmission: 0.28
});
const centerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.043, 0.82, 34), centerMat);
centerBody.position.y = 0.41;
centerBody.rotation.y = 0.34;
const centerTip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.11, 22), centerMat);
centerTip.position.y = 0.88;
const helixPts = [];
for (let i = 0; i <= 58; i += 1) {
  const t = i / 58;
  const ang = t * Math.PI * 7.6;
  const radius = THREE.MathUtils.lerp(0.088, 0.043, t) + 0.0025;
  helixPts.push(new THREE.Vector3(Math.cos(ang) * radius, 0.02 + t * 0.82, Math.sin(ang) * radius));
}
const helix = new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), 120, 0.0026, 8, false),
  new THREE.MeshBasicMaterial({ color: 0x93ffff, transparent: true, opacity: 0.6 })
);
const centerOrbitRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.1, 0.003, 8, 72),
  new THREE.MeshBasicMaterial({
    color: 0x8df9ff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  })
);
centerOrbitRing.rotation.x = Math.PI / 2.2;
centerOrbitRing.position.y = 0.38;
const centerParticleCount = lowPowerDevice ? 90 : 170;
const centerParticleGeom = new THREE.BufferGeometry();
const centerParticlePos = new Float32Array(centerParticleCount * 3);
for (let i = 0; i < centerParticleCount; i += 1) {
  const a = (Math.PI * 2 * i) / centerParticleCount;
  const r = 0.11 + Math.random() * 0.03;
  centerParticlePos[i * 3] = Math.cos(a) * r;
  centerParticlePos[i * 3 + 1] = 0.2 + Math.random() * 0.42;
  centerParticlePos[i * 3 + 2] = Math.sin(a) * r;
}
centerParticleGeom.setAttribute("position", new THREE.BufferAttribute(centerParticlePos, 3));
const centerOrbitParticles = new THREE.Points(
  centerParticleGeom,
  new THREE.PointsMaterial({
    color: 0x8dfbff,
    size: lowPowerDevice ? 0.006 : 0.008,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
centerOrbitParticles.name = "centerOrbitParticles";
centerOrbitRing.name = "centerOrbitRing";
shCenter.add(centerBody, centerTip, helix, centerOrbitRing, centerOrbitParticles);
addLandmark({ name: "shanghai-tower", group: shCenter, triggerAt: 0.36, targetIntensity: 1.15, sweepColor: 0x8ffbff });

// 环球金融中心（开瓶器轮廓 + 金色边框）
const swfc = new THREE.Group();
swfc.position.set(0.29, 0.065, -0.01);
const swfcShape = new THREE.Shape();
swfcShape.moveTo(-0.08, 0);
swfcShape.lineTo(0.08, 0);
swfcShape.lineTo(0.052, 0.67);
swfcShape.lineTo(0, 0.74);
swfcShape.lineTo(-0.052, 0.67);
swfcShape.closePath();
const hole = new THREE.Path();
hole.moveTo(-0.036, 0.57);
hole.lineTo(0.036, 0.57);
hole.lineTo(0.02, 0.63);
hole.lineTo(-0.02, 0.63);
hole.closePath();
swfcShape.holes.push(hole);
const swfcGeom = new THREE.ExtrudeGeometry(swfcShape, { depth: 0.09, bevelEnabled: false });
const swfcMat = createModernMaterial({
  baseColor: 0xb7bfcc,
  emissiveColor: 0xd6deea,
  metalness: 0.56,
  roughness: 0.16
});
const swfcBody = new THREE.Mesh(swfcGeom, swfcMat);
swfcBody.position.z = -0.045;
const swfcFrame = new THREE.LineSegments(
  new THREE.EdgesGeometry(swfcGeom),
  new THREE.LineBasicMaterial({ color: 0xffd86a, transparent: true, opacity: 0.65 })
);
swfcFrame.position.z = -0.045;
swfc.add(swfcBody, swfcFrame);
addLandmark({ name: "swfc", group: swfc, triggerAt: 0.66, targetIntensity: 1.28, sweepColor: 0xffd977 });

// Dynamic light beads for each landmark to simulate modern light-up animation.
for (const l of landmarks) {
  const beadCount = l.userData.name === "shanghai-tower" ? 16 : 12;
  for (let i = 0; i < beadCount; i += 1) {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 12, 12),
      new THREE.MeshBasicMaterial({
        color: l.userData.name === "swfc" ? 0xffe08f : 0x88f8ff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    bead.position.set(
      (Math.random() - 0.5) * 0.1,
      0.08 + Math.random() * 0.66,
      (Math.random() - 0.5) * 0.07
    );
    l.add(bead);
    l.userData.lightNodes.push(bead);
  }
}

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
// Keep Hu Xiaobao in center-front so landmarks won't occlude the character.
characterContainer.position.set(0, 0.06, 0.52);
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

const tapHitbox = new THREE.Mesh(
  new THREE.SphereGeometry(0.42, 20, 20),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
);
tapHitbox.position.set(0, 0.28, 0);
characterContainer.add(tapHitbox);

const tapAssistPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(0.74, 0.96),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
);
tapAssistPlane.position.set(0, 0.36, 0.02);
characterContainer.add(tapAssistPlane);

let clickPulseT = 1;

// ---------- Fireworks ----------
const fireworksRoot = new THREE.Group();
fireworksRoot.visible = false;
fireworksRoot.position.z = -0.2;
anchor.group.add(fireworksRoot);
const fireworks = [];
let fireworksCooldown = 0;
const maxFireworks = lowPowerDevice ? 10 : 18;

const setStatus = (text) => {
  statusText.textContent = text;
};

const setGuideBusy = (busy) => {
  guideBusy = busy;
  for (const btn of questionButtons) {
    btn.disabled = busy;
  }
};

const cancelSpeech = () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
};

const speakText = (text) => {
  cancelSpeech();
  if (!("speechSynthesis" in window) || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
};

const showGuidePanel = () => {
  guidePanel.classList.remove("hidden");
};

const createFireworkBurst = () => {
  const shapeTypes = ["sphere", "ring", "star"];
  const shape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
  const count = lowPowerDevice ? 140 : 280;
  const positions = new Float32Array(count * 3);
  const dirs = new Float32Array(count * 3);
  const palette = [0xff72d6, 0x75f5ff, 0xffd676, 0x95ff8a, 0xb48fff];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const radius = 0.58 + Math.random() * 0.6;

  for (let i = 0; i < count; i += 1) {
    const ai = i * 3;
    const a = (Math.PI * 2 * i) / count;
    let r = 1;
    if (shape === "star") r = i % 2 === 0 ? 1 : 0.45;
    if (shape === "ring") {
      dirs[ai] = Math.cos(a) * r;
      dirs[ai + 1] = (Math.random() - 0.5) * 0.25;
      dirs[ai + 2] = Math.sin(a) * r;
    } else {
      const v = new THREE.Vector3(
        Math.cos(a) * r,
        (Math.random() - 0.35) * 1.25,
        Math.sin(a) * r
      ).normalize();
      dirs[ai] = v.x;
      dirs[ai + 1] = v.y;
      dirs[ai + 2] = v.z;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: lowPowerDevice ? 0.034 : 0.052,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geom, mat);

  const origin = new THREE.Vector3(
    (Math.random() - 0.5) * 2.8,
    0.2 + Math.random() * 1.45,
    -0.95 + (Math.random() - 0.5) * 2.25
  );
  points.position.copy(origin);
  fireworksRoot.add(points);
  fireworks.push({ points, dirs, radius, age: 0, life: 3.6 + Math.random() * 1.9 });
};

const updateFireworks = (dt) => {
  if (fireworks.length > maxFireworks) {
    const overflow = fireworks.length - maxFireworks;
    for (let i = 0; i < overflow; i += 1) {
      const fw = fireworks.shift();
      if (!fw) break;
      fireworksRoot.remove(fw.points);
      fw.points.geometry.dispose();
      fw.points.material.dispose();
    }
  }

  fireworksCooldown -= dt;
  if (fireworksCooldown <= 0) {
    const burstNum = lowPowerDevice ? 2 : 3 + Math.round(Math.random() * 2);
    for (let i = 0; i < burstNum; i += 1) {
      createFireworkBurst();
    }
    fireworksCooldown = lowPowerDevice ? 0.2 + Math.random() * 0.14 : 0.08 + Math.random() * 0.07;
  }

  for (let i = fireworks.length - 1; i >= 0; i -= 1) {
    const fw = fireworks[i];
    fw.age += dt;
    const t = fw.age / fw.life;
    const pArr = fw.points.geometry.attributes.position.array;

    for (let j = 0; j < pArr.length; j += 3) {
      const speed = fw.radius * (1 - 0.18 * t);
      pArr[j] = fw.dirs[j] * speed * t;
      pArr[j + 1] = fw.dirs[j + 1] * speed * t - t * t * 0.07;
      pArr[j + 2] = fw.dirs[j + 2] * speed * t;
    }

    fw.points.geometry.attributes.position.needsUpdate = true;
    fw.points.material.opacity = Math.max(0, 1 - t * 0.8);

    if (t >= 1) {
      fireworksRoot.remove(fw.points);
      fw.points.geometry.dispose();
      fw.points.material.dispose();
      fireworks.splice(i, 1);
    }
  }
};

const resetCity = () => {
  cityPlate.material.emissiveIntensity = 0.08;
  roadRing.material.opacity = 0.1;
  sweepRing.material.opacity = 0;
  sweepRing.scale.setScalar(1);

  for (const l of landmarks) {
    for (const mesh of l.userData.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!("emissiveIntensity" in mat)) continue;
        mat.emissiveIntensity = 0;
      }
    }
    l.userData.sweep.material.opacity = 0;
    l.userData.sweep.scale.setScalar(1);
    l.rotation.y = 0;
  }

  particles.material.opacity = 0.12;
  fireworksCooldown = 0;
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
    fireworksRoot.visible = true;
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
    showGuidePanel();
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
    model.renderOrder = 20;
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        mat.depthTest = false;
      }
    });

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

const activateGuideMode = async () => {
  if (!targetVisible || (stage !== STAGE.INTERACTIVE && stage !== STAGE.CHARACTER_ENTRANCE)) return;
  showGuidePanel();
  clickPulseT = 0;
  setStatus("请选择一个问题，听沪小宝介绍上海");

  if (!guidePrimed) {
    guidePrimed = true;
    const intro = "你好，我是沪小宝。你可以点击下方问题，听我介绍上海的景点、美食和游玩路线。";
    guideAnswer.textContent = intro;
    speakText(intro);
  } else if (lastGuideAnswer) {
    speakText(lastGuideAnswer);
  }
};

const getClientPoint = (event) => {
  if (!event) return null;
  if ("clientX" in event && "clientY" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  if (event.touches?.[0]) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if (event.changedTouches?.[0]) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  return null;
};

const askGuide = async (question) => {
  if (!targetVisible || stage !== STAGE.INTERACTIVE) return;
  showGuidePanel();
  setGuideBusy(true);
  setStatus("沪小宝正在整理上海导览...");
  guideAnswer.textContent = "正在生成导览讲解，请稍候...";

  try {
    const response = await fetch("/api/kimi-guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = [data.error, data.details].filter(Boolean).join(": ");
      throw new Error(detail || `Guide API error: ${response.status}`);
    }

    const answer = data.answer?.trim() || "暂时没有获得讲解内容，请稍后再试。";
    lastGuideAnswer = answer;
    guideAnswer.textContent = answer;
    setStatus("上海导览已生成，正在语音播报");
    speakText(answer);
  } catch (error) {
    console.error("Guide request failed", error);
    guideAnswer.textContent = `导览服务暂时不可用：${error instanceof Error ? error.message : "请稍后重试"}`;
    setStatus("导览服务暂时不可用");
  } finally {
    setGuideBusy(false);
  }
};

const onPointerDown = async (event) => {
  if (!targetVisible) return;
  const point = getClientPoint(event);
  if (!point) return;

  const x = (point.x / window.innerWidth) * 2 - 1;
  const y = -(point.y / window.innerHeight) * 2 + 1;
  pointer.set(x, y);

  raycaster.setFromCamera(pointer, camera);
  const hitTargets = [];
  if (model) hitTargets.push(model);
  hitTargets.push(tapHitbox, tapAssistPlane);
  const intersects = raycaster.intersectObjects(hitTargets, true);
  let hit = intersects.length > 0;

  // Fallback: screen-space proximity hit test for mobile taps.
  if (!hit && modelRoot) {
    const sp = modelRoot.getWorldPosition(new THREE.Vector3()).project(camera);
    const sx = (sp.x + 1) * 0.5 * window.innerWidth;
    const sy = (1 - sp.y) * 0.5 * window.innerHeight;
    const dx = point.x - sx;
    const dy = point.y - sy;
    hit = Math.sqrt(dx * dx + dy * dy) <= Math.min(window.innerWidth, window.innerHeight) * 0.46;
  }

  if (!hit && modelRoot) {
    // Ultimate fallback for mobile jitter: any tap in center zone triggers.
    hit =
      point.x > window.innerWidth * 0.2 &&
      point.x < window.innerWidth * 0.8 &&
      point.y > window.innerHeight * 0.16 &&
      point.y < window.innerHeight * 0.84;
  }

  if (hit) {
    await unlockAudioIfNeeded();
    await activateGuideMode();
  }
};
renderer.domElement.addEventListener("pointerdown", onPointerDown);
const onTouchStart = (e) => {
  onPointerDown(e);
};
renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
renderer.domElement.addEventListener("click", onPointerDown);
window.addEventListener("pointerup", onPointerDown, { passive: true });

for (const btn of questionButtons) {
  btn.addEventListener("click", async () => {
    await unlockAudioIfNeeded();
    await askGuide(btn.dataset.question || "");
  });
}

anchor.onTargetFound = () => {
  targetVisible = true;
  helloPlayedThisRound = false;
  guidePrimed = false;
  lastGuideAnswer = "";
  guideAnswer.textContent = "点击沪小宝或下方问题，听沪小宝介绍上海。";
  guidePanel.classList.add("hidden");
  cancelSpeech();

  switchStage(STAGE.CITY_LIGHT_UP);
};

anchor.onTargetLost = () => {
  targetVisible = false;
  stage = STAGE.IDLE;
  stageElapsed = 0;
  guidePrimed = false;
  lastGuideAnswer = "";
  guidePanel.classList.add("hidden");
  guideAnswer.textContent = "点击沪小宝或下方问题，听沪小宝介绍上海。";
  setGuideBusy(false);
  cancelSpeech();

  cityRoot.visible = false;
  fireworksRoot.visible = false;
  for (let i = fireworks.length - 1; i >= 0; i -= 1) {
    const fw = fireworks[i];
    fireworksRoot.remove(fw.points);
    fw.points.geometry.dispose();
    fw.points.material.dispose();
    fireworks.splice(i, 1);
  }
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
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!("emissiveIntensity" in mat)) continue;
        mat.emissiveIntensity = eased * l.userData.targetIntensity;
      }
    }
    l.userData.sweep.material.opacity = Math.max(0, 0.72 - Math.abs((local % 1) - 0.5) * 1.5) * eased;
    l.userData.sweep.scale.setScalar(1 + eased * 1.9);
    for (let i = 0; i < l.userData.lightNodes.length; i += 1) {
      const bead = l.userData.lightNodes[i];
      const twinkle = 0.45 + Math.sin(cityProgress * 14 + i * 0.65) * 0.35;
      bead.material.opacity = Math.max(0.08, eased * twinkle);
    }

    const orbitRing = l.getObjectByName("centerOrbitRing");
    const orbitParticles = l.getObjectByName("centerOrbitParticles");
    if (orbitRing) {
      orbitRing.rotation.z += dt * 0.8;
      orbitRing.material.opacity = 0.35 + eased * 0.5;
    }
    if (orbitParticles) {
      orbitParticles.rotation.y += dt * 1.2;
      orbitParticles.material.opacity = 0.3 + eased * 0.55;
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
  // Keep Hu Xiaobao facing forward; no auto-rotation.
  modelRoot.rotation.y = 0;

  roadRing.rotation.z += dt * 0.22;
  roadRing.material.opacity = 0.25 + Math.sin(elapsed * 3.5) * 0.06;
  particles.rotation.y += dt * 0.2;

  const glow = 0.78 + Math.sin(elapsed * 4.2) * 0.18;
  for (const l of landmarks) {
    for (const mesh of l.userData.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!("emissiveIntensity" in mat)) continue;
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, glow * l.userData.targetIntensity * 0.68);
      }
    }
    l.userData.sweep.material.opacity = 0.24 + Math.sin(elapsed * 3.2) * 0.12;
    l.userData.sweep.scale.setScalar(2.4 + Math.sin(elapsed * 2.1) * 0.14);
    for (let i = 0; i < l.userData.lightNodes.length; i += 1) {
      const bead = l.userData.lightNodes[i];
      bead.material.opacity = 0.42 + Math.sin(elapsed * 6.2 + i * 0.7) * 0.28;
    }

    const orbitRing = l.getObjectByName("centerOrbitRing");
    const orbitParticles = l.getObjectByName("centerOrbitParticles");
    if (orbitRing) {
      orbitRing.rotation.z += dt * 1.1;
      orbitRing.material.opacity = 0.72 + Math.sin(elapsed * 3.2) * 0.12;
    }
    if (orbitParticles) {
      orbitParticles.rotation.y += dt * 1.7;
      orbitParticles.material.opacity = 0.75 + Math.sin(elapsed * 4.5) * 0.15;
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
    updateFireworks(dt);
  }

  renderer.render(scene, camera);
};

window.addEventListener("beforeunload", () => {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
  }

  renderer.domElement.removeEventListener("pointerdown", onPointerDown);
  renderer.domElement.removeEventListener("touchstart", onTouchStart);
  renderer.domElement.removeEventListener("click", onPointerDown);
  window.removeEventListener("pointerup", onPointerDown);
  cancelSpeech();
  helloAudio.pause();
  mindARThree.stop();
  mindARThree.renderer.dispose();
});
