import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MindARThree } from "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js";

const container = document.querySelector("#ar-container");
const statusText = document.querySelector("#status-text");
const startButton = document.querySelector("#start-btn");
const controlPanel = document.querySelector("#control-panel");
const voiceButton = document.querySelector("#voice-btn");
const voiceHint = document.querySelector("#voice-hint");
const intentSourceBadge = document.querySelector("#intent-source-badge");
const intentTranscript = document.querySelector("#intent-transcript");
const intentAction = document.querySelector("#intent-action");
const actionButtons = Array.from(document.querySelectorAll(".action-btn"));

const STAGE = {
  IDLE: "idle",
  REVEAL: "reveal",
  READY: "ready",
  ACTION: "action"
};

const ACTION_KEYS = {
  IDLE: "idle",
  GREETING: "greeting",
  DANCING: "dancing"
};

const EFFECT_KEYS = {
  LIGHT_ORBS: "light_orbs"
};

const mindARThree = new MindARThree({
  container,
  imageTargetSrc: "./assets/targets.mind"
});

const { renderer, scene, camera } = mindARThree;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
scene.add(new THREE.HemisphereLight(0xdff3ff, 0x15233d, 1.35));

const keyLight = new THREE.DirectionalLight(0xfff2e0, 1.9);
keyLight.position.set(0.85, 1.55, 1.2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xbad8ff, 1.05);
fillLight.position.set(-1.15, 0.95, 0.7);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x8de7ff, 1.6);
rimLight.position.set(0.35, 1.8, -1.1);
scene.add(rimLight);

const lowLight = new THREE.DirectionalLight(0xff8d78, 0.45);
lowLight.position.set(0, 0.35, 1.1);
scene.add(lowLight);

const anchor = mindARThree.addAnchor(0);
const loader = new GLTFLoader();
const clock = new THREE.Clock();

let animationFrameId = null;
let modelRoot;
let mixer;
let modelScale = 1;
let stage = STAGE.IDLE;
let stageElapsed = 0;
let effectElapsed = 0;
let targetVisible = false;
let voiceSupported = false;
let voiceListening = false;
let recognition;
let activeActionKey = ACTION_KEYS.IDLE;
let actionsLoaded = false;
let lastRecognizedTranscript = "";
let idleAction = null;
let orbCharge = 0.42;
let orbChargeTarget = 0.42;
let orbChargePulse = 0;

const actionClips = new Map();
const actionInstances = new Map();
const orbClusters = [];

const ORB_CONFIGS = [
  { hue: 0.0, saturation: 0.04, lightness: 0.9, radius: 0.092, distance: 0.16, phase: 0.0, speed: 0.42, baseY: 0.06, frontBias: 0.18 },
  { hue: 0.6, saturation: 0.98, lightness: 0.66, radius: 0.104, distance: 0.24, phase: 1.25, speed: 0.58, baseY: 0.12, frontBias: 0.11 },
  { hue: 0.5, saturation: 0.99, lightness: 0.64, radius: 0.098, distance: 0.25, phase: 2.1, speed: 0.62, baseY: 0.08, frontBias: 0.09 },
  { hue: 0.3, saturation: 0.96, lightness: 0.63, radius: 0.102, distance: 0.26, phase: 3.05, speed: 0.54, baseY: 0.14, frontBias: 0.1 },
  { hue: 0.7, saturation: 0.94, lightness: 0.66, radius: 0.106, distance: 0.25, phase: 4.2, speed: 0.66, baseY: 0.07, frontBias: 0.12 }
];

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.24, 0.28, 0.045, 48),
  new THREE.MeshStandardMaterial({
    color: 0x0c1830,
    emissive: 0x1b62a3,
    emissiveIntensity: 0.75,
    metalness: 0.18,
    roughness: 0.35
  })
);
pedestal.position.y = 0.02;
pedestal.visible = false;
anchor.group.add(pedestal);

