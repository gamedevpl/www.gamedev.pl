export enum WarriorAction {
  NONE,
  MOVE_LEFT,
  MOVE_RIGHT,
}

export type WarriorInput = {
  actionEnabled: Partial<Record<WarriorAction, boolean>>;
};

export type GameInput = {
  playerIndex: number;
  input: WarriorInput;
};

export type Vector2D = {
  x: number;
  y: number;
};

export type BodyPart = {
  position: Vector2D;
  vertices: Vector2D[];
};

export type JointState = {
  angle: number;
  anchorA: Vector2D;
  anchorB: Vector2D;
};

export type WarriorState = {
  position: Vector2D;
  torso: BodyPart;
  neck: BodyPart;
  head: BodyPart;
  leftUpperArm: BodyPart;
  leftForearm: BodyPart;
  leftHand: BodyPart;
  rightUpperArm: BodyPart;
  rightForearm: BodyPart;
  rightHand: BodyPart;
  leftThigh: BodyPart;
  leftCalf: BodyPart;
  leftFoot: BodyPart;
  rightThigh: BodyPart;
  rightCalf: BodyPart;
  rightFoot: BodyPart;
  sword: {
    position: Vector2D;
    vertices: Vector2D[];
    attachedTo: 'leftHand' | 'rightHand';
  };
  joints: {
    neck: JointState;
    head: JointState;
    leftShoulder: JointState;
    leftElbow: JointState;
    leftWrist: JointState;
    rightShoulder: JointState;
    rightElbow: JointState;
    rightWrist: JointState;
    leftHip: JointState;
    leftKnee: JointState;
    leftAnkle: JointState;
    rightHip: JointState;
    rightKnee: JointState;
    rightAnkle: JointState;
    swordJoint: JointState;
  };
};

export type GameState = {
  time: number;
  warriors: WarriorState[];
};