import {
  NullEngine,
  Scene,
  TransformNode,
  Vector3,
  Quaternion,
  HavokPlugin,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
} from "@babylonjs/core";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import HavokPhysics from "@babylonjs/havok";

// --------------------------------------------------
// Catch errors Node might otherwise hide
// --------------------------------------------------

process.on("uncaughtException", (error) => {
  console.error("❌ UNCAUGHT EXCEPTION");
  console.error(error);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ UNHANDLED PROMISE REJECTION");
  console.error(reason);
});

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const PHYSICS_HZ = 60;
const PHYSICS_DT_MS = 1000 / PHYSICS_HZ;

// --------------------------------------------------
// Physics accumulator
// --------------------------------------------------

function createPhysicsAccumulator(scene: Scene, physicsDtMs: number) {
  console.log("🟡 Creating physics accumulator");

  let accumulator = 0;
  let lastTime = performance.now();
  let physicsStepCount = 0;

  return function updatePhysics() {
    try {
      const now = performance.now();

      const elapsed = now - lastTime;

      lastTime = now;

      accumulator += elapsed;

      let stepsThisUpdate = 0;

      while (accumulator >= physicsDtMs) {
        scene._advancePhysicsEngineStep(physicsDtMs);

        accumulator -= physicsDtMs;

        physicsStepCount++;
        stepsThisUpdate++;
      }

      if (stepsThisUpdate > 0) {
        console.log(
          `⚙️ Physics stepped ${stepsThisUpdate} time(s) | total=${physicsStepCount}`,
        );
      }
    } catch (error) {
      console.error("❌ Error inside physics accumulator");
      console.error(error);
    }
  };
}

// --------------------------------------------------
// Main
// --------------------------------------------------

