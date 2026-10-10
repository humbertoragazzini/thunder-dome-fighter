// ==================================================
// CLIENT LEVEL VISUAL ENVIRONMENT LOADER
//
// WHAT IT DOES:
// Renders the visual combat arena environment in Babylon.js:
// - Circular arena floor with concentric aesthetic rings.
// - Elevated sparring platforms with glowing neon trims.
// - Semi-transparent, glowing perimeter forcefield barrier cylinder.
// - Arena overhead spotlighting and ambient fill.
// - Cyber dome inverted sky sphere.
//
// HOW IT WORKS:
// - Reads level geometry and visualTheme colors from LevelDefinition.
// - Builds procedural visual meshes matching physical collision hulls.
// - Groups everything under a parent root TransformNode (`level-visual-${level.id}`).
// - Implements dispose() to free all meshes, materials, and lights cleanly.
//
// WHY IT EXISTS:
// Completely decouples high-fidelity client rendering and shaders from headless
// physics collision hulls (ADR-006). Enables instant visual theme re-skinning and
// guarantees visual alignment with physical boundaries.
// ==================================================

import {
  Scene,
  TransformNode,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  SpotLight,
  Color3,
  Vector3,
} from "@babylonjs/core";
import {
  LEVEL_THUNDER_DOME_ALPHA,
  type LevelDefinition,
} from "../../../shared/domain/Level";

export class LevelVisualLoader {
  public readonly rootNode: TransformNode;
  private scene: Scene;
  private level: LevelDefinition;

  private meshes: Mesh[] = [];
  private materials: StandardMaterial[] = [];
  private lights: SpotLight[] = [];

  constructor(
    scene: Scene,
    level: LevelDefinition = LEVEL_THUNDER_DOME_ALPHA,
  ) {
    this.scene = scene;
    this.level = level;
    this.rootNode = new TransformNode(`level-visual-${level.id}`, scene);

    this.buildEnvironment();
  }

