import * as PIXI from 'pixi.js';
import { GameState, WarriorState, Vector2D, JointState } from '../game-state/game-state-types';

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 600;

// Add color constants
const GROUND_COLOR = 0x3a5f0b; // Dark green for the ground
const TORSO_COLOR = 0xff0000; // Red for the torso
const HEAD_COLOR = 0xffd700; // Gold for the head
const NECK_COLOR = 0xffa07a; // Light salmon for the neck
const ARM_COLOR = 0x1e90ff; // Dodger blue for arms
const HAND_COLOR = 0xffdab9; // Peach puff for hands
const LEG_COLOR = 0x32cd32; // Lime green for legs
const FOOT_COLOR = 0x8b4513; // Saddle brown for feet
const SWORD_COLOR = 0xc0c0c0; // Silver for the sword
const JOINT_COLOR = 0x000000; // Black for joints

let gameContainer: PIXI.Container;
let arena: PIXI.Container;
let warriors: PIXI.Container[];

export function initializeRenderer(app: PIXI.Application) {
  gameContainer = new PIXI.Container();
  app.stage.addChild(gameContainer);

  arena = createArena();
  gameContainer.addChild(arena);

  warriors = [];
}

export function renderGameState(app: PIXI.Application, gameState: GameState) {
  if (!gameContainer) {
    initializeRenderer(app);
  }

  // Update warriors
  gameState.warriors.forEach((warriorState, index) => {
    if (!warriors[index]) {
      warriors[index] = createWarrior();
      gameContainer.addChild(warriors[index]);
    }
    updateWarrior(warriors[index], warriorState);
  });

  // Render the scene
  app.renderer.render(app.stage);
}

function createArena(): PIXI.Container {
  const arenaContainer = new PIXI.Container();

  // Render ground
  const ground = new PIXI.Graphics();
  ground.beginFill(GROUND_COLOR);
  ground.drawRect(0, SCREEN_HEIGHT - 50, SCREEN_WIDTH, 50);
  ground.endFill();
  arenaContainer.addChild(ground);

  return arenaContainer;
}

function createWarrior(): PIXI.Container {
  const warrior = new PIXI.Container();

  const bodyParts = [
    'torso',
    'neck',
    'head',
    'leftUpperArm',
    'leftForearm',
    'leftHand',
    'rightUpperArm',
    'rightForearm',
    'rightHand',
    'leftThigh',
    'leftCalf',
    'leftFoot',
    'rightThigh',
    'rightCalf',
    'rightFoot',
    'sword',
  ];
  bodyParts.forEach((part) => {
    const graphics = new PIXI.Graphics();
    graphics.name = part;
    warrior.addChild(graphics);
  });

  // Add joints
  const joints = [
    'neck',
    'head',
    'leftShoulder',
    'leftElbow',
    'leftWrist',
    'rightShoulder',
    'rightElbow',
    'rightWrist',
    'leftHip',
    'leftKnee',
    'leftAnkle',
    'rightHip',
    'rightKnee',
    'rightAnkle',
    'swordJoint',
  ];
  joints.forEach((joint) => {
    const graphics = new PIXI.Graphics();
    graphics.name = `joint_${joint}`;
    warrior.addChild(graphics);
  });

  return warrior;
}

function updateWarrior(warriorContainer: PIXI.Container, warriorState: WarriorState) {
  const bodyParts = [
    { name: 'torso', color: TORSO_COLOR, state: warriorState.torso },
    { name: 'neck', color: NECK_COLOR, state: warriorState.neck },
    { name: 'head', color: HEAD_COLOR, state: warriorState.head },
    { name: 'leftUpperArm', color: ARM_COLOR, state: warriorState.leftUpperArm },
    { name: 'leftForearm', color: ARM_COLOR, state: warriorState.leftForearm },
    { name: 'leftHand', color: HAND_COLOR, state: warriorState.leftHand },
    { name: 'rightUpperArm', color: ARM_COLOR, state: warriorState.rightUpperArm },
    { name: 'rightForearm', color: ARM_COLOR, state: warriorState.rightForearm },
    { name: 'rightHand', color: HAND_COLOR, state: warriorState.rightHand },
    { name: 'leftThigh', color: LEG_COLOR, state: warriorState.leftThigh },
    { name: 'leftCalf', color: LEG_COLOR, state: warriorState.leftCalf },
    { name: 'leftFoot', color: FOOT_COLOR, state: warriorState.leftFoot },
    { name: 'rightThigh', color: LEG_COLOR, state: warriorState.rightThigh },
    { name: 'rightCalf', color: LEG_COLOR, state: warriorState.rightCalf },
    { name: 'rightFoot', color: FOOT_COLOR, state: warriorState.rightFoot },
  ];

  bodyParts.forEach((part) => {
    const graphics = warriorContainer.getChildByName(part.name) as PIXI.Graphics;
    updateBodyPart(graphics, part.state, part.color);
  });

  // Update sword
  const swordGraphics = warriorContainer.getChildByName('sword') as PIXI.Graphics;
  updateSword(swordGraphics, warriorState.sword);

  // Update joints
  Object.entries(warriorState.joints).forEach(([jointName, jointState]) => {
    const jointGraphics = warriorContainer.getChildByName(`joint_${jointName}`) as PIXI.Graphics;
    updateJoint(jointGraphics, jointState);
  });
}

function updateBodyPart(graphics: PIXI.Graphics, state: { position: Vector2D; vertices: Vector2D[] }, color: number) {
  graphics.clear();
  graphics.beginFill(color);

  if (state.vertices.length > 0) {
    graphics.moveTo(state.vertices[0].x, state.vertices[0].y);
    for (let i = 1; i < state.vertices.length; i++) {
      graphics.lineTo(state.vertices[i].x, state.vertices[i].y);
    }
    graphics.closePath();
  } else {
    // Fallback to default rectangle if no vertices
    graphics.drawRect(state.position.x - 10, state.position.y - 10, 20, 20);
  }

  graphics.endFill();
}

function updateSword(
  graphics: PIXI.Graphics,
  swordState: {
    position: Vector2D;
    vertices: Vector2D[];
    attachedTo: 'leftHand' | 'rightHand';
  },
) {
  graphics.clear();
  graphics.beginFill(SWORD_COLOR);

  if (swordState.vertices.length > 0) {
    graphics.moveTo(swordState.vertices[0].x, swordState.vertices[0].y);
    for (let i = 1; i < swordState.vertices.length; i++) {
      graphics.lineTo(swordState.vertices[i].x, swordState.vertices[i].y);
    }
    graphics.closePath();
  } else {
    // Fallback to default rectangle if no vertices
    graphics.drawRect(swordState.position.x - 2.5, swordState.position.y - 30, 5, 60);
  }

  graphics.endFill();
}

function updateJoint(graphics: PIXI.Graphics, jointState: JointState) {
  graphics.clear();
  graphics.beginFill(JOINT_COLOR);
  graphics.drawCircle(jointState.anchorA.x, jointState.anchorA.y, 2);
  graphics.endFill();

  // Optionally, draw a line between anchor points to visualize the joint
  graphics.lineStyle(1, JOINT_COLOR, 0.5);
  graphics.moveTo(jointState.anchorA.x, jointState.anchorA.y);
  graphics.lineTo(jointState.anchorB.x, jointState.anchorB.y);
}

// Function to clean up renderer resources
export function cleanupRenderer() {
  if (gameContainer) {
    gameContainer.destroy({ children: true });
  }
}
