import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class TableLoader {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.fbx = null;

    this.leftFlipperMesh = null;
    this.leftFlipperSubMesh = null;
    this.rightFlipperMesh = null;
    this.rightFlipperSubMesh = null;

    this.shooterMesh = null;
    this.turnTableMesh = null;

    this.bumperMeshes = [];
    this.bumperLights = [];
    this.targetMeshes = [];
  }

  async load(onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.setResourcePath('/textures/');

      loader.load(
        '/source/GilligansIsland.fbx',
        (fbx) => {
          this.fbx = fbx;
          this.processTable();
          resolve(fbx);
        },
        (xhr) => {
          if (onProgress && xhr.total > 0) {
            onProgress(xhr.loaded / xhr.total);
          }
        },
        (err) => {
          console.error('[TableLoader] Error:', err);
          reject(err);
        }
      );
    });
  }

  processTable() {
    const fbx = this.fbx;

    // 1. Initial bounding box and normalization
    const initialBox = new THREE.Box3().setFromObject(fbx);
    const initialSize = new THREE.Vector3();
    initialBox.getSize(initialSize);
    const initialCenter = new THREE.Vector3();
    initialBox.getCenter(initialCenter);

    const maxDim = Math.max(initialSize.x, initialSize.y, initialSize.z);
    const targetSize = 40.0;
    const scale = targetSize / maxDim;
    fbx.scale.set(scale, scale, scale);
    fbx.position.sub(initialCenter.multiplyScalar(scale));

    this.scene.add(fbx);
    window.pinballFBX = fbx;

    // Make sure world matrices are fully updated before generating colliders
    fbx.updateMatrixWorld(true);

    const meshesTable = [];
    // List of substrings to ignore for static trimesh generation
    // Excludes dynamic parts (flippers, bumpers, shooter), helper boxes, armatures, cabinet exterior, decals
    const ignoreColliders = [
      'flipper', 'bumper', 'decal', 'screw', 'locknut', 'washer',
      'bulb', 'cabletie', 'cabinet', 'coindoor', 'backbox',
      'speakergrill', 'card', 'lockdownbar', 'ballstopper', 'plungercover', 'shooter', 'plane',
      'box', 'mech', 'insert', 'newpf', 'object025', 'wiring', 'sling'
    ];

    fbx.traverse((child) => {
      const isMesh = Boolean(child.isMesh);
      const isGroup = child.type === 'Group' || child.type === 'Object3D';

      let bSize = new THREE.Vector3();
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);

      if (isMesh && child.geometry) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          child.geometry.boundingBox.getSize(bSize);
          bSize.multiplyScalar(scale);
        }
      } else if (isGroup) {
        const grpBox = new THREE.Box3().setFromObject(child);
        grpBox.getSize(bSize);
      }

      // Record in console.table data structure (Requirement 1: Mesh and Group list)
      meshesTable.push({
        name: child.name || '(unnamed)',
        type: child.type || (isMesh ? 'Mesh' : 'Group'),
        posX: parseFloat(worldPos.x.toFixed(2)),
        posY: parseFloat(worldPos.y.toFixed(2)),
        posZ: parseFloat(worldPos.z.toFixed(2)),
        sizeX: parseFloat(bSize.x.toFixed(2)),
        sizeY: parseFloat(bSize.y.toFixed(2)),
        sizeZ: parseFloat(bSize.z.toFixed(2)),
        material: isMesh && child.material
          ? (Array.isArray(child.material)
              ? child.material.map(m => m.name || m.type).join(', ')
              : (child.material.name || child.material.type))
          : '-'
      });

      if (!isMesh) return;

      // Convert material to MeshStandardMaterial
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => this.convertMaterial(m, child.name));
        } else {
          child.material = this.convertMaterial(child.material, child.name);
        }
      }

      const nameLower = child.name.toLowerCase();

      // Detect Flippers
      if (nameLower === 'flipperrubber001') {
        this.leftFlipperMesh = child;
      } else if (nameLower === 'flipper001') {
        this.leftFlipperSubMesh = child;
      } else if (nameLower === 'flipper') {
        this.rightFlipperMesh = child;
      } else if (nameLower === 'flipperrubber') {
        this.rightFlipperSubMesh = child;
      }

      // Detect Plunger / Shooter
      if (nameLower === 'shooter') {
        this.shooterMesh = child;
      }

      // Detect Turntable
      if (nameLower.includes('turntable')) {
        this.turnTableMesh = child;
      }

      // Detect Bumpers
      if (nameLower.includes('bumperassembly') || nameLower.includes('bumpercap')) {
        this.bumperMeshes.push(child);
      }

      // Detect Targets
      if (nameLower.includes('target')) {
        this.targetMeshes.push(child);
      }

      // Build Rapier static colliders
      const shouldIgnore = ignoreColliders.some(k => nameLower.includes(k));
      if (!shouldIgnore) {
        this.physics.addMeshCollider(child);
      }
    });

    // 1. Output console.table as explicitly mandated by ТЗ
    console.table(meshesTable);
    window.__PINBALL_MESHES__ = meshesTable;

    // Connect Flippers to physics
    if (this.leftFlipperMesh && this.rightFlipperMesh) {
      this.physics.setupFlippers(
        this.leftFlipperMesh,
        this.rightFlipperMesh,
        this.leftFlipperSubMesh,
        this.rightFlipperSubMesh
      );
    } else {
      console.warn('[TableLoader] Flippers not found in FBX!', this.leftFlipperMesh, this.rightFlipperMesh);
    }

    // Connect Plunger / Shooter to physics
    this.physics.setupPlunger(this.shooterMesh);

    // Setup interactive bumpers, slingshots & kickers
    this.physics.setupBumpersAndInteractive();

    // Setup Bumper Lights
    this.setupBumperLights();
  }

  convertMaterial(oldMat, meshName) {
    if (!oldMat) return new THREE.MeshStandardMaterial({ color: 0x888888 });

    const isGlass = meshName.toLowerCase().includes('glass') || meshName.toLowerCase().includes('cover');
    const isMetal = meshName.toLowerCase().includes('metal') || meshName.toLowerCase().includes('wire') || meshName.toLowerCase().includes('screw') || meshName.toLowerCase().includes('rail');
    const isPlayfield = meshName.toLowerCase().includes('playfield');

    // Only use texture map if FBXLoader actually loaded a real image (avoid white dummy placeholders)
    const hasValidMap = Boolean(oldMat.map && oldMat.map.image && (oldMat.map.image.width || oldMat.map.image.complete));

    let baseColor = new THREE.Color(0xffffff);
    if (isPlayfield && !hasValidMap) {
      // Warm polished tournament pinball wood with lacquer clearcoat
      baseColor = new THREE.Color(0xd8a972);
    } else if (!hasValidMap && oldMat.color) {
      baseColor = oldMat.color.clone();
      if (baseColor.r < 0.25 && baseColor.g < 0.25 && baseColor.b < 0.25) {
        baseColor.offsetHSL(0, 0, 0.3);
      }
    }

    const standardMat = new THREE.MeshStandardMaterial({
      name: oldMat.name || 'StandardMat',
      color: baseColor,
      map: hasValidMap ? oldMat.map : null,
      normalMap: oldMat.normalMap || null,
      bumpMap: oldMat.bumpMap || null,
      roughness: isMetal ? 0.2 : (isGlass ? 0.08 : (isPlayfield ? 0.18 : 0.35)),
      metalness: isMetal ? 0.85 : (isPlayfield ? 0.08 : 0.05),
      transparent: isGlass || oldMat.transparent || (oldMat.opacity < 1.0),
      opacity: isGlass ? 0.25 : (oldMat.opacity !== undefined ? oldMat.opacity : 1.0),
      side: THREE.DoubleSide
    });

    return standardMat;
  }

  setupBumperLights() {
    this.physics.bumpers.forEach((bumper) => {
      const pLight = new THREE.PointLight(bumper.lightColor, 1.2, 8);
      pLight.position.set(bumper.x, bumper.y + 0.6, bumper.z);
      pLight.castShadow = false;
      this.scene.add(pLight);
      this.bumperLights.push({
        light: pLight,
        baseIntensity: 1.2,
        flashTimer: 0
      });
    });
  }

  flashBumper(bumperIndex) {
    if (this.bumperLights[bumperIndex]) {
      const bObj = this.bumperLights[bumperIndex];
      bObj.light.intensity = 8.0;
      bObj.flashTimer = 0.25;
    }

    // Punch scale bumper visual meshes
    this.bumperMeshes.forEach(m => {
      const mPos = new THREE.Vector3();
      m.getWorldPosition(mPos);
      const bumper = this.physics.bumpers[bumperIndex];
      if (bumper && Math.hypot(mPos.x - bumper.x, mPos.z - bumper.z) < 1.4) {
        m.scale.set(1.25, 1.25, 1.25);
        m.userData.punchTimer = 0.2;
      }
    });
  }

  update(dt) {
    // Fade bumper light flashes
    this.bumperLights.forEach(b => {
      if (b.flashTimer > 0) {
        b.flashTimer -= dt;
        b.light.intensity = THREE.MathUtils.lerp(b.light.intensity, b.baseIntensity, dt * 8);
      }
    });

    // Recover bumper mesh punch scales
    this.bumperMeshes.forEach(m => {
      if (m.userData.punchTimer > 0) {
        m.userData.punchTimer -= dt;
        m.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);
      }
    });

    // Interactive slow turntable island rotation
    if (this.turnTableMesh) {
      this.turnTableMesh.rotation.y += dt * 0.35;
    }
  }
}
