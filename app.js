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
let targetVisible = false;
let voiceSupported = false;
let voiceListening = false;
let recognition;
let activeActionKey = ACTION_KEYS.IDLE;
let actionsLoaded = false;
let lastRecognizedTranscript = "";
let idleAction = null;

const actionClips = new Map();
const actionInstances = new Map();

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

const setStatus = (text) => {
  statusText.textContent = text;
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
  voiceHint.textContent = hint || (listening ? "请说“打招呼”“跳舞”或“待机”" : "可以说“打招呼”“跳舞”或“待机”");
};

const inferLocalAction = (transcript) => {
  const text = String(transcript || "").trim();
  if (!text) return null;
  if (text.includes("待机") || text.includes("休息") || text.includes("站好")) return ACTION_KEYS.IDLE;
  if (text.includes("跳") || text.includes("舞")) return ACTION_KEYS.DANCING;
  if (text.includes("招呼") || text.includes("挥") || text.includes("手")) return ACTION_KEYS.GREETING;
  return null;
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

  try {
    const payload = await resolveIntentWithKimi(transcript);
    const actionKey = payload?.intent === ACTION_KEYS.DANCING
      ? ACTION_KEYS.DANCING
      : payload?.intent === ACTION_KEYS.GREETING
        ? ACTION_KEYS.GREETING
        : payload?.intent === ACTION_KEYS.IDLE
          ? ACTION_KEYS.IDLE
          : null;

    if (actionKey) {
      setStatus(
        payload?.reply ||
        (actionKey === ACTION_KEYS.DANCING
          ? "Kimi 判定：跳舞"
          : actionKey === ACTION_KEYS.GREETING
            ? "Kimi 判定：打招呼"
            : "Kimi 判定：回到待机")
      );
      playAction(actionKey, { force: true });
      return;
    }
  } catch (error) {
    console.warn("Kimi intent failed, fallback to local keyword mapping", error);
  }

  const fallbackAction = inferLocalAction(transcript);
  if (fallbackAction) {
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
    return;
  }

  setControlsEnabled(true);
  setStatus(`未识别动作：${transcript}`);
  updateVoiceUi({ listening: false, hint: "未匹配动作，可说“打招呼”或“跳舞”" });
};

const resetRevealFx = () => {
  pedestal.visible = false;
  glowRing.visible = false;
  aura.visible = false;
  glowRing.material.opacity = 0;
  glowRing.scale.setScalar(1);
  aura.material.opacity = 0;
  pedestal.material.emissiveIntensity = 0.6;
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
    controlPanel.classList.add("hidden");
    setControlsEnabled(false);

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
    updateVoiceUi({ listening: true, hint: "请说“打招呼”“跳舞”或“待机”" });
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
  };

  recognition.onend = () => {
    updateVoiceUi({ listening: false });
  };

  updateVoiceUi();
};

const loadStickmanAssets = async () => {
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
});

anchor.onTargetFound = () => {
  targetVisible = true;
  resetRevealFx();

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
  controlPanel.classList.add("hidden");
  setControlsEnabled(false);
  if (modelRoot) {
    modelRoot.visible = false;
  }
  for (const action of actionInstances.values()) {
    action.stop();
  }
  activeActionKey = ACTION_KEYS.IDLE;
  setStatus("扫描图片目标，查看火柴人动作演示");
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

  if (progress >= 1) {
    if (modelRoot) {
      modelRoot.scale.setScalar(modelScale);
    }
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

  if (targetVisible) {
    if (stage === STAGE.REVEAL) animateReveal(stageElapsed);
    if (stage === STAGE.READY) animateReady(stageElapsed, dt);
    if (stage === STAGE.ACTION) animateAction(stageElapsed, dt);
  }

  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(loop);
};

window.addEventListener("beforeunload", () => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  pmremGenerator.dispose();
  mindARThree.stop();
});