const glowRing = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.25, 72),
  new THREE.MeshBasicMaterial({
    color: 0x7df6ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
glowRing.rotation.x = -Math.PI / 2;
glowRing.position.y = 0.045;
glowRing.visible = false;
anchor.group.add(glowRing);

const aura = new THREE.Mesh(
  new THREE.CylinderGeometry(0.11, 0.18, 0.55, 40, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x62d9ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
aura.position.y = 0.31;
aura.visible = false;
anchor.group.add(aura);

const orbSwarmRoot = new THREE.Group();
orbSwarmRoot.visible = false;
orbSwarmRoot.position.set(0, 3, 0.18);
anchor.group.add(orbSwarmRoot);

const setStatus = (text) => {
  statusText.textContent = text;
};

const actionLabel = (actionKey) => {
  if (actionKey === ACTION_KEYS.IDLE) return "待机";
  if (actionKey === ACTION_KEYS.GREETING) return "打招呼";
  if (actionKey === ACTION_KEYS.DANCING) return "跳舞";
  if (actionKey === EFFECT_KEYS.LIGHT_ORBS) return "点亮光球";
  return "未识别";
};

const setIntentDebug = ({ source = "idle", transcript = "-", action = "-", detail } = {}) => {
  if (!intentSourceBadge || !intentTranscript || !intentAction) return;

  intentSourceBadge.classList.remove(
    "intent-badge--idle",
    "intent-badge--kimi",
    "intent-badge--fallback",
    "intent-badge--error"
  );

  if (source === "kimi") {
    intentSourceBadge.textContent = "Kimi";
    intentSourceBadge.classList.add("intent-badge--kimi");
  } else if (source === "manual") {
    intentSourceBadge.textContent = "手动按钮";
    intentSourceBadge.classList.add("intent-badge--idle");
  } else if (source === "fallback") {
    intentSourceBadge.textContent = "本地兜底";
    intentSourceBadge.classList.add("intent-badge--fallback");
  } else if (source === "error") {
    intentSourceBadge.textContent = "识别失败";
    intentSourceBadge.classList.add("intent-badge--error");
  } else {
    intentSourceBadge.textContent = "未触发";
    intentSourceBadge.classList.add("intent-badge--idle");
  }

  intentTranscript.textContent = `识别文本：${transcript || "-"}`;
  intentAction.textContent = `动作结果：${action}${detail ? `（${detail}）` : ""}`;
};

const setActiveButton = (actionKey) => {
  for (const button of actionButtons) {
    button.classList.toggle("active", button.dataset.action === actionKey);
  }
};

const setControlsEnabled = (enabled) => {
  for (const button of actionButtons) {
    button.disabled = !enabled;
  }
  if (voiceButton) {
    voiceButton.disabled = !enabled || !voiceSupported;
  }
};

const updateVoiceUi = ({ listening = voiceListening, hint } = {}) => {
  if (!voiceButton || !voiceHint) return;
  voiceListening = listening;
  voiceButton.classList.toggle("listening", listening);
  voiceButton.classList.toggle("unsupported", !voiceSupported);

  if (!voiceSupported) {
    voiceButton.textContent = "当前浏览器不支持语音触发";
    voiceHint.textContent = "可以直接点击“打招呼”或“跳舞”按钮。";
    return;
  }

  voiceButton.textContent = listening ? "正在听你说话..." : "语音触发动作";
  voiceHint.textContent = hint || (listening ? "请说“打招呼”“跳舞”“待机”或“点亮光球”" : "可以说“打招呼”“跳舞”“待机”或“点亮光球”");
};

const inferLocalAction = (transcript) => {
  const text = String(transcript || "").trim();
  if (!text) return null;
  if (
    (text.includes("光球") || text.includes("能量球") || text.includes("球体")) &&
    (text.includes("亮") || text.includes("点亮") || text.includes("发光") || text.includes("点灯"))
  ) {
    return EFFECT_KEYS.LIGHT_ORBS;
  }
  if (text.includes("待机") || text.includes("休息") || text.includes("站好")) return ACTION_KEYS.IDLE;
  if (text.includes("跳") || text.includes("舞")) return ACTION_KEYS.DANCING;
  if (text.includes("招呼") || text.includes("挥") || text.includes("手")) return ACTION_KEYS.GREETING;
  return null;
};

const triggerOrbIgnition = () => {
  orbChargeTarget = 1;
  orbChargePulse = 0;
  setStatus("五个光球正在缓慢点亮");
};

const resetOrbCharge = () => {
  orbCharge = 0.42;
  orbChargeTarget = 0.42;
  orbChargePulse = 0;
};

const resolveIntentWithKimi = async (transcript) => {
  const response = await fetch("./api/intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: transcript })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Kimi intent request failed");
  }

  return payload;
};

const handleTranscript = async (transcript) => {
  lastRecognizedTranscript = transcript;
  updateVoiceUi({ listening: false, hint: `识别到：${transcript}` });
  setStatus(`识别中：${transcript}`);
  setControlsEnabled(false);
  setIntentDebug({
    source: "idle",
    transcript,
    action: "识别中",
    detail: "等待 Kimi 返回"
  });

  try {
    const payload = await resolveIntentWithKimi(transcript);
    const actionKey = payload?.intent === EFFECT_KEYS.LIGHT_ORBS
      ? EFFECT_KEYS.LIGHT_ORBS
      : payload?.intent === ACTION_KEYS.DANCING
      ? ACTION_KEYS.DANCING
      : payload?.intent === ACTION_KEYS.GREETING
        ? ACTION_KEYS.GREETING
        : payload?.intent === ACTION_KEYS.IDLE
          ? ACTION_KEYS.IDLE
          : null;

    if (actionKey) {
      setIntentDebug({
        source: "kimi",
        transcript,
        action: actionLabel(actionKey),
        detail: payload?.reply || "Kimi 意图识别"
      });
      if (actionKey === EFFECT_KEYS.LIGHT_ORBS) {
        setStatus(payload?.reply || "Kimi 判定：点亮光球");
        triggerOrbIgnition();
      } else {
        setStatus(
          payload?.reply ||
          (actionKey === ACTION_KEYS.DANCING
            ? "Kimi 判定：跳舞"
            : actionKey === ACTION_KEYS.GREETING
              ? "Kimi 判定：打招呼"
              : "Kimi 判定：回到待机")
        );
        playAction(actionKey, { force: true });
      }
      setControlsEnabled(true);
      return;
    }
  } catch (error) {
    console.warn("Kimi intent failed, fallback to local keyword mapping", error);
    setIntentDebug({
      source: "error",
      transcript,
      action: "Kimi 失败",
      detail: error instanceof Error ? error.message : "请求失败"
    });
  }

  const fallbackAction = inferLocalAction(transcript);
  if (fallbackAction) {
    setIntentDebug({
      source: "fallback",
      transcript,
      action: actionLabel(fallbackAction),
      detail: "本地关键词兜底"
    });
    if (fallbackAction === EFFECT_KEYS.LIGHT_ORBS) {
      setStatus("本地识别：点亮光球");
      triggerOrbIgnition();
    } else {
      setStatus(
        `本地识别：${
          fallbackAction === ACTION_KEYS.DANCING
            ? "跳舞"
            : fallbackAction === ACTION_KEYS.GREETING
              ? "打招呼"
              : "待机"
        }`
      );
      playAction(fallbackAction, { force: true });
    }
    setControlsEnabled(true);
    return;
  }

  setControlsEnabled(true);
  setStatus(`未识别动作：${transcript}`);
  updateVoiceUi({ listening: false, hint: "未匹配动作，可说“打招呼”或“跳舞”" });
  setIntentDebug({
    source: "error",
    transcript,
    action: "未识别",
    detail: "Kimi 与本地兜底都未命中"
  });
};

const resetRevealFx = () => {
  pedestal.visible = false;
  glowRing.visible = false;
  aura.visible = false;
  orbSwarmRoot.visible = false;
  orbSwarmRoot.scale.setScalar(1);
  glowRing.material.opacity = 0;
  glowRing.scale.setScalar(1);
  aura.material.opacity = 0;
  pedestal.material.emissiveIntensity = 0.6;
  resetOrbCharge();
};

const fibonacciPoint = (index, total, radius) => {
  const phi = Math.acos(-1 + (2 * index) / total);
  const theta = Math.sqrt(total * Math.PI) * phi;
  return new THREE.Vector3(
    Math.cos(theta) * Math.sin(phi) * radius,
    Math.sin(theta) * Math.sin(phi) * radius,
    Math.cos(phi) * radius
  );
};

const createOrbCluster = (config, clusterIndex) => {
  const particleCount = 1100;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const baseOffsets = new Float32Array(particleCount * 3);
  const color = new THREE.Color();

  for (let i = 0; i < particleCount; i += 1) {
    const point = fibonacciPoint(i, particleCount, config.radius);
    baseOffsets[i * 3] = point.x;
    baseOffsets[i * 3 + 1] = point.y;
    baseOffsets[i * 3 + 2] = point.z;
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;

    color.setHSL(config.hue, config.saturation, config.lightness);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: clusterIndex === 0 ? 0.021 : 0.018,
    transparent: true,
    opacity: clusterIndex === 0 ? 1 : 0.96,
    depthWrite: false,
    depthTest: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 10 + clusterIndex;
  orbSwarmRoot.add(points);

  orbClusters.push({
    config,
    geometry,
    points,
    positions,
    colors,
    baseOffsets,
    color
  });
};

const initOrbSwarm = () => {
  if (orbClusters.length > 0) return;
  ORB_CONFIGS.forEach((config, index) => createOrbCluster(config, index));
};

const updateOrbSwarm = (elapsed) => {
  if (!orbSwarmRoot.visible) return;

  orbCharge += (orbChargeTarget - orbCharge) * 0.045;
  orbChargePulse = Math.min(1, orbChargePulse + 0.018);

  for (let clusterIndex = 0; clusterIndex < orbClusters.length; clusterIndex += 1) {
    const cluster = orbClusters[clusterIndex];
    const { config, geometry, positions, colors, baseOffsets, color, points } = cluster;
    const { distance, phase, speed, hue, saturation, lightness, baseY, frontBias } = config;
    const material = points.material;
    const activeCharge = orbCharge + Math.sin(elapsed * 2 + clusterIndex * 0.8) * 0.05;

    let cx = Math.sin(elapsed * speed * 0.82 + phase) * distance * (0.95 + activeCharge * 0.08);
    let cy = Math.cos(elapsed * speed * 0.56 + phase * 1.3) * distance * 0.18 + baseY;
    let cz =
      Math.cos(elapsed * speed * 0.74 + phase * 1.7) * distance * 0.18 +
      frontBias +
      activeCharge * 0.06;

    if (clusterIndex === 0) {
      cx = Math.sin(elapsed * 0.46) * 0.04;
      cy = Math.cos(elapsed * 0.38) * 0.018 + 0.15;
      cz = distance * 1.02 + 0.22 + activeCharge * 0.08;
    }

    points.position.set(cx, cy, cz);
    points.rotation.y = elapsed * (0.18 + clusterIndex * 0.035);
    points.rotation.x = Math.sin(elapsed * 0.4 + phase) * 0.22;
    points.scale.setScalar(1 + activeCharge * 0.56 + orbChargePulse * 0.14);
    material.size = (clusterIndex === 0 ? 0.021 : 0.018) * (1 + activeCharge * 0.82 + orbChargePulse * 0.08);
    material.opacity = Math.min(1, (clusterIndex === 0 ? 0.98 : 0.93) * (0.8 + activeCharge * 0.55));

    const shimmerBase = Math.sin(elapsed * (1.8 + clusterIndex * 0.18)) * 0.08;
    for (let i = 0; i < positions.length; i += 3) {
      const pIndex = i / 3;
      positions[i] = baseOffsets[i];
      positions[i + 1] = baseOffsets[i + 1];
      positions[i + 2] = baseOffsets[i + 2];

      const shimmer = shimmerBase + Math.sin(elapsed * 2.4 + pIndex * 0.09 + phase) * 0.05;
      color.setHSL(
        hue,
        Math.min(1, saturation + activeCharge * 0.08),
        Math.min(0.995, lightness + shimmer + activeCharge * 0.18 + orbChargePulse * 0.04)
      );
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }
};

const ensureActionInstance = (actionKey) => {
  if (!mixer) return null;
  if (actionInstances.has(actionKey)) return actionInstances.get(actionKey);
  const clip = actionClips.get(actionKey);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  if (actionKey === ACTION_KEYS.IDLE) {
    action.clampWhenFinished = false;
    action.setLoop(THREE.LoopRepeat, Infinity);
  } else {
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce, 1);
  }
  actionInstances.set(actionKey, action);
  return action;
};

const playIdle = ({ immediate = false } = {}) => {
  if (!mixer) return;
  const nextIdle = ensureActionInstance(ACTION_KEYS.IDLE);
  if (!nextIdle) return;

  const previousAction = actionInstances.get(activeActionKey);
  activeActionKey = ACTION_KEYS.IDLE;
  stage = STAGE.READY;
  stageElapsed = 0;
  setActiveButton("");
  setControlsEnabled(true);
  setStatus("火柴人待机中，可点击按钮或语音触发动作");

  nextIdle.enabled = true;
  nextIdle.setEffectiveTimeScale(1);
  nextIdle.setEffectiveWeight(1);

  if (immediate || !previousAction || previousAction === nextIdle) {
    nextIdle.reset().play();
    return;
  }

  nextIdle.reset();
  nextIdle.crossFadeFrom(previousAction, 0.28, true).play();
};

const playAction = (actionKey, { force = false } = {}) => {
  if (!actionsLoaded || !mixer) return;
  if (actionKey === ACTION_KEYS.IDLE) {
    playIdle();
    return;
  }
  if (!force && activeActionKey === actionKey && stage === STAGE.ACTION) return;

  const nextAction = ensureActionInstance(actionKey);
  if (!nextAction) return;
  const previousAction = actionInstances.get(activeActionKey) || idleAction || actionInstances.get(ACTION_KEYS.IDLE);

  activeActionKey = actionKey;
  stage = STAGE.ACTION;
  stageElapsed = 0;
  setActiveButton(actionKey);
  setControlsEnabled(false);
  setStatus(actionKey === ACTION_KEYS.DANCING ? "火柴人正在跳舞" : "火柴人正在打招呼");

  nextAction.reset();
  nextAction.enabled = true;
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  if (previousAction && previousAction !== nextAction) {
    nextAction.crossFadeFrom(previousAction, 0.22, true).play();
  } else {
    nextAction.fadeIn(0.2).play();
  }
};

const switchStage = (nextStage) => {
  stage = nextStage;
  stageElapsed = 0;

  if (stage === STAGE.REVEAL) {
    setStatus("火柴人正在出现...");
    pedestal.visible = true;
    glowRing.visible = true;
    aura.visible = true;
    orbSwarmRoot.visible = true;
    controlPanel.classList.remove("hidden");
    setControlsEnabled(false);
    updateVoiceUi({ hint: "目标已识别，正在准备动作控制" });

    if (modelRoot) {
      modelRoot.visible = true;
      modelRoot.scale.setScalar(modelScale * 0.001);
      modelRoot.position.set(0, 0.045, 0);
      modelRoot.rotation.set(0, 0, 0);
    }
  }

  if (stage === STAGE.READY) {
    setStatus("火柴人已就位，当前为待机动作");
    controlPanel.classList.remove("hidden");
    setControlsEnabled(true);
    setActiveButton("");
    if (lastRecognizedTranscript) {
      updateVoiceUi({ hint: `上次识别：${lastRecognizedTranscript}` });
    }
  }
};

const applyMaterialTuning = (root) => {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("envMapIntensity" in material) material.envMapIntensity = 2.3;
      if ("roughness" in material) material.roughness = Math.max(0.14, material.roughness * 0.72);
      if ("metalness" in material) material.metalness = Math.min(1, material.metalness * 1.04);
      if ("specularIntensity" in material && material.specularIntensity < 1.1) material.specularIntensity = 1.1;
      if ("clearcoat" in material && material.clearcoat < 0.45) material.clearcoat = 0.45;
      if ("clearcoatRoughness" in material) material.clearcoatRoughness = Math.min(0.22, material.clearcoatRoughness || 0.18);
      material.needsUpdate = true;
    }
  });
};

const initVoiceRecognition = () => {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    voiceSupported = false;
    updateVoiceUi();
    return;
  }

  voiceSupported = true;
  recognition = new SpeechRecognitionCtor();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    updateVoiceUi({ listening: true, hint: "请说“打招呼”“跳舞”“待机”或“点亮光球”" });
    setStatus("火柴人正在听你的动作指令");
  };

  recognition.onresult = (event) => {
    const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();

    if (!transcript) {
      setStatus("没有听清，请再说一次");
      return;
    }
    handleTranscript(transcript);
  };

  recognition.onerror = (event) => {
    updateVoiceUi({ listening: false, hint: "语音触发失败，请改用按钮" });
    setStatus(event?.error ? `语音识别失败：${event.error}` : "语音识别失败，请重试");
    setControlsEnabled(true);
    setIntentDebug({
      source: "error",
      transcript: lastRecognizedTranscript || "-",
      action: "语音识别失败",
      detail: event?.error || "浏览器语音识别失败"
    });
  };

  recognition.onend = () => {
    updateVoiceUi({ listening: false });
  };

  updateVoiceUi();
};