async function main() {
  console.log("");
  console.log("==========================================");
  console.log("🚀 STARTING HEADLESS BABYLON SERVER");
  console.log("==========================================");
  console.log("");

  console.log(`Node version: ${process.version}`);
  console.log(`Physics Hz: ${PHYSICS_HZ}`);
  console.log(`Physics dt: ${PHYSICS_DT_MS} ms`);
  console.log("");

  // --------------------------------------------------
  // 1. Havok
  // --------------------------------------------------

  console.log("1️⃣ Initializing Havok...");

  const currentFile = fileURLToPath(import.meta.url);
  const currentDirectory = dirname(currentFile);

  const havokWasmPath = resolve(
    currentDirectory,
    "../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm",
  );

  console.log("Havok WASM path:");
  console.log(havokWasmPath);

  const havokWasmBuffer = await readFile(havokWasmPath);

  const havokWasm = havokWasmBuffer.buffer.slice(
    havokWasmBuffer.byteOffset,
    havokWasmBuffer.byteOffset + havokWasmBuffer.byteLength,
  );

  const havokInstance = await HavokPhysics({
    wasmBinary: havokWasm,
  });

  console.log("✅ Havok initialized");

  // --------------------------------------------------
  // 2. NullEngine
  // --------------------------------------------------

  console.log("2️⃣ Creating NullEngine...");

  const engine = new NullEngine();

  console.log("✅ NullEngine created");

  // --------------------------------------------------
  // 3. Scene
  // --------------------------------------------------

  console.log("3️⃣ Creating Babylon Scene...");

  const scene = new Scene(engine);

  console.log("✅ Scene created");

  // --------------------------------------------------
  // 4. Havok plugin
  // --------------------------------------------------

  console.log("4️⃣ Creating HavokPlugin...");

  const havokPlugin = new HavokPlugin(true, havokInstance);

  console.log("✅ HavokPlugin created");

  // --------------------------------------------------
  // 5. Enable physics
  // --------------------------------------------------

  console.log("5️⃣ Enabling physics...");

  const physicsEnabled = scene.enablePhysics(
    new Vector3(0, -9.81, 0),
    havokPlugin,
  );

  console.log("✅ scene.enablePhysics result:", physicsEnabled);

  console.log("Physics engine:", scene.getPhysicsEngine());

  // --------------------------------------------------
  // 6. Floor TransformNode
  // --------------------------------------------------

  console.log("6️⃣ Creating floor TransformNode...");

  const floorNode = new TransformNode("floor", scene);

  floorNode.position.set(0, -1.5, 0);

  floorNode.rotationQuaternion = Quaternion.Identity();

  console.log("✅ Floor node created:", floorNode.position.toString());

  // --------------------------------------------------
  // 7. Floor PhysicsBody
  // --------------------------------------------------

  console.log("7️⃣ Creating floor PhysicsBody...");

  const floorBody = new PhysicsBody(
    floorNode,
    PhysicsMotionType.STATIC,
    true,
    scene,
  );

  console.log("✅ Floor PhysicsBody created");

  // --------------------------------------------------
  // 8. Floor shape
  // --------------------------------------------------

  console.log("8️⃣ Creating floor PhysicsShapeBox...");

  const floorShape = new PhysicsShapeBox(
    Vector3.Zero(),
    Quaternion.Identity(),
    new Vector3(4, 0.1, 4),
    scene,
  );

  floorBody.shape = floorShape;

  console.log("✅ Floor shape created and assigned");

  // --------------------------------------------------
  // 9. Dynamic box TransformNode
  // --------------------------------------------------

  console.log("9️⃣ Creating box TransformNode...");

  const boxNode = new TransformNode("box", scene);

  boxNode.position.set(0, 1, 0);

  boxNode.rotationQuaternion = Quaternion.Identity();

  console.log("✅ Box node created:", boxNode.position.toString());

  // --------------------------------------------------
  // 10. Box PhysicsBody
  // --------------------------------------------------

  console.log("🔟 Creating box PhysicsBody...");

  const boxBody = new PhysicsBody(
    boxNode,
    PhysicsMotionType.DYNAMIC,
    false,
    scene,
  );

  console.log("✅ Box PhysicsBody created");

  // --------------------------------------------------
  // 11. Box shape
  // --------------------------------------------------

  console.log("1️⃣1️⃣ Creating box PhysicsShapeBox...");

  const boxShape = new PhysicsShapeBox(
    Vector3.Zero(),
    Quaternion.Identity(),
    new Vector3(2, 2, 2),
    scene,
  );

  boxBody.shape = boxShape;

  console.log("✅ Box shape created and assigned");

  // --------------------------------------------------
  // 12. Mass
  // --------------------------------------------------

  console.log("1️⃣2️⃣ Setting box mass...");

  boxBody.setMassProperties({
    mass: 1,
  });

  console.log("✅ Box mass set");

  // --------------------------------------------------
  // 13. Angular velocity
  // --------------------------------------------------

  console.log("1️⃣3️⃣ Setting angular velocity...");

  boxBody.setAngularVelocity(new Vector3(4, 3, 2));

  console.log("✅ Angular velocity set");

  // --------------------------------------------------
  // 14. Disable automatic scene physics
  // --------------------------------------------------

  console.log("1️⃣4️⃣ Disabling Babylon automatic physics...");

  scene.physicsEnabled = false;

  console.log("✅ scene.physicsEnabled:", scene.physicsEnabled);

  // --------------------------------------------------
  // 15. Accumulator
  // --------------------------------------------------

  const updatePhysics = createPhysicsAccumulator(scene, PHYSICS_DT_MS);

  // --------------------------------------------------
  // 16. Scheduler
  // --------------------------------------------------

  console.log("1️⃣6️⃣ Starting server scheduler...");

  const scheduler = setInterval(() => {
    updatePhysics();
  }, 4);

  console.log("✅ Scheduler started");

  // --------------------------------------------------
  // 17. State logger
  // --------------------------------------------------

  console.log("1️⃣7️⃣ Starting state logger...");

  const logger = setInterval(() => {
    try {
      const position = boxNode.position;

      const rotation = boxNode.rotationQuaternion ?? Quaternion.Identity();

      const euler = rotation.toEulerAngles();

      console.log("");
      console.log("--------------------------------");
      console.log("📦 BOX STATE");

      console.log(`Position:`, {
        x: position.x,
        y: position.y,
        z: position.z,
      });

      console.log(`Quaternion:`, {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });

      console.log(`Euler degrees:`, {
        x: euler.x * (180 / Math.PI),

        y: euler.y * (180 / Math.PI),

        z: euler.z * (180 / Math.PI),
      });
    } catch (error) {
      console.error("❌ Error while printing physics state");

      console.error(error);
    }
  }, 500);

  console.log("✅ State logger started");

  console.log("");
  console.log("==========================================");
  console.log("🟢 SERVER IS RUNNING");
  console.log("Press Ctrl+C to stop");
  console.log("==========================================");
  console.log("");

  // --------------------------------------------------
  // Shutdown
  // --------------------------------------------------

  process.on("SIGINT", () => {
    console.log("");
    console.log("🛑 SIGINT received");
    console.log("Stopping server...");

    clearInterval(scheduler);
    clearInterval(logger);

    console.log("Disposing scene...");

    scene.dispose();

    console.log("Disposing engine...");

    engine.dispose();

    console.log("✅ Server stopped");

    process.exit(0);
  });
}

// --------------------------------------------------
// Start main
// --------------------------------------------------

console.log("server.ts loaded");

main()
  .then(() => {
    console.log("main() initialization completed successfully");
  })
  .catch((error) => {
    console.error("");
    console.error("==========================================");
    console.error("❌ SERVER STARTUP FAILED");
    console.error("==========================================");
    console.error("");

    console.error(error);

    process.exit(1);
  });