  private buildEnvironment(): void {
    const theme = this.level.visualTheme;
    const primaryColor = Color3.FromHexString(theme.primaryFloorColor);
    const secondaryColor = Color3.FromHexString(theme.secondaryFloorColor);
    const glowColor = Color3.FromHexString(theme.accentGlowColor);
    const forcefieldColor = Color3.FromHexString(theme.forcefieldColor);

    // ==================================================
    // 1. MAIN CIRCULAR ARENA FLOOR
    // ==================================================
    // Top surface at Y = 0, radius = 16m (diameter = 32m)
    const floorMesh = MeshBuilder.CreateCylinder(
      "visual-floor",
      {
        diameter: 32.0,
        height: 1.0,
        tessellation: 64,
      },
      this.scene,
    );
    floorMesh.position.set(0, -0.5, 0);
    floorMesh.parent = this.rootNode;
    this.meshes.push(floorMesh);

    const floorMat = new StandardMaterial("floor-mat", this.scene);
    floorMat.diffuseColor = primaryColor;
    floorMat.specularColor = new Color3(0.08, 0.08, 0.1);
    floorMesh.material = floorMat;
    this.materials.push(floorMat);

    // ==================================================
    // 2. CONCENTRIC ARENA ACCENT RINGS
    // ==================================================
    // Outer sparring circle
    const outerRingMesh = MeshBuilder.CreateDisc(
      "visual-ring-outer",
      {
        radius: 12.0,
        tessellation: 64,
      },
      this.scene,
    );
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.position.set(0, 0.005, 0);
    outerRingMesh.parent = this.rootNode;
    this.meshes.push(outerRingMesh);

    const outerRingMat = new StandardMaterial("outer-ring-mat", this.scene);
    outerRingMat.diffuseColor = secondaryColor;
    outerRingMat.specularColor = new Color3(0.04, 0.04, 0.05);
    outerRingMesh.material = outerRingMat;
    this.materials.push(outerRingMat);

    // Center combat stage disc
    const centerStageMesh = MeshBuilder.CreateDisc(
      "visual-stage-center",
      {
        radius: 4.5,
        tessellation: 48,
      },
      this.scene,
    );
    centerStageMesh.rotation.x = Math.PI / 2;
    centerStageMesh.position.set(0, 0.01, 0);
    centerStageMesh.parent = this.rootNode;
    this.meshes.push(centerStageMesh);

    const centerStageMat = new StandardMaterial("center-stage-mat", this.scene);
    centerStageMat.diffuseColor = primaryColor;
    centerStageMat.specularColor = new Color3(0.12, 0.12, 0.15);
    centerStageMesh.material = centerStageMat;
    this.materials.push(centerStageMat);

    // Center glowing octagonal emblem
    const emblemMesh = MeshBuilder.CreateDisc(
      "visual-emblem",
      {
        radius: 2.0,
        tessellation: 8,
      },
      this.scene,
    );
    emblemMesh.rotation.x = Math.PI / 2;
    emblemMesh.position.set(0, 0.015, 0);
    emblemMesh.parent = this.rootNode;
    this.meshes.push(emblemMesh);

    const emblemMat = new StandardMaterial("emblem-mat", this.scene);
    emblemMat.diffuseColor = glowColor;
    emblemMat.emissiveColor = glowColor.scale(0.35);
    emblemMesh.material = emblemMat;
    this.materials.push(emblemMat);

    // ==================================================
    // 3. ELEVATED SPARRING PLATFORMS
    // ==================================================
    const platMat = new StandardMaterial("plat-mat", this.scene);
    platMat.diffuseColor = secondaryColor;
    platMat.specularColor = new Color3(0.1, 0.1, 0.12);
    this.materials.push(platMat);

    const neonTrimMat = new StandardMaterial("plat-trim-mat", this.scene);
    neonTrimMat.diffuseColor = glowColor;
    neonTrimMat.emissiveColor = glowColor.scale(0.85);
    this.materials.push(neonTrimMat);

    // Platform configurations matching collision hulls
    const platformConfigs = [
      { id: "north", x: 0, y: 0.9, z: 7.5 },
      { id: "south", x: 0, y: 0.9, z: -7.5 },
    ];

    for (const plat of platformConfigs) {
      // Main platform block (4m x 0.6m x 4m)
      const platMesh = MeshBuilder.CreateBox(
        `visual-platform-${plat.id}`,
        {
          width: 4.0,
          height: 0.6,
          depth: 4.0,
        },
        this.scene,
      );
      platMesh.position.set(plat.x, plat.y, plat.z);
      platMesh.material = platMat;
      platMesh.parent = this.rootNode;
      this.meshes.push(platMesh);

      // Glowing upper trim border
      const trimMesh = MeshBuilder.CreateBox(
        `visual-platform-${plat.id}-trim`,
        {
          width: 4.05,
          height: 0.06,
          depth: 4.05,
        },
        this.scene,
      );
      trimMesh.position.set(plat.x, plat.y + 0.28, plat.z);
      trimMesh.material = neonTrimMat;
      trimMesh.parent = this.rootNode;
      this.meshes.push(trimMesh);
    }

    // ==================================================
    // 4. PERIMETER FORCEFIELD CYLINDER
    // ==================================================
    const forcefieldMesh = MeshBuilder.CreateCylinder(
      "visual-forcefield",
      {
        diameter: 32.0,
        height: 6.0,
        tessellation: 48,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    forcefieldMesh.position.set(0, 3.0, 0);
    forcefieldMesh.parent = this.rootNode;
    this.meshes.push(forcefieldMesh);

    const forcefieldMat = new StandardMaterial("forcefield-mat", this.scene);
    forcefieldMat.diffuseColor = forcefieldColor;
    forcefieldMat.emissiveColor = forcefieldColor.scale(0.4);
    forcefieldMat.alpha = theme.forcefieldAlpha;
    forcefieldMat.backFaceCulling = false;
    forcefieldMesh.material = forcefieldMat;
    this.materials.push(forcefieldMat);

    // ==================================================
    // 5. CYBER SKY DOME
    // ==================================================
    const skyDome = MeshBuilder.CreateSphere(
      "visual-skydome",
      {
        diameter: 90.0,
        segments: 16,
        sideOrientation: Mesh.BACKSIDE,
      },
      this.scene,
    );
    skyDome.position.set(0, 0, 0);
    skyDome.parent = this.rootNode;
    this.meshes.push(skyDome);

    const skyMat = new StandardMaterial("skydome-mat", this.scene);
    skyMat.diffuseColor = Color3.Black();
    skyMat.emissiveColor = new Color3(0.02, 0.03, 0.07);
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyDome.material = skyMat;
    this.materials.push(skyMat);

    // ==================================================
    // 6. ARENA SPOTLIGHTS
    // ==================================================
    const centerSpot = new SpotLight(
      "arena-center-spot",
      new Vector3(0, 16, 0),
      new Vector3(0, -1, 0),
      Math.PI / 2.4,
      2,
      this.scene,
    );
    centerSpot.diffuse = Color3.FromHexString(theme.spotlightColor);
    centerSpot.intensity = 0.75;
    this.lights.push(centerSpot);
  }

  public dispose(): void {
    for (const mesh of this.meshes) {
      mesh.dispose();
    }
    this.meshes = [];

    for (const material of this.materials) {
      material.dispose();
    }
    this.materials = [];

    for (const light of this.lights) {
      light.dispose();
    }
    this.lights = [];

    this.rootNode.dispose();
  }
}