const loadStickmanAssets = async () => {
  initOrbSwarm();

  const [idleAsset, greetingAsset, dancingAsset] = await Promise.all([
    loader.loadAsync("./assets/idle_scale.glb"),
    loader.loadAsync("./assets/greeting_scale.glb"),
    loader.loadAsync("./assets/dancing_scale.glb")
  ]);

  modelRoot = idleAsset.scene;
  modelRoot.visible = false;

  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  modelRoot.position.x -= center.x;
  modelRoot.position.y -= box.min.y;
  modelRoot.position.z -= center.z;

  const targetHeight = 0.42;
  modelScale = targetHeight / Math.max(size.y, 0.001);
  modelRoot.scale.setScalar(modelScale);

  applyMaterialTuning(modelRoot);
  anchor.group.add(modelRoot);

  mixer = new THREE.AnimationMixer(modelRoot);
  if (idleAsset.animations[0]) {
    actionClips.set(ACTION_KEYS.IDLE, idleAsset.animations[0]);
  }
  if (greetingAsset.animations[0]) {
    actionClips.set(ACTION_KEYS.GREETING, greetingAsset.animations[0]);
  }
  if (dancingAsset.animations[0]) {
    actionClips.set(ACTION_KEYS.DANCING, dancingAsset.animations[0]);
  }

  idleAction = ensureActionInstance(ACTION_KEYS.IDLE);
  ensureActionInstance(ACTION_KEYS.GREETING);
  ensureActionInstance(ACTION_KEYS.DANCING);
  actionsLoaded = actionClips.has(ACTION_KEYS.IDLE) && actionClips.has(ACTION_KEYS.GREETING) && actionClips.has(ACTION_KEYS.DANCING);

  if (targetVisible && actionsLoaded) {
    switchStage(STAGE.REVEAL);
  }
};

