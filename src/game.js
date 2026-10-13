import * as THREE from 'three';
import bridge from '@vkontakte/vk-bridge';
import { sounds } from './audio.js';

export class GameManager {
  constructor(scene, camera, physics, tableLoader) {
    this.scene = scene;
    this.camera = camera;
    this.physics = physics;
    this.tableLoader = tableLoader;

    // Game State
    this.score = 0;
    this.highScore = 0;
    this.balls = 3;
    this.maxBalls = 3;
    this.isGameOver = false;

    // Plunger State
    this.isPlungerCharging = false;
    this.plungerPower = 0; // 0 to 1

    // Controls state
    this.leftPressed = false;
    this.rightPressed = false;

    // Camera modes
    this.cameraMode = 0;
    this.cameraViews = [
      { name: 'Стандарт', pos: new THREE.Vector3(0, 24, 25), target: new THREE.Vector3(0, 0, 4) },
      { name: 'Экшен', pos: new THREE.Vector3(0, 16, 19), target: new THREE.Vector3(0, 0, 7) },
      { name: 'Вид сверху', pos: new THREE.Vector3(0, 32, 6), target: new THREE.Vector3(0, 0, 4) }
    ];

    // DOM Elements
    this.uiScore = document.getElementById('ui-score');
    this.uiBalls = document.getElementById('ui-balls');
    this.uiPlungerBar = document.getElementById('ui-plunger-bar');
    this.popupsContainer = document.getElementById('score-popups');

    this.modalGameOver = document.getElementById('gameover-modal');
    this.modalScore = document.getElementById('gameover-score');
    this.modalBest = document.getElementById('gameover-best');
    this.btnRestart = document.getElementById('btn-restart');
    this.btnAdRevive = document.getElementById('btn-ad-revive');

    this.btnDebug = document.getElementById('btn-debug');
    this.btnCamera = document.getElementById('btn-camera');
    this.btnRespawn = document.getElementById('btn-respawn');

    this.touchLeft = document.getElementById('touch-flipper-left');
    this.touchRight = document.getElementById('touch-flipper-right');
    this.touchPlunger = document.getElementById('touch-plunger');

    this.setupInputs();
  }

  async init() {
    this.loadHighScore();
    this.setupPhysicsCallbacks();
    this.updateHUD();
    this.setCameraView(0);

    // Initial ball spawn
    this.physics.createBall();
    this.physics.spawnBall();
  }

