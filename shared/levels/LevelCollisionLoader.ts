// ==================================================
// SHARED LEVEL COLLISION LOADER (HAVOK STATIC HULLS)
//
// WHAT IT DOES:
// Generates headless Havok static physics bodies and shapes from a declarative
// LevelDefinition, providing identical physical collision boundaries for both
// the authoritative server and client prediction worlds.
//
// HOW IT WORKS:
// - Iterates through level.collisionHulls (Floors, Platforms, Boundary Walls).
// - For BOX shapes: instantiates PhysicsShapeBox with declared dimensions.
// - For CYLINDER shapes: instantiates PhysicsShapeCylinder with radius and height.
// - Sets up static PhysicsBody instances (PhysicsMotionType.STATIC) attached to
//   zero-overhead TransformNode anchors.
// - Zero visual meshes or materials are created (safe for headless NullEngine).
// - Exposes dispose() to destroy all bodies and shapes cleanly on room teardown.
//
// WHY IT EXISTS:
// Enforces 100% deterministic physical parity between server and client prediction
// while completely decoupling collision hulls from client rendering meshes (ADR-006).
// ==================================================

import {
  Scene,
  TransformNode,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCylinder,
  type PhysicsShape,
  Vector3,
  Quaternion,
} from "@babylonjs/core";
import type { LevelDefinition } from "../domain/Level";

export interface LoadedCollisionHull {
  id: string;
  node: TransformNode;
  body: PhysicsBody;
  shape: PhysicsShape;
}

export class LevelCollisionLoader {
  private level: LevelDefinition;
  private scene: Scene;
  private rootNode: TransformNode;
  private loadedHulls: LoadedCollisionHull[] = [];

  constructor(level: LevelDefinition, scene: Scene) {
    this.level = level;
    this.scene = scene;
    this.rootNode = new TransformNode(`level-collision-${level.id}`, scene);
    this.buildHulls();
  }

  private buildHulls(): void {
    for (const hull of this.level.collisionHulls) {
      const node = new TransformNode(`hull-node-${hull.id}`, this.scene);
      node.parent = this.rootNode;
      node.position.set(hull.position.x, hull.position.y, hull.position.z);

      if (hull.rotationEuler) {
        node.rotationQuaternion = Quaternion.FromEulerAngles(
          hull.rotationEuler.x,
          hull.rotationEuler.y,
          hull.rotationEuler.z,
        );
      } else {
        node.rotationQuaternion = Quaternion.Identity();
      }

      const body = new PhysicsBody(
        node,
        PhysicsMotionType.STATIC,
        false,
        this.scene,
      );

      let shape: PhysicsShape;

      if (hull.shapeType === "CYLINDER") {
        const height = hull.cylinderHeight ?? 1.0;
        const radius = hull.cylinderRadius ?? 1.0;
        const halfHeight = height / 2;

        shape = new PhysicsShapeCylinder(
          new Vector3(0, -halfHeight, 0),
          new Vector3(0, halfHeight, 0),
          radius,
          this.scene,
        );
      } else {
        // BOX
        const dims = hull.boxDimensions ?? { x: 1, y: 1, z: 1 };
        shape = new PhysicsShapeBox(
          Vector3.Zero(),
          Quaternion.Identity(),
          new Vector3(dims.x, dims.y, dims.z),
          this.scene,
        );
      }

      body.shape = shape;

      this.loadedHulls.push({
        id: hull.id,
        node,
        body,
        shape,
      });
    }
  }

  public getRootNode(): TransformNode {
    return this.rootNode;
  }

  public getHulls(): readonly LoadedCollisionHull[] {
    return this.loadedHulls;
  }

  public dispose(): void {
    for (const item of this.loadedHulls) {
      item.shape.dispose();
      item.body.dispose();
      item.node.dispose();
    }
    this.loadedHulls = [];
    this.rootNode.dispose();
  }
}
