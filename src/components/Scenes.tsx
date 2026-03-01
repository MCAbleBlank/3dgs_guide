import React from 'react';
import { Line, Plane } from '@react-three/drei';
import * as THREE from 'three';

  const HalfCourt = ({ mirror = false, lineColor }: { mirror?: boolean, lineColor: string }) => {
    const zMult = mirror ? -1 : 1;
    
    return (
      <group scale={[1, 1, zMult]}> 
        {/* Key Area (Paint) - 4.9m wide, 5.8m long */}
        <Line
          points={[
            [-2.45, -0.49, -14], [-2.45, -0.49, -8.2], // Left line
            [2.45, -0.49, -8.2], [2.45, -0.49, -14],   // Right line & Top
            [-2.45, -0.49, -8.2], [2.45, -0.49, -8.2]  // Free throw line
          ]}
          color={lineColor}
          lineWidth={2}
        />

        {/* Free Throw Semi-Circle (R1800) */}
        <Line
          points={(() => {
            const r = 1.8;
            const centerZ = -8.2;
            const segments = 32;
            const pts: [number, number, number][] = [];
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * Math.PI; // 0 to PI
              pts.push([
                Math.cos(angle) * r,
                -0.49,
                Math.sin(angle) * r + centerZ
              ]);
            }
            return pts;
          })()}
          color={lineColor}
          lineWidth={2}
        />

        {/* Restricted Area (R1300) */}
        <Line
          points={(() => {
            const r = 1.3;
            const hoopZ = -14 + 1.575;
            const segments = 32;
            const pts: [number, number, number][] = [];
            // Semi-circle facing the court
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * Math.PI; // 0 to PI
              pts.push([
                Math.cos(angle) * r,
                -0.49,
                Math.sin(angle) * r + hoopZ
              ]);
            }
            // Optional: Close the loop or add straight lines if strictly following FIBA/Drawing
            // The drawing shows R1300 arc.
            return pts;
          })()}
          color={lineColor}
          lineWidth={2}
        />

        {/* 3-Point Line (R6700, 0.9m from sideline) */}
        <Line
          points={(() => {
             const r = 6.7; // Updated from 6.75 to 6.7 based on drawing
             const hoopZ = -14 + 1.575;
             const cornerDist = 6.6; // 7.5m (half width) - 0.9m
             // Calculate where the straight line meets the arc
             // x = cornerDist
             // x^2 + (z - hoopZ)^2 = r^2
             // (z - hoopZ) = sqrt(r^2 - x^2)
             const cornerZOffset = Math.sqrt(r*r - cornerDist*cornerDist);
             
             // Calculate angle for the arc
             // cos(theta) = x / r
             const startAngle = Math.acos(cornerDist / r);
             const endAngle = Math.PI - startAngle;
             
             const pts: [number, number, number][] = [];
             
             // Right corner straight line
             pts.push([cornerDist, -0.49, -14]);
             pts.push([cornerDist, -0.49, hoopZ + cornerZOffset]);
             
             // Arc
             const segments = 32;
             for (let i = 0; i <= segments; i++) {
               const angle = startAngle + (i / segments) * (endAngle - startAngle);
               pts.push([
                 Math.cos(angle) * r,
                 -0.49,
                 Math.sin(angle) * r + hoopZ
               ]);
             }
             
             // Left corner straight line
             pts.push([-cornerDist, -0.49, hoopZ + cornerZOffset]);
             pts.push([-cornerDist, -0.49, -14]);
             
             return pts;
          })()}
          color={lineColor}
          lineWidth={2}
        />
        
        {/* Hoop Structure */}
        <group position={[0, 0, -14 + 1.2]}> {/* 1.2m from baseline */}
          {/* Pole */}
          <mesh position={[0, 1.5, -0.5]}> {/* Move pole BEHIND the backboard (negative Z) */}
             <cylinderGeometry args={[0.1, 0.1, 3, 8]} />
             <meshStandardMaterial color="#333" />
          </mesh>

          {/* Connector Arm (Pole to Backboard) */}
          <mesh position={[0, 2.8, -0.25]}>
            <boxGeometry args={[0.2, 0.2, 0.5]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          
          {/* Backboard (1.8m x 1.05m) */}
          <mesh position={[0, 3.35, 0]}>
            <boxGeometry args={[1.8, 1.05, 0.05]} />
            <meshStandardMaterial color="white" transparent opacity={0.8} />
            {/* Inner square */}
            <mesh position={[0, -0.3, 0.03]}>
               <planeGeometry args={[0.59, 0.45]} />
               <meshBasicMaterial visible={false} />
               <Line 
                  points={[
                    [-0.295, -0.225, 0], [0.295, -0.225, 0],
                    [0.295, 0.225, 0], [-0.295, 0.225, 0],
                    [-0.295, -0.225, 0]
                  ]}
                  color="red"
                  lineWidth={2}
               />
            </mesh>
          </mesh>

          {/* Rim */}
          <mesh position={[0, 3.05, 0.45]} rotation={[Math.PI/2, 0, 0]}>
            <torusGeometry args={[0.225, 0.02, 8, 16]} />
            <meshStandardMaterial color="#F27D26" />
          </mesh>
          
          {/* Net (Simplified cylinder) */}
          <mesh position={[0, 2.8, 0.45]}>
            <cylinderGeometry args={[0.225, 0.15, 0.4, 8, 1, true]} />
            <meshBasicMaterial color="white" wireframe opacity={0.5} transparent />
          </mesh>
        </group>
      </group>
    );
  };

