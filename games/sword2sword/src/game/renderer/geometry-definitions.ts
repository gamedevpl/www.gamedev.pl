import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d';

// Character geometry definitions
export const CHARACTER_RADIUS = 0.25;
export const CHARACTER_HEIGHT = 1.0;
export const HEAD_RADIUS = 0.15;
export const SWORD_DIMENSIONS = { width: 0.05, height: 0.5, depth: 0.05 };

// Arena geometry definitions
export const ARENA_SIZE = 10;
export const WALL_HEIGHT = 2;
export const WALL_THICKNESS = 0.1;

// Character geometry creation functions
export function createCharacterThreeGeometry(): THREE.Object3D {
  const group = new THREE.Group();

  // Body
  const bodyGeometry = new THREE.CapsuleGeometry(CHARACTER_RADIUS, CHARACTER_HEIGHT - CHARACTER_RADIUS * 2, 8, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
  bodyMesh.position.y = CHARACTER_HEIGHT / 2;
  group.add(bodyMesh);

  // Head
  const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500 });
  const headMesh = new THREE.Mesh(headGeometry, headMaterial);
  headMesh.position.y = CHARACTER_HEIGHT;
  group.add(headMesh);

  // Sword
  const swordGeometry = new THREE.BoxGeometry(SWORD_DIMENSIONS.width, SWORD_DIMENSIONS.height, SWORD_DIMENSIONS.depth);
  const swordMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const swordMesh = new THREE.Mesh(swordGeometry, swordMaterial);
  swordMesh.position.set(CHARACTER_RADIUS + SWORD_DIMENSIONS.width / 2, CHARACTER_HEIGHT / 2, 0);
  group.add(swordMesh);

  return group;
}

export function createCharacterRapierDesc(): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.capsule(CHARACTER_HEIGHT / 2 - CHARACTER_RADIUS, CHARACTER_RADIUS);
}

// Arena geometry creation functions
export function createArenaThreeGeometry(): THREE.Object3D {
  const group = new THREE.Group();

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  group.add(floorMesh);

  // Walls
  const wallGeometry = new THREE.BoxGeometry(ARENA_SIZE, WALL_HEIGHT, WALL_THICKNESS);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x666666 });

  const createWall = (position: THREE.Vector3, rotation: THREE.Euler) => {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.copy(position);
    wall.rotation.copy(rotation);
    group.add(wall);
  };

  createWall(new THREE.Vector3(0, WALL_HEIGHT / 2, ARENA_SIZE / 2), new THREE.Euler(0, 0, 0));
  createWall(new THREE.Vector3(0, WALL_HEIGHT / 2, -ARENA_SIZE / 2), new THREE.Euler(0, 0, 0));
  createWall(new THREE.Vector3(ARENA_SIZE / 2, WALL_HEIGHT / 2, 0), new THREE.Euler(0, Math.PI / 2, 0));
  createWall(new THREE.Vector3(-ARENA_SIZE / 2, WALL_HEIGHT / 2, 0), new THREE.Euler(0, Math.PI / 2, 0));

  return group;
}

export function createArenaRapierDesc(): RAPIER.ColliderDesc[] {
  const colliders: RAPIER.ColliderDesc[] = [];

  // Floor
  colliders.push(RAPIER.ColliderDesc.cuboid(ARENA_SIZE / 2, 0.1, ARENA_SIZE / 2));

  // Walls
  const wallDesc = RAPIER.ColliderDesc.cuboid(ARENA_SIZE / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2);
  colliders.push(wallDesc.setTranslation(0, WALL_HEIGHT / 2, ARENA_SIZE / 2));
  colliders.push(wallDesc.setTranslation(0, WALL_HEIGHT / 2, -ARENA_SIZE / 2));
  colliders.push(
    RAPIER.ColliderDesc.cuboid(WALL_THICKNESS / 2, WALL_HEIGHT / 2, ARENA_SIZE / 2).setTranslation(
      ARENA_SIZE / 2,
      WALL_HEIGHT / 2,
      0,
    ),
  );
  colliders.push(
    RAPIER.ColliderDesc.cuboid(WALL_THICKNESS / 2, WALL_HEIGHT / 2, ARENA_SIZE / 2).setTranslation(
      -ARENA_SIZE / 2,
      WALL_HEIGHT / 2,
      0,
    ),
  );

  return colliders;
}
