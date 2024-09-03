import * as THREE from 'three';
import { BattleState, CharacterState } from '../battle-state/battle-types';
import {
  createCharacterThreeGeometry,
  createArenaThreeGeometry,
  ARENA_SIZE
} from '../shared/geometry-definitions';

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private characterMeshes: THREE.Object3D[] = [];
  private arenaMesh: THREE.Object3D | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(width, height);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, ARENA_SIZE, ARENA_SIZE);
    this.camera.lookAt(0, 0, 0);

    this.initializeScene();
  }

  private initializeScene() {
    // Set up lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(ARENA_SIZE, ARENA_SIZE, ARENA_SIZE);
    this.scene.add(directionalLight);

    // Set up arena
    this.createArena();
  }

  private createArena() {
    this.arenaMesh = createArenaThreeGeometry();
    this.scene.add(this.arenaMesh);
  }

  public setSize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public render(battleState: BattleState) {
    this.updateCharacters(battleState.characters);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCharacters(characters: CharacterState[]) {
    characters.forEach((character, index) => {
      let characterMesh = this.characterMeshes[index];
      if (!characterMesh) {
        characterMesh = this.createCharacterMesh(index);
        this.characterMeshes[index] = characterMesh;
        this.scene.add(characterMesh);
      }

      characterMesh.position.set(character.position.x, character.position.y, character.position.z);
      characterMesh.rotation.set(character.rotation.x, character.rotation.y, character.rotation.z);

      this.updateCharacterState(characterMesh, character);
    });
  }

  private createCharacterMesh(index: number): THREE.Object3D {
    const characterMesh = createCharacterThreeGeometry();
    
    // Apply player-specific color
    const bodyMesh = characterMesh.children[0] as THREE.Mesh;
    (bodyMesh.material as THREE.MeshStandardMaterial).color.setHex(index === 0 ? 0xff0000 : 0x0000ff);

    return characterMesh;
  }

  private updateCharacterState(characterMesh: THREE.Object3D, character: CharacterState) {
    // Update character mesh based on state (e.g., attacking, blocking, jumping)
    const swordMesh = characterMesh.children[2];
    if (character.isAttacking) {
      swordMesh.rotation.x = Math.PI / 4;
    } else {
      swordMesh.rotation.x = 0;
    }

    if (character.isBlocking) {
      swordMesh.position.x = 0;
      swordMesh.position.z = 0.3;
    } else {
      swordMesh.position.x = 0.3;
      swordMesh.position.z = 0;
    }

    if (character.isJumping) {
      characterMesh.position.y += 0.1;
    }
  }
}