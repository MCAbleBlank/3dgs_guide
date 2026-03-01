import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Line, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface CameraVizProps {
  position: [number, number, number];
  target: [number, number, number];
  isSelected?: boolean;
  index: number;
  fov?: number;
  showFov?: boolean;
  disabled?: boolean;
  onClick?: (e: any) => void;
  pitchOffset?: number;
}

export function CameraViz({ position, target, isSelected, index, fov = 50, showFov = false, disabled = false, onClick, pitchOffset = 0 }: CameraVizProps) {
  const groupRef = useRef<THREE.Group>(null);
  const vecPosition = new THREE.Vector3(...position);
  const vecTarget = new THREE.Vector3(...target);
  
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(vecTarget);
    }
  });

  // Calculate frustum dimensions based on FOV
  // Assume 3:2 aspect ratio (36mm x 24mm sensor)
  const aspect = 1.5;
  
  // If showFov is true, extend frustum to visualize coverage
  // If false, keep it small as a camera icon
  const frustumLength = showFov ? Math.min(vecPosition.distanceTo(vecTarget) * 0.8, 3.0) : 0.6;
  
  // Input FOV is Horizontal (from App.tsx)
  const hFovRad = (fov * Math.PI) / 180;
  
  // Half dimensions at the far plane
  const halfWidth = Math.tan(hFovRad / 2) * frustumLength;
  const halfHeight = halfWidth / aspect;

  const color = disabled ? '#333' : (isSelected ? '#F27D26' : '#888');
  const opacity = disabled ? 0.3 : 1;

  return (
    <group 
      position={position} 
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      <group rotation={[THREE.MathUtils.degToRad(pitchOffset), 0, 0]}>
        {/* Camera Number Label */}
        <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, 0.4, 0]}
            fontSize={0.3}
            color={disabled ? "#444" : "white"}
            outlineWidth={0.03}
            outlineColor="black"
            anchorX="center"
            anchorY="middle"
          >
            {index + 1}
          </Text>
        </Billboard>

        {/* Camera Body */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.2, 0.15, 0.25]} />
          <meshStandardMaterial color={color} transparent opacity={opacity} />
        </mesh>
        
        {/* Lens */}
        <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 16]} />
          <meshStandardMaterial color={disabled ? "#222" : "#111"} transparent opacity={opacity} />
        </mesh>

        {/* Frustum Visualization */}
        {!disabled && (
          <group>
            {/* Lines */}
            <Line
              points={[
                [0, 0, 0], [halfWidth, halfHeight, frustumLength],
                [0, 0, 0], [-halfWidth, halfHeight, frustumLength],
                [0, 0, 0], [halfWidth, -halfHeight, frustumLength],
                [0, 0, 0], [-halfWidth, -halfHeight, frustumLength],
                [halfWidth, halfHeight, frustumLength], [-halfWidth, halfHeight, frustumLength],
                [-halfWidth, halfHeight, frustumLength], [-halfWidth, -halfHeight, frustumLength],
                [-halfWidth, -halfHeight, frustumLength], [halfWidth, -halfHeight, frustumLength],
                [halfWidth, -halfHeight, frustumLength], [halfWidth, halfHeight, frustumLength],
              ]}
              color={showFov ? '#F27D26' : color}
              lineWidth={1.5}
              transparent
              opacity={showFov ? 0.8 : 0.6}
            />
            
            {/* Gradient Cone Mesh (Only when showFov is true) */}
            {showFov && <FrustumCone width={halfWidth} height={halfHeight} length={frustumLength} />}
          </group>
        )}

        {/* Sight Line to Target */}
        {!disabled && (
          <Line
            points={[[0, 0, 0], [0, 0, vecPosition.distanceTo(vecTarget)]]}
            color={isSelected ? '#F27D26' : '#888'}
            lineWidth={1}
            transparent
            opacity={0.4}
            dashed
            dashScale={2}
            gapSize={1}
          />
        )}
      </group>
    </group>
  );
}

function FrustumCone({ width, height, length }: { width: number, height: number, length: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const w = width;
    const h = height;
    const l = length;
    
    const vertices = new Float32Array([
      // Top
      0, 0, 0,   w, h, l,   -w, h, l,
      // Bottom
      0, 0, 0,   -w, -h, l,  w, -h, l,
      // Left
      0, 0, 0,   -w, h, l,   -w, -h, l,
      // Right
      0, 0, 0,   w, -h, l,   w, h, l,
    ]);
    
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geo;
  }, [width, height, length]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#F27D26') },
        uLength: { value: length },
      },
      vertexShader: `
        varying float vZ;
        void main() {
          vZ = position.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uLength;
        varying float vZ;
        void main() {
          // Fade from opacity 0.3 at start to 0 at end
          float opacity = 0.3 * (1.0 - (vZ / uLength));
          gl_FragColor = vec4(uColor, opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }, [length]);

  return <mesh geometry={geometry} material={material} />;
}
