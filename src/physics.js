import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
window.RAPIER = RAPIER;
import { sounds } from './audio.js';

export class PhysicsManager {
  constructor(scene) {
    this.scene = scene;
    this.world = null;
    this.staticBody = null;
    this.eventQueue = null;

    // Ball
    this.ballMesh = null;
    this.ballBody = null;
    this.ballCollider = null;
    this.ballRadius = 0.23;

    // Flippers
    this.leftFlipperBody = null;
    this.rightFlipperBody = null;
    this.leftFlipperMesh = null;
    this.leftFlipperSubMesh = null;
    this.rightFlipperMesh = null;
    this.rightFlipperSubMesh = null;

    this.leftPivot = new THREE.Vector3(-2.14, -0.64, 13.19);
    this.rightPivot = new THREE.Vector3(1.40, -0.63, 13.22);

    this.leftAngle = 0;
    this.rightAngle = 0;
    this.maxFlipperAngle = 0.78; // ~45 degrees

    this.leftBaseQuat = new THREE.Quaternion();
    this.rightBaseQuat = new THREE.Quaternion();

    // Plunger / Shooter
    this.plungerMesh = null;
    this.plungerBody = null;
    this.plungerInitialPos = null;
    this.plungerOffset = 0;

    // Bumpers & Interactive elements
    this.bumpers = [
      { id: 1, name: 'Bumper 1', x: 1.66, y: -0.48, z: -1.99, radius: 0.72, pts: 500, lightColor: 0xff3344 },
      { id: 2, name: 'Bumper 2', x: 3.64, y: -0.48, z: -3.18, radius: 0.72, pts: 500, lightColor: 0x3388ff },
      { id: 3, name: 'Bumper 3', x: 3.67, y: -0.48, z: -0.83, radius: 0.72, pts: 500, lightColor: 0xffaa00 }
    ];

    this.slingshots = [
      { id: 'left', name: 'Left Slingshot', x: -3.03, y: -0.48, z: 10.60, radius: 0.68, pts: 250, kickDir: { x: 1.0, z: -1.0 } },
      { id: 'right', name: 'Right Slingshot', x: 2.21, y: -0.48, z: 10.62, radius: 0.68, pts: 250, kickDir: { x: -1.0, z: -1.0 } }
    ];

    this.kicker = { id: 'kicker', name: 'Kicker Saucer', x: 2.82, y: -0.87, z: -5.16, radius: 0.55, pts: 1000, kickDir: { x: -0.4, z: 1.0 } };

    this.interactiveColliders = new Map();
    this.bumperCooldowns = [0, 0, 0];
    this.slingshotCooldowns = { left: 0, right: 0 };
    this.kickerCooldown = 0;

    // Debug Render
    this.debugVisible = false;
    this.debugLines = null;

    // Callbacks
    this.onScore = null;
    this.onDrain = null;
    this.onBumperHit = null;
  }

  async init() {
    await RAPIER.init();
    // Gravity tilted down towards playfield surface (-Y) and towards flippers/drain (+Z)
    const gravity = { x: 0.0, y: -26.0, z: 9.5 };
    this.world = new RAPIER.World(gravity);
    this.eventQueue = new RAPIER.EventQueue(true);

    // Single fixed static body for table colliders
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    this.setupDebugRender();
    this.setupInvisibleBoundaries();
  }

