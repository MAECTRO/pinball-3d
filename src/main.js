import * as THREE from 'three';
window.THREE = THREE;
import bridge from '@vkontakte/vk-bridge';
import { PhysicsManager } from './physics.js';
import { TableLoader } from './table.js';
import { GameManager } from './game.js';

console.log('[Pinball 3D] Starting Gilligan’s Island Pinball for VK...');

// 1. VK Bridge Init
try {
  bridge.send('VKWebAppInit')
    .then((data) => console.log('[VK Bridge] Initialized:', data))
    .catch((err) => console.warn('[VK Bridge] Running outside VK iframe:', err));
} catch (e) {
  console.warn('[VK Bridge] Init caught error:', e);
}

// 2. Three.js Scene & Renderer Setup
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c14);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 24, 25);
camera.lookAt(0, 0, 4);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.65;
container.appendChild(renderer.domElement);

// Rich, juicy lighting setup: HemisphereLight + Ambient + Key Light + Fill Light + Table Glow
const hemiLight = new THREE.HemisphereLight(0xfff6ea, 0x446688, 1.6);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.5);
keyLight.position.set(10, 45, 18);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 1.0;
keyLight.shadow.camera.far = 120;
const d = 30;
keyLight.shadow.camera.left = -d;
keyLight.shadow.camera.right = d;
keyLight.shadow.camera.top = d;
keyLight.shadow.camera.bottom = -d;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const backLight = new THREE.DirectionalLight(0x90c0ff, 1.3);
backLight.position.set(-15, 30, -20);
scene.add(backLight);

// Dedicated overhead table light to illuminate the playfield artwork brilliantly
const playfieldLight = new THREE.PointLight(0xffeedd, 2.2, 35);
playfieldLight.position.set(0, 10, 5);
scene.add(playfieldLight);

// Handle window resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 3. Initialize Game Architecture
const physics = new PhysicsManager(scene);
const tableLoader = new TableLoader(scene, physics);
const game = new GameManager(scene, camera, physics, tableLoader);

window.gameManager = game;
window.physicsManager = physics;
window.tableLoader = tableLoader;

async function bootstrap() {
  const loadingStatus = document.getElementById('loading-status');
  const loadingScreen = document.getElementById('loading-screen');

  try {
    if (loadingStatus) loadingStatus.innerText = 'Инициализация физики Rapier3D (WebAssembly)...';
    await physics.init();

    if (loadingStatus) loadingStatus.innerText = 'Загрузка 3D-модели стола (GilligansIsland.fbx)...';
    await tableLoader.load((progress) => {
      const pct = Math.round(progress * 100);
      if (loadingStatus) loadingStatus.innerText = `Загрузка стола: ${pct}%`;
    });

    if (loadingStatus) loadingStatus.innerText = 'Подготовка игрового поля и шарика...';
    await game.init();

    // Hide loading screen smoothly
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 450);
    }

    console.log('[Pinball 3D] Game is ready to play!');
  } catch (err) {
    console.error('[Pinball 3D] Fatal bootstrap error:', err);
    if (loadingStatus) {
      loadingStatus.innerText = 'Ошибка инициализации: ' + err.message;
    }
  }
}

// 4. Game Animation Loop
let lastTime = performance.now();

function render(time) {
  window.frameCount = (window.frameCount || 0) + 1;
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  game.update(dt);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(render);
bootstrap();