loadStickmanAssets().catch((error) => {
  console.error("Failed to load stickman assets", error);
  setStatus("模型加载失败，请检查火柴人 GLB 文件");
  controlPanel.classList.remove("hidden");
  setControlsEnabled(false);
});

anchor.onTargetFound = () => {
  targetVisible = true;
  resetRevealFx();
  orbSwarmRoot.visible = true;
  setIntentDebug({
    source: "idle",
    transcript: "-",
    action: "目标已识别",
    detail: "等待火柴人完成出场"
  });

  if (actionsLoaded) {
    switchStage(STAGE.REVEAL);
  } else {
    setStatus("目标已识别，正在加载火柴人模型...");
  }
};

anchor.onTargetLost = () => {
  targetVisible = false;
  stage = STAGE.IDLE;
  stageElapsed = 0;
  resetRevealFx();
  controlPanel.classList.remove("hidden");
  setControlsEnabled(false);
  if (modelRoot) {
    modelRoot.visible = false;
  }
  for (const action of actionInstances.values()) {
    action.stop();
  }
  activeActionKey = ACTION_KEYS.IDLE;
  setStatus("扫描图片目标，查看火柴人动作演示");
  updateVoiceUi({ hint: "等待识别目标图后启用语音和动作按钮" });
  setIntentDebug({
    source: "idle",
    transcript: "-",
    action: "等待识别目标图",
    detail: "识别成功后显示本次动作来源"
  });
};

