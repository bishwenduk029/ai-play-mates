"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, useTexture } from "@react-three/drei";
import { Figure } from "./Figure";

/** Sets the forest image as the scene background. */
function SceneBackground() {
  const texture = useTexture("/scene-bg.jpg");
  return <primitive object={texture} attach="background" />;
}

export function Scene() {
  return (
    <Canvas
      shadows
      camera={{ position: [3, 3.2, 4.2], fov: 42 }}
      className="!absolute inset-0"
    >
      <SceneBackground />

      <ambientLight intensity={0.6} />
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 2, -3]} intensity={0.3} color="#60a5fa" />

      <Figure />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.5}
        scale={10}
        blur={2.4}
        far={4}
      />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#3a5a40" roughness={0.9} />
      </mesh>

      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={8}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2 + 0.1}
        target={[0, 0.4, 0]}
      />
    </Canvas>
  );
}