export function BasketballCourt({ 
  courtColor = '#E8A87C', 
  lineColor = '#FFFFFF',
  floorOpacity = 1
}: { 
  courtColor?: string; 
  lineColor?: string;
  floorOpacity?: number;
}) {
  // Full court dimensions: 28m x 15m
  // Rim height: 3.05m
  // Backboard offset from baseline: 1.2m

  return (
    <group>
      {/* Floor (28m x 15m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.51, 0]} receiveShadow>
        <planeGeometry args={[15, 28]} />
        <meshStandardMaterial color={courtColor} roughness={0.5} metalness={0.1} transparent opacity={floorOpacity} />
      </mesh>

      {/* Center Line */}
      <Line
        points={[[-7.5, -0.5, 0], [7.5, -0.5, 0]]}
        color={lineColor}
        lineWidth={2}
      />
      
      {/* Center Circle */}
      <Line
        points={new Array(64).fill(0).map((_, i) => {
          const angle = (i / 63) * Math.PI * 2;
          return [Math.cos(angle) * 1.8, -0.5, Math.sin(angle) * 1.8];
        })}
        color={lineColor}
        lineWidth={2}
      />

      {/* Boundary Lines */}
      <Line
        points={[
          [-7.5, -0.5, -14], [7.5, -0.5, -14], // Top Baseline
          [7.5, -0.5, -14], [7.5, -0.5, 14],   // Right Sideline
          [7.5, -0.5, 14], [-7.5, -0.5, 14],   // Bottom Baseline
          [-7.5, -0.5, 14], [-7.5, -0.5, -14]  // Left Sideline
        ]}
        color={lineColor}
        lineWidth={2}
      />

      <HalfCourt lineColor={lineColor} />
      <HalfCourt mirror lineColor={lineColor} />
    </group>
  );
}

export function BaseballField({
  dirtColor = '#8B4513',
  grassColor = '#2F4F2F',
  chalkColor = '#FFFFFF',
  floorOpacity = 1
}: {
  dirtColor?: string;
  grassColor?: string;
  chalkColor?: string;
  floorOpacity?: number;
}) {
  return (
    <group>
      {/* Grass Field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color={grassColor} roughness={0.8} transparent opacity={floorOpacity} />
      </mesh>

      {/* Dirt Circle (Infield/Home plate area) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.51, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color={dirtColor} roughness={0.9} transparent opacity={floorOpacity} />
      </mesh>

      {/* Foul Lines */}
      <Line
        points={[
          [0, -0.5, 0], [10, -0.5, 10], // 1st Base Line
          [0, -0.5, 0], [-10, -0.5, 10] // 3rd Base Line
        ]}
        color={chalkColor}
        lineWidth={3}
      />

      {/* Home Plate (Pentagon) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.49, 0.5]}>
        <circleGeometry args={[0.3, 5]} />
        <meshBasicMaterial color="white" />
      </mesh>

      {/* Batter's Boxes */}
      <Line
        points={[
          [-0.8, -0.5, 0], [-0.8, -0.5, 1.2],
          [-1.4, -0.5, 1.2], [-1.4, -0.5, 0],
          [-0.8, -0.5, 0]
        ]}
        color={chalkColor}
        lineWidth={2}
      />
      <Line
        points={[
          [0.8, -0.5, 0], [0.8, -0.5, 1.2],
          [1.4, -0.5, 1.2], [1.4, -0.5, 0],
          [0.8, -0.5, 0]
        ]}
        color={chalkColor}
        lineWidth={2}
      />
    </group>
  );
}