const start = async () => {
  startButton.disabled = true;
  setStatus("正在启动 AR 相机...");

  if (!window.isSecureContext) {
    setStatus("移动端需要 HTTPS 访问 AR 页面，请使用 https:// 链接");
    startButton.disabled = false;
    return;
  }

  try {
    await mindARThree.start();
    startButton.classList.add("hidden");
    effectElapsed = 0;
    orbSwarmRoot.visible = false;
    controlPanel.classList.remove("hidden");
    setControlsEnabled(false);
    updateVoiceUi({ hint: "等待识别目标图后启用语音和动作按钮" });
    setIntentDebug({
      source: "idle",
      transcript: "-",
      action: "等待识别目标图",
      detail: "识别成功后显示 Kimi 或本地兜底"
    });
    setStatus("扫描图片目标，查看火柴人动作演示");
    loop();
  } catch (error) {
    console.error("MindAR failed to start", error);
    startButton.disabled = false;
    setStatus("AR 启动失败：请检查相机权限、HTTPS 与浏览器设置");
  }
};

startButton.addEventListener("click", start);

for (const button of actionButtons) {
  button.addEventListener("click", () => {
    if (!targetVisible || stage === STAGE.REVEAL) return;
    setIntentDebug({
      source: "manual",
      transcript: "-",
      action: actionLabel(button.dataset.action),
      detail: "手动按钮触发"
    });
    playAction(button.dataset.action, { force: true });
  });
}

