import React, { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Grid, Text } from '@react-three/drei';
import { BasketballCourt, BaseballField } from './Scenes';
import { X, Download, Check } from 'lucide-react';
import * as THREE from 'three';

interface ExportMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  setup: any;
  cameras: any[];
}

export function ExportMapModal({ isOpen, onClose, setup, cameras }: ExportMapModalProps) {
  const [useBlueprintStyle, setUseBlueprintStyle] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!canvasRef.current) return;
    setIsExporting(true);

    // Small delay to ensure render is complete/ready (though usually synchronous in this context)
    requestAnimationFrame(() => {
      try {
        const dataUrl = canvasRef.current!.toDataURL('image/png', 1.0);
        const link = document.createElement('a');
        link.download = `camera-layout-${setup.scene}-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Export failed", err);
      } finally {
        setIsExporting(false);
      }
    });
  };

  // Determine scene bounds for camera zoom
  let zoom = 20;
  if (setup.scene === 'basketball') zoom = 15;
  if (setup.scene === 'baseball') zoom = 15;

  // Colors based on style
  const bgColor = useBlueprintStyle ? '#ffffff' : '#0a0a0a';
  const lineColor = useBlueprintStyle ? '#000000' : '#ffffff';
  const floorOpacity = useBlueprintStyle ? 0.1 : 1;
  const cameraColor = useBlueprintStyle ? '#000000' : '#ffffff';
  const textColor = useBlueprintStyle ? 'black' : 'white';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            导出平面示意图
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          
          {/* Preview Canvas */}
          <div className="flex-1 relative bg-gray-900 min-h-[300px] md:min-h-[500px]">
            <Canvas
              ref={canvasRef}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              className="w-full h-full"
            >
              <color attach="background" args={[bgColor]} />
              
              <OrthographicCamera 
                makeDefault 
                position={[0, 50, 0]} 
                zoom={zoom} 
                near={0.1} 
                far={1000}
                rotation={[-Math.PI / 2, 0, -Math.PI / 2]} // Rotate to match standard top-down orientation (North up)
              />
              
              <ambientLight intensity={0.8} />
              <directionalLight position={[10, 20, 10]} intensity={1} />

              {/* Scene */}
              <group rotation={[0, Math.PI / 2, 0]}> {/* Rotate scene to fit landscape if needed, or keep standard */}
                {setup.scene === 'studio' && (
                   <Grid 
                     position={[0, -0.5, 0]} 
                     args={[20, 20]} 
                     cellColor={useBlueprintStyle ? "#ccc" : "#222"} 
                     sectionColor={useBlueprintStyle ? "#888" : "#444"} 
                   />
                )}
                {setup.scene === 'basketball' && (
                  <BasketballCourt 
                    courtColor={useBlueprintStyle ? '#eee' : undefined}
                    lineColor={lineColor}
                    floorOpacity={floorOpacity}
                  />
                )}
                {setup.scene === 'baseball' && (
                  <BaseballField 
                    dirtColor={useBlueprintStyle ? '#ddd' : undefined}
                    grassColor={useBlueprintStyle ? '#f5f5f5' : undefined}
                    chalkColor={lineColor}
                    floorOpacity={floorOpacity}
                  />
                )}
              </group>

              {/* Cameras */}
              {cameras.map((cam) => !cam.disabled && (
                <group key={cam.id} position={[cam.pos[0], 2, cam.pos[2]]}>
                  {/* Camera Icon (Top down view is a triangle/trapezoid) */}
                  <mesh rotation={[-Math.PI/2, 0, -Math.atan2(cam.pos[0] - setup.subjectPosition[0], cam.pos[2] - setup.subjectPosition[2])]}>
                    <coneGeometry args={[0.4, 0.8, 4]} />
                    <meshBasicMaterial color={useBlueprintStyle ? "#F27D26" : "#F27D26"} />
                  </mesh>
                  {/* Camera Number */}
                  <Text
                    position={[0, 0.5, 0]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    fontSize={0.8}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                  >
                    {cam.id + 1}
                  </Text>
                </group>
              ))}
              
              {/* Subject Center */}
               <mesh position={[setup.subjectPosition[0], 0, setup.subjectPosition[2]]}>
                 <circleGeometry args={[0.3, 16]} />
                 <meshBasicMaterial color="red" />
               </mesh>

            </Canvas>

            {/* HTML Overlay for Text (Since R3F Text can be tricky with fonts in exports sometimes, but let's try to keep it simple first. 
                Actually, HTML overlay won't be captured by canvas.toDataURL. 
                So we must rely on visual shapes or accept no text, OR use @react-three/drei Text.
                For now, let's stick to shapes.
            */}
          </div>

          {/* Sidebar Controls */}
          <div className="w-full md:w-64 bg-[#111] border-l border-white/10 p-6 space-y-6">
             <div className="space-y-3">
               <label className="text-xs font-mono text-gray-400 uppercase">显示风格</label>
               <div className="flex gap-2">
                 <button
                   onClick={() => setUseBlueprintStyle(true)}
                   className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-colors border ${
                     useBlueprintStyle 
                       ? 'bg-white text-black border-white' 
                       : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500'
                   }`}
                 >
                   工程图 (白底)
                 </button>
                 <button
                   onClick={() => setUseBlueprintStyle(false)}
                   className={`flex-1 py-2 px-3 rounded text-xs font-medium transition-colors border ${
                     !useBlueprintStyle 
                       ? 'bg-[#222] text-white border-white' 
                       : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500'
                   }`}
                 >
                   卫星图 (黑底)
                 </button>
               </div>
             </div>

             <div className="pt-4 border-t border-white/10">
               <button
                 onClick={handleDownload}
                 disabled={isExporting}
                 className="w-full py-3 bg-[#F27D26] hover:bg-[#E06C1B] text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
               >
                 {isExporting ? (
                   <span>导出中...</span>
                 ) : (
                   <>
                     <Download className="w-4 h-4" />
                     下载图片
                   </>
                 )}
               </button>
               <p className="text-[10px] text-gray-500 mt-2 text-center">
                 导出为高分辨率 PNG 格式
               </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