  loadHighScore() {
    try {
      const saved = localStorage.getItem('pinball_highscore');
      if (saved) this.highScore = parseInt(saved, 10) || 0;
    } catch (e) {
      this.highScore = 0;
    }

    try {
      bridge.send('VKWebAppStorageGet', { keys: ['pinball_highscore'] })
        .then(data => {
          if (data && data.keys && data.keys[0] && data.keys[0].value) {
            const vkScore = parseInt(data.keys[0].value, 10) || 0;
            if (vkScore > this.highScore) {
              this.highScore = vkScore;
            }
          }
        })
        .catch(() => {});
    } catch (e) {}
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try {
        localStorage.setItem('pinball_highscore', String(this.highScore));
      } catch (e) {}

      try {
        bridge.send('VKWebAppStorageSet', {
          key: 'pinball_highscore',
          value: String(this.highScore)
        }).catch(() => {});
      } catch (e) {}
    }
  }

  setupPhysicsCallbacks() {
    this.physics.onScore = (pts, label, pos) => {
      this.addScore(pts, label, pos);
    };

    this.physics.onBumperHit = (bumper) => {
      const idx = this.physics.bumpers.findIndex(b => b.id === bumper.id);
      if (idx !== -1) {
        this.tableLoader.flashBumper(idx);
      }
    };

    this.physics.onDrain = () => {
      this.handleDrain();
    };
  }

  addScore(pts, label, pos) {
    if (this.isGameOver) return;
    this.score += pts;
    this.updateHUD();
    this.spawnScorePopup(pts, label);
  }

  spawnScorePopup(pts, label) {
    if (!this.popupsContainer) return;
    const el = document.createElement('div');
    el.className = 'score-popup';
    el.innerText = `+${pts} ${label ? label.toUpperCase() : ''}`;
    this.popupsContainer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 700);
  }

  handleDrain() {
    if (this.isGameOver) return;
    this.balls--;
    sounds.playDrain();
    this.updateHUD();

    if (this.balls > 0) {
      // Respawn next ball after short delay
      setTimeout(() => {
        if (!this.isGameOver) {
          this.physics.spawnBall();
        }
      }, 1000);
    } else {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.isGameOver = true;
    sounds.playGameOver();
    this.saveHighScore();

    if (this.modalScore) this.modalScore.innerText = this.score.toLocaleString();
    if (this.modalBest) this.modalBest.innerText = `РЕКОРД: ${this.highScore.toLocaleString()}`;
    if (this.modalGameOver) this.modalGameOver.style.display = 'flex';
  }

  restartGame() {
    this.score = 0;
    this.balls = this.maxBalls;
    this.isGameOver = false;
    if (this.modalGameOver) this.modalGameOver.style.display = 'none';
    this.updateHUD();
    this.physics.spawnBall();
  }

  async showRewardedAd() {
    console.log('[VK Bridge] Requesting Rewarded Video Ad...');
    try {
      const adPromise = bridge.send('VKWebAppShowNativeAds', { ad_format: 'rewarded' });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('VK Bridge ad timeout')), 1000)
      );
      const res = await Promise.race([adPromise, timeoutPromise]);
      if (res && res.result) {
        this.rewardExtraBall();
      } else {
        this.rewardExtraBall();
      }
    } catch (err) {
      console.warn('[VK Bridge] Rewarded Ad dev fallback:', err.message);
      this.rewardExtraBall();
    }
  }

  rewardExtraBall() {
    this.balls = 1;
    this.isGameOver = false;
    if (this.modalGameOver) this.modalGameOver.style.display = 'none';
    this.updateHUD();
    this.physics.spawnBall();
  }

  updateHUD() {
    if (this.uiScore) {
      this.uiScore.innerText = String(this.score).padStart(6, '0');
    }

    if (this.uiBalls) {
      const dots = this.uiBalls.children;
      for (let i = 0; i < dots.length; i++) {
        if (i < this.balls) {
          dots[i].classList.add('active');
        } else {
          dots[i].classList.remove('active');
        }
      }
    }
  }

  setCameraView(modeIndex) {
    this.cameraMode = modeIndex % this.cameraViews.length;
    const view = this.cameraViews[this.cameraMode];
    this.camera.position.copy(view.pos);
    this.camera.lookAt(view.target);
  }

  setupInputs() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      sounds.init();

      const code = e.code;
      const key = (e.key || '').toLowerCase();

      if (code === 'KeyA' || key === 'a' || key === 'ф' || code === 'ArrowLeft' || code === 'ShiftLeft') {
        this.leftPressed = true;
      }
      if (code === 'KeyD' || key === 'd' || key === 'в' || code === 'ArrowRight' || code === 'ShiftRight') {
        this.rightPressed = true;
      }
      if (code === 'Space' || code === 'ArrowDown' || key === ' ') {
        e.preventDefault();
        if (!e.repeat) this.isPlungerCharging = true;
      }
      if (code === 'KeyR' || key === 'r' || key === 'к') {
        this.physics.spawnBall();
      }
      if (code === 'F1') {
        e.preventDefault();
        const active = this.physics.toggleDebug();
        if (this.btnDebug) this.btnDebug.classList.toggle('active-toggle', active);
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      const key = (e.key || '').toLowerCase();

      if (code === 'KeyA' || key === 'a' || key === 'ф' || code === 'ArrowLeft' || code === 'ShiftLeft') {
        this.leftPressed = false;
      }
      if (code === 'KeyD' || key === 'd' || key === 'в' || code === 'ArrowRight' || code === 'ShiftRight') {
        this.rightPressed = false;
      }
      if (code === 'Space' || code === 'ArrowDown' || key === ' ') {
        e.preventDefault();
        if (this.isPlungerCharging) {
          this.physics.launchPlunger(this.plungerPower);
          this.isPlungerCharging = false;
          this.plungerPower = 0;
          if (this.uiPlungerBar) this.uiPlungerBar.style.height = '0%';
        }
      }
    });

    // Touch and Mouse on Screen halves
    const container = document.getElementById('canvas-container');
    if (container) {
      container.addEventListener('pointerdown', (e) => {
        sounds.init();
        if (e.clientY < window.innerHeight * 0.25) return; // top bar
        if (e.clientX < window.innerWidth * 0.5) {
          this.leftPressed = true;
        } else {
          this.rightPressed = true;
        }
      });

      const handlePointerUp = () => {
        this.leftPressed = false;
        this.rightPressed = false;
      };
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }

    // Touch Buttons
    if (this.touchLeft) {
      this.touchLeft.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        sounds.init();
        this.leftPressed = true;
        this.touchLeft.classList.add('pressed');
      });
      const endL = () => {
        this.leftPressed = false;
        this.touchLeft.classList.remove('pressed');
      };
      this.touchLeft.addEventListener('pointerup', endL);
      this.touchLeft.addEventListener('pointercancel', endL);
    }

    if (this.touchRight) {
      this.touchRight.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        sounds.init();
        this.rightPressed = true;
        this.touchRight.classList.add('pressed');
      });
      const endR = () => {
        this.rightPressed = false;
        this.touchRight.classList.remove('pressed');
      };
      this.touchRight.addEventListener('pointerup', endR);
      this.touchRight.addEventListener('pointercancel', endR);
    }

    if (this.touchPlunger) {
      this.touchPlunger.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        sounds.init();
        this.isPlungerCharging = true;
        this.touchPlunger.classList.add('pressed');
      });
      const endP = () => {
        if (this.isPlungerCharging) {
          this.physics.launchPlunger(this.plungerPower);
          this.isPlungerCharging = false;
          this.plungerPower = 0;
          if (this.uiPlungerBar) this.uiPlungerBar.style.height = '0%';
        }
        this.touchPlunger.classList.remove('pressed');
      };
      this.touchPlunger.addEventListener('pointerup', endP);
      this.touchPlunger.addEventListener('pointercancel', endP);
    }

    // Header buttons
    if (this.btnDebug) {
      this.btnDebug.addEventListener('click', () => {
        const active = this.physics.toggleDebug();
        this.btnDebug.classList.toggle('active-toggle', active);
      });
    }

    if (this.btnRespawn) {
      this.btnRespawn.addEventListener('click', () => {
        this.physics.spawnBall();
      });
    }

    if (this.btnCamera) {
      this.btnCamera.addEventListener('click', () => {
        this.setCameraView(this.cameraMode + 1);
      });
    }

    // Modal buttons
    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => {
        this.restartGame();
      });
    }

    if (this.btnAdRevive) {
      this.btnAdRevive.addEventListener('click', () => {
        this.showRewardedAd();
      });
    }
  }

  update(dt) {
    // Plunger power charge accumulation
    if (this.isPlungerCharging) {
      this.plungerPower = Math.min(1.0, this.plungerPower + dt * 1.1);
      if (this.uiPlungerBar) {
        this.uiPlungerBar.style.height = `${Math.round(this.plungerPower * 100)}%`;
      }
    }

    // Step physics with current controls
    this.physics.step(dt, this.leftPressed, this.rightPressed, this.isPlungerCharging, this.plungerPower);
    this.tableLoader.update(dt);
  }
}