if (voiceButton) {
  voiceButton.addEventListener("click", () => {
    if (!voiceSupported || !recognition) {
      updateVoiceUi();
      return;
    }
    if (!targetVisible || stage === STAGE.REVEAL) {
      setStatus("请先扫描目标图，等待火柴人出现");
      return;
    }
    if (voiceListening) {
      recognition.stop();
      return;
    }
    recognition.start();
  });
}

initVoiceRecognition();
setControlsEnabled(false);
setIntentDebug();

const animateReveal = (elapsed) => {
  const progress = Math.min(elapsed / 0.9, 1);
  const eased = 1 - Math.pow(1 - progress, 3);

  pedestal.material.emissiveIntensity = 0.6 + progress * 1.1;
  glowRing.material.opacity = 0.18 + progress * 0.5;
  glowRing.scale.setScalar(1 + progress * 1.25);
  aura.material.opacity = 0.08 + progress * 0.28;

  if (modelRoot) {
    const pulse = 1 + Math.sin(elapsed * 8) * 0.03;
    modelRoot.scale.setScalar(modelScale * (0.001 + eased * 0.999) * pulse);
  }

  orbSwarmRoot.scale.setScalar(0.8 + eased * 0.2);

  if (progress >= 1) {
    if (modelRoot) {
      modelRoot.scale.setScalar(modelScale);
    }
    orbSwarmRoot.scale.setScalar(1);
    playIdle({ immediate: true });
    setTimeout(() => {
      if (targetVisible) playAction(ACTION_KEYS.GREETING, { force: true });
    }, 240);
  }
};