  setupDebugRender() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(), 4));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85
    });

    this.debugLines = new THREE.LineSegments(geom, mat);
    this.debugLines.renderOrder = 999;
    this.debugLines.visible = false;
    this.scene.add(this.debugLines);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    if (this.debugLines) {
      this.debugLines.visible = this.debugVisible;
    }
    return this.debugVisible;
  }

  setupInvisibleBoundaries() {
    // 1. Invisible Glass Ceiling (keeps ball firmly on table even after huge bounces)
    const glassDesc = RAPIER.ColliderDesc.cuboid(7.0, 0.1, 15.0)
      .setTranslation(0.0, 0.6, 4.0)
      .setRestitution(0.2)
      .setFriction(0.01);
    this.world.createCollider(glassDesc, this.staticBody);

    // 2. Invisible Outer Perimeter Walls
    // Left outer wall
    const leftWall = RAPIER.ColliderDesc.cuboid(0.3, 2.0, 15.0)
      .setTranslation(-5.5, 0.0, 4.0)
      .setRestitution(0.4)
      .setFriction(0.05);
    this.world.createCollider(leftWall, this.staticBody);

    // Right outer wall
    const rightWall = RAPIER.ColliderDesc.cuboid(0.3, 2.0, 15.0)
      .setTranslation(5.4, 0.0, 4.0)
      .setRestitution(0.4)
      .setFriction(0.05);
    this.world.createCollider(rightWall, this.staticBody);

    // Top table arch wall
    const topWall = RAPIER.ColliderDesc.cuboid(7.0, 2.0, 0.3)
      .setTranslation(0.0, 0.0, -7.8)
      .setRestitution(0.4)
      .setFriction(0.05);
    this.world.createCollider(topWall, this.staticBody);

    // Bottom outlane walls behind apron (excluding center drain)
    // Left bottom guide
    const leftBottom = RAPIER.ColliderDesc.cuboid(1.5, 2.0, 0.3)
      .setTranslation(-3.5, 0.0, 16.5)
      .setRestitution(0.3);
    this.world.createCollider(leftBottom, this.staticBody);

    // Right shooter backstop (blocks ball from rolling off back of lane)
    const shooterBackstop = RAPIER.ColliderDesc.cuboid(0.6, 2.0, 0.2)
      .setTranslation(4.75, 0.0, 16.2)
      .setRestitution(0.1);
    this.world.createCollider(shooterBackstop, this.staticBody);

    // Solid shooter lane floor
    const shooterFloor = RAPIER.ColliderDesc.cuboid(0.6, 0.1, 10.0)
      .setTranslation(4.75, -0.92, 8.0)
      .setRestitution(0.1)
      .setFriction(0.02);
    this.world.createCollider(shooterFloor, this.staticBody);

    // 3. Shooter Lane Rails
    // Inner divider separating shooter lane from playfield
    const shooterDivider = RAPIER.ColliderDesc.cuboid(0.12, 1.0, 9.8)
      .setTranslation(4.25, -0.4, 6.0)
      .setRestitution(0.3);
    this.world.createCollider(shooterDivider, this.staticBody);

    // Shooter top curved deflector plate
    const deflector = RAPIER.ColliderDesc.cuboid(0.8, 1.0, 0.15)
      .setTranslation(4.65, -0.4, -6.8)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.7))
      .setRestitution(0.65);
    this.world.createCollider(deflector, this.staticBody);

    // Inlane / Outlane wire guides above flippers
    const leftGuide = RAPIER.ColliderDesc.cuboid(0.1, 0.8, 2.2)
      .setTranslation(-3.7, -0.5, 12.0)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.25))
      .setRestitution(0.4);
    this.world.createCollider(leftGuide, this.staticBody);

    const rightGuide = RAPIER.ColliderDesc.cuboid(0.1, 0.8, 2.2)
      .setTranslation(3.5, -0.5, 12.0)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.25))
      .setRestitution(0.4);
    this.world.createCollider(rightGuide, this.staticBody);
  }

  addMeshCollider(mesh) {
    if (!mesh.isMesh || !mesh.geometry) return;
    const geom = mesh.geometry;
    const posAttr = geom.attributes.position;
    if (!posAttr || posAttr.count < 3) return;

    mesh.updateWorldMatrix(true, false);

    // Transform vertices to world space
    const vertices = new Float32Array(posAttr.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      v.applyMatrix4(mesh.matrixWorld);
      vertices[i * 3] = v.x;
      vertices[i * 3 + 1] = v.y;
      vertices[i * 3 + 2] = v.z;
    }

    let indices;
    if (geom.index) {
      indices = new Uint32Array(geom.index.array);
    } else {
      indices = new Uint32Array(posAttr.count);
      for (let i = 0; i < posAttr.count; i++) indices[i] = i;
    }

    if (indices.length < 3) return;

    try {
      const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      colDesc.setRestitution(0.35);
      colDesc.setFriction(0.08);
      this.world.createCollider(colDesc, this.staticBody);
    } catch (err) {
      // Ignore degenerate trimeshes
    }
  }

  setupFlippers(leftMesh, rightMesh, leftSubMesh = null, rightSubMesh = null) {
    this.leftFlipperMesh = leftMesh;
    this.rightFlipperMesh = rightMesh;
    this.leftFlipperSubMesh = leftSubMesh;
    this.rightFlipperSubMesh = rightSubMesh;

    // Dynamically retrieve original pivot from FBX mesh world positions
    leftMesh.getWorldPosition(this.leftPivot);
    rightMesh.getWorldPosition(this.rightPivot);

    // Store base orientations
    this.leftBaseQuat.copy(leftMesh.quaternion);
    this.rightBaseQuat.copy(rightMesh.quaternion);

    // Left Flipper Body
    const leftBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.leftPivot.x, this.leftPivot.y, this.leftPivot.z)
      .setRotation(this.leftBaseQuat);
    this.leftFlipperBody = this.world.createRigidBody(leftBodyDesc);

    // Left Flipper Collider - rounded tapered cuboid extending along flipper arm
    const leftColDesc = RAPIER.ColliderDesc.cuboid(0.95, 0.35, 0.22)
      .setTranslation(0.85, 0.0, 0.28)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.35))
      .setRestitution(0.75)
      .setFriction(0.25);
    this.world.createCollider(leftColDesc, this.leftFlipperBody);

    // Right Flipper Body
    const rightBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this.rightPivot.x, this.rightPivot.y, this.rightPivot.z)
      .setRotation(this.rightBaseQuat);
    this.rightFlipperBody = this.world.createRigidBody(rightBodyDesc);

    // Right Flipper Collider
    const rightColDesc = RAPIER.ColliderDesc.cuboid(0.95, 0.35, 0.22)
      .setTranslation(-0.85, 0.0, 0.28)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.35))
      .setRestitution(0.75)
      .setFriction(0.25);
    this.world.createCollider(rightColDesc, this.rightFlipperBody);
  }

  setupPlunger(mesh) {
    this.plungerMesh = mesh;
    if (mesh) {
      this.plungerInitialPos = mesh.position.clone();
    }

    // Kinematic plunger body in right shooter lane
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(4.75, -0.65, 16.0);
    this.plungerBody = this.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(0.35, 0.4, 0.35)
      .setRestitution(0.75)
      .setFriction(0.1);
    this.world.createCollider(colDesc, this.plungerBody);
  }

  setupBumpersAndInteractive() {
    this.interactiveColliders.clear();

    // 1. Bumpers with ActiveEvents.COLLISION_EVENTS
    for (let b of this.bumpers) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(b.x, b.y, b.z);
      const body = this.world.createRigidBody(bodyDesc);

      const colDesc = RAPIER.ColliderDesc.cylinder(0.6, b.radius)
        .setRestitution(1.1)
        .setFriction(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = this.world.createCollider(colDesc, body);
      this.interactiveColliders.set(col.handle, { type: 'bumper', data: b });
    }

    // 2. Slingshots with ActiveEvents.COLLISION_EVENTS
    for (let s of this.slingshots) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(s.x, s.y, s.z);
      const body = this.world.createRigidBody(bodyDesc);

      const colDesc = RAPIER.ColliderDesc.cylinder(0.5, s.radius)
        .setRestitution(0.9)
        .setFriction(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = this.world.createCollider(colDesc, body);
      this.interactiveColliders.set(col.handle, { type: 'slingshot', data: s });
    }

    // 3. Kicker with ActiveEvents.COLLISION_EVENTS
    if (this.kicker) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(this.kicker.x, this.kicker.y, this.kicker.z);
      const body = this.world.createRigidBody(bodyDesc);

      const colDesc = RAPIER.ColliderDesc.cylinder(0.4, this.kicker.radius)
        .setRestitution(0.7)
        .setFriction(0.1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = this.world.createCollider(colDesc, body);
      this.interactiveColliders.set(col.handle, { type: 'kicker', data: this.kicker });
    }
  }

  createBall() {
    // 1. Visual 3D Mesh
    const ballGeom = new THREE.SphereGeometry(this.ballRadius, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.95,
      roughness: 0.12,
      envMapIntensity: 2.0
    });

    this.ballMesh = new THREE.Mesh(ballGeom, ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    this.scene.add(this.ballMesh);

    // 2. Rapier RigidBody with CCD enabled (Mandatory per ТЗ)
    const spawnPos = { x: 4.75, y: -0.65, z: 15.6 };
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setCcdEnabled(true)
      .setLinearDamping(0.08)
      .setAngularDamping(0.12);

    this.ballBody = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(this.ballRadius)
      .setRestitution(0.5)
      .setFriction(0.05)
      .setDensity(2.5)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    this.ballCollider = this.world.createCollider(colliderDesc, this.ballBody);
    this.syncBallMesh();
  }

  spawnBall(pos = { x: 4.75, y: -0.65, z: 15.6 }) {
    if (!this.ballBody) return;
    this.ballBody.setTranslation(pos, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncBallMesh();
  }

  syncBallMesh() {
    if (!this.ballMesh || !this.ballBody) return;
    const t = this.ballBody.translation();
    const r = this.ballBody.rotation();
    this.ballMesh.position.set(t.x, t.y, t.z);
    this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w);
  }

  updatePlunger(dt, isCharging, powerRatio) {
    const pullDistance = 1.4;
    if (isCharging) {
      this.plungerOffset = powerRatio * pullDistance;
    } else {
      this.plungerOffset = THREE.MathUtils.lerp(this.plungerOffset, 0, Math.min(1.0, dt * 30));
    }

    const currentZ = 16.0 + this.plungerOffset;
    if (this.plungerBody) {
      this.plungerBody.setNextKinematicTranslation({ x: 4.75, y: -0.65, z: currentZ });
    }
    if (this.plungerMesh && this.plungerInitialPos) {
      const scale = this.plungerMesh.parent ? this.plungerMesh.parent.scale.z : 0.0113;
      this.plungerMesh.position.z = this.plungerInitialPos.z + (this.plungerOffset / (scale || 0.0113));
    }
  }

  launchPlunger(powerRatio) {
    if (!this.ballBody) return;
    const t = this.ballBody.translation();
    // Only launch if ball is in the shooter lane
    if (t.x > 4.2 && t.z > 10.0) {
      // Transfer sharp impulse via applyImpulse along -Z as required by ТЗ
      const impulse = 3.6 + Math.max(0.2, powerRatio) * 6.8;
      this.ballBody.applyImpulse({ x: 0.0, y: 0.35, z: -impulse }, true);
      sounds.playPlungerLaunch();
    }
  }

  updateFlippers(leftPressed, rightPressed, dt) {
    const speed = 25.0; // Fast snap response

    // Left flipper target angle
    const targetLeft = leftPressed ? this.maxFlipperAngle : 0.0;
    const prevLeft = this.leftAngle;
    this.leftAngle = THREE.MathUtils.lerp(this.leftAngle, targetLeft, Math.min(1.0, speed * dt));

    if (leftPressed && prevLeft < 0.1 && this.leftAngle >= 0.1) {
      sounds.playFlipperUp();
    } else if (!leftPressed && prevLeft > 0.3 && this.leftAngle <= 0.3) {
      sounds.playFlipperDown();
    }

    // Right flipper target angle
    const targetRight = rightPressed ? this.maxFlipperAngle : 0.0;
    const prevRight = this.rightAngle;
    this.rightAngle = THREE.MathUtils.lerp(this.rightAngle, targetRight, Math.min(1.0, speed * dt));

    if (rightPressed && prevRight < 0.1 && this.rightAngle >= 0.1) {
      sounds.playFlipperUp();
    } else if (!rightPressed && prevRight > 0.3 && this.rightAngle <= 0.3) {
      sounds.playFlipperDown();
    }

    const upAxis = new THREE.Vector3(0, 1, 0);

    // Left rotation (positive angle around world Y)
    const lQuat = this.leftBaseQuat.clone();
    const lRot = new THREE.Quaternion().setFromAxisAngle(upAxis, this.leftAngle);
    lQuat.premultiply(lRot);

    if (this.leftFlipperMesh) {
      this.leftFlipperMesh.quaternion.copy(lQuat);
    }
    if (this.leftFlipperBody) {
      this.leftFlipperBody.setNextKinematicRotation(lQuat);
    }

    // Right rotation (negative angle around world Y)
    const rQuat = this.rightBaseQuat.clone();
    const rRot = new THREE.Quaternion().setFromAxisAngle(upAxis, -this.rightAngle);
    rQuat.premultiply(rRot);

    if (this.rightFlipperMesh) {
      this.rightFlipperMesh.quaternion.copy(rQuat);
    }
    if (this.rightFlipperBody) {
      this.rightFlipperBody.setNextKinematicRotation(rQuat);
    }
  }

  triggerBumperHit(bumper) {
    const idx = this.bumpers.findIndex(b => b.id === bumper.id);
    if (idx !== -1 && this.bumperCooldowns[idx] > 0) return;
    if (idx !== -1) this.bumperCooldowns[idx] = 0.18;

    if (!this.ballBody) return;
    const bPos = this.ballBody.translation();
    const dx = bPos.x - bumper.x;
    const dz = bPos.z - bumper.z;
    const angle = Math.atan2(dz, dx);
    const impulseMag = 7.5;
    const ix = Math.cos(angle) * impulseMag;
    const iz = Math.sin(angle) * impulseMag;

    this.ballBody.applyImpulse({ x: ix, y: 1.2, z: iz }, true);
    sounds.playBumperHit(700 + (idx !== -1 ? idx : 0) * 150);

    if (this.onBumperHit) this.onBumperHit(bumper);
    if (this.onScore) this.onScore(bumper.pts, bumper.name, { x: bumper.x, y: bumper.y + 0.5, z: bumper.z });
  }

  triggerSlingshotHit(slingshot) {
    if (this.slingshotCooldowns[slingshot.id] > 0) return;
    this.slingshotCooldowns[slingshot.id] = 0.2;

    if (!this.ballBody) return;
    const ix = slingshot.kickDir.x * 6.5;
    const iz = slingshot.kickDir.z * 6.5;
    this.ballBody.applyImpulse({ x: ix, y: 1.0, z: iz }, true);

    sounds.playSlingshot();
    if (this.onScore) this.onScore(slingshot.pts, slingshot.name, { x: slingshot.x, y: slingshot.y + 0.5, z: slingshot.z });
  }

  triggerKickerHit(kicker) {
    if (this.kickerCooldown > 0) return;
    this.kickerCooldown = 0.4;

    if (!this.ballBody) return;
    const ix = kicker.kickDir.x * 7.5;
    const iz = kicker.kickDir.z * 7.5;
    this.ballBody.applyImpulse({ x: ix, y: 1.5, z: iz }, true);

    sounds.playBumperHit(1000);
    if (this.onScore) this.onScore(kicker.pts, kicker.name, { x: kicker.x, y: kicker.y + 0.5, z: kicker.z });
  }

  drainRapierCollisionEvents() {
    if (!this.eventQueue || !this.ballCollider) return;

    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;
      const ballHandle = this.ballCollider.handle;
      let otherHandle = null;
      if (handle1 === ballHandle) otherHandle = handle2;
      else if (handle2 === ballHandle) otherHandle = handle1;
      else return;

      const interactive = this.interactiveColliders.get(otherHandle);
      if (!interactive) return;

      if (interactive.type === 'bumper') {
        this.triggerBumperHit(interactive.data);
      } else if (interactive.type === 'slingshot') {
        this.triggerSlingshotHit(interactive.data);
      } else if (interactive.type === 'kicker') {
        this.triggerKickerHit(interactive.data);
      }
    });
  }

  checkInteractiveCollisions(dt) {
    if (!this.ballBody) return;

    // Update cooldown timers
    for (let i = 0; i < this.bumperCooldowns.length; i++) {
      if (this.bumperCooldowns[i] > 0) this.bumperCooldowns[i] -= dt;
    }
    if (this.slingshotCooldowns.left > 0) this.slingshotCooldowns.left -= dt;
    if (this.slingshotCooldowns.right > 0) this.slingshotCooldowns.right -= dt;
    if (this.kickerCooldown > 0) this.kickerCooldown -= dt;

    // Drain official Rapier collision events
    this.drainRapierCollisionEvents();

    const bPos = this.ballBody.translation();

    // Fallback proximity trigger for high velocity tunneling defense
    for (let i = 0; i < this.bumpers.length; i++) {
      if (this.bumperCooldowns[i] > 0) continue;
      const bumper = this.bumpers[i];
      const dist = Math.hypot(bPos.x - bumper.x, bPos.z - bumper.z);
      if (dist < bumper.radius + this.ballRadius && Math.abs(bPos.y - bumper.y) < 0.8) {
        this.triggerBumperHit(bumper);
      }
    }

    for (let s of this.slingshots) {
      if (this.slingshotCooldowns[s.id] > 0) continue;
      const dist = Math.hypot(bPos.x - s.x, bPos.z - s.z);
      if (dist < s.radius + this.ballRadius && Math.abs(bPos.y - s.y) < 0.8) {
        this.triggerSlingshotHit(s);
      }
    }

    // Drain Check: ball fell below flippers into drain
    if (bPos.z > 14.8 && bPos.x > -2.4 && bPos.x < 2.4 && bPos.y < -0.4) {
      if (this.onDrain) {
        this.onDrain();
      }
    } else if (bPos.y < -3.0 || bPos.z > 22.0) {
      // Failsafe drain if ball fell out of bounds
      if (this.onDrain) {
        this.onDrain();
      }
    }
  }

  step(dt, leftPressed, rightPressed, isPlungerCharging = false, plungerPower = 0) {
    if (!this.world) return;

    this.updateFlippers(leftPressed, rightPressed, dt);
    this.updatePlunger(dt, isPlungerCharging, plungerPower);

    this.world.step(this.eventQueue);
    this.syncBallMesh();
    this.checkInteractiveCollisions(dt);

    if (this.debugVisible && this.debugLines) {
      const buffers = this.world.debugRender();
      this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3));
      this.debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
    }
  }
}