const animateReady = (elapsed, dt) => {
  pedestal.material.emissiveIntensity = 1.22 + Math.sin(elapsed * 2.1) * 0.12;
  glowRing.material.opacity = 0.38 + Math.sin(elapsed * 2.2) * 0.1;
  glowRing.scale.setScalar(2.1 + Math.sin(elapsed * 1.4) * 0.06);
  aura.material.opacity = 0.18 + Math.sin(elapsed * 2.6) * 0.05;

  if (modelRoot) {
    modelRoot.position.y = 0.045 + Math.sin(elapsed * 1.3) * 0.01;
    modelRoot.rotation.y = Math.sin(elapsed * 0.7) * 0.1;
  }

  if (mixer) {
    mixer.update(dt);
  }
};

const animateAction = (elapsed, dt) => {
  animateReady(elapsed, dt);
  const currentAction = actionInstances.get(activeActionKey);
  if (currentAction && !currentAction.isRunning()) {
    playIdle();
  }
};

const loop = () => {
  const dt = Math.min(clock.getDelta(), 0.05);
  stageElapsed += dt;
  effectElapsed += dt;

  if (targetVisible) {
    if (stage === STAGE.REVEAL) animateReveal(stageElapsed);
    if (stage === STAGE.READY) animateReady(stageElapsed, dt);
    if (stage === STAGE.ACTION) animateAction(stageElapsed, dt);
    updateOrbSwarm(effectElapsed);
  }

  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(loop);
};

window.addEventListener("beforeunload", () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  pmremGenerator.dispose();
  mindARThree.stop();
});
