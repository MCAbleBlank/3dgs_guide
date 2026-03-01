import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Line, TransformControls } from '@react-three/drei';
import { CameraViz } from './components/CameraViz';
import { BasketballCourt, BaseballField } from './components/Scenes';
import { Box, RotateCcw, Layers, Map, Menu, X, ChevronDown, ChevronUp, Move, RotateCw, Scaling, Download, Upload, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './lib/utils';
import * as THREE from 'three';

function PreviewCamera({ 
  position, 
  target, 
  fov, 
  pitchOffset 
}: { 
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  pitchOffset: number;
}) {
  const { camera } = useThree();
  
  // Store original FOV to restore on unmount
  useEffect(() => {
    const originalFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
    
    return () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = originalFov;
        camera.updateProjectionMatrix();
      }
    };
  }, [camera]);

  useEffect(() => {
    camera.position.set(...position);
    camera.lookAt(...target);
    
    // Apply pitch offset
    if (pitchOffset !== 0) {
       camera.rotateX(THREE.MathUtils.degToRad(pitchOffset));
    }

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, position, target, fov, pitchOffset]);

  return null;
}

type PatternType = 'orbital' | 'hemisphere' | 'spiral';
type SceneType = 'studio' | 'basketball' | 'baseball';

interface CameraOverride {
  disabled?: boolean;
  positionOffset?: [number, number, number];
  pitchOffset?: number; // Degrees
  fov?: number;
}

type CameraOverrides = Record<number, CameraOverride>;

interface CameraSetup {
  pattern: PatternType;
  radiusX: number;
  radiusZ: number;
  height: number;
  count: number;
  layers: number;
  scene: SceneType;
  subjectPosition: [number, number, number];
  subjectRotation: [number, number, number];
  subjectScale: [number, number, number];
  trackPosition: [number, number, number];
  trackRotation: [number, number, number];
  trackScale: [number, number, number];
  fov: number; // Vertical FOV in degrees
  showFov: boolean;
  showPath: boolean;
  layerSpacing: number;
  angleRange: number;
}

type TransformMode = 'translate' | 'rotate' | 'scale';
type ActiveObject = 'subject' | 'track' | string | null;

const sceneLabels: Record<SceneType, string> = {
  studio: '通用摄影棚',
  basketball: '篮球场',
  baseball: '棒球本垒',
};

const patternLabels: Record<PatternType, string> = {
  orbital: '环绕 (Orbital)',
  hemisphere: '半球 (Hemisphere)',
  spiral: '螺旋 (Spiral)',
};

// Convert Focal Length (mm) to FOV (degrees) assuming 35mm sensor (36mm width)
// We use Horizontal FOV for better correlation with focal length in UI
const focalLengthToFov = (focalLength: number) => {
  return 2 * Math.atan(36 / (2 * focalLength)) * (180 / Math.PI);
};

const fovToFocalLength = (fov: number) => {
  return 36 / (2 * Math.tan((fov * Math.PI) / 360));
};

interface NumberControlProps {
  label: string;
  value: number;
  setValue: (val: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const NumberControl = ({ label, value, setValue, min, max, step, unit }: NumberControlProps) => {
  // Use a local state to handle intermediate string input
  const [localValue, setLocalValue] = useState<string>(value?.toString() ?? '');

  // Sync local state when prop changes (unless we are editing)
  React.useEffect(() => {
    if (value !== undefined && value !== parseFloat(localValue)) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setLocalValue(valStr);
    
    if (valStr === '') return; // Don't update parent with NaN

    const val = parseFloat(valStr);
    if (!isNaN(val)) {
      setValue(val);
    }
  };

  const handleBlur = () => {
    // On blur, reset to valid value if invalid
    if (localValue === '' || isNaN(parseFloat(localValue))) {
       setLocalValue(value?.toString() ?? min.toString());
       setValue(value ?? min);
    } else {
       // Clamp value on blur
       let val = parseFloat(localValue);
       if (val < min) val = min;
       if (val > max) val = max;
       setLocalValue(val.toString());
       setValue(val);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-xs font-mono text-gray-400 uppercase">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            className="w-16 bg-transparent text-right text-xs font-mono text-[#F27D26] focus:outline-none border-b border-[#F27D26]/30 focus:border-[#F27D26] p-0"
          />
          {unit && <span className="text-xs font-mono text-[#F27D26]">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min} // Fallback for range input
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setLocalValue(val.toString());
          setValue(val);
        }}
        className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
      />
    </div>
  );
};

interface SidebarProps {
  setup: CameraSetup;
  setSetup: (setup: CameraSetup) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  cameraCount: number;
  cameraOverrides: CameraOverrides;
  setCameraOverrides: (overrides: CameraOverrides) => void;
  activeObject: ActiveObject;
  setActiveObject: (obj: ActiveObject) => void;
}

const Sidebar = ({ setup, setSetup, setIsSidebarOpen, cameraCount, cameraOverrides, setCameraOverrides, activeObject, setActiveObject }: SidebarProps) => {
  const activeCameraId = activeObject?.startsWith('camera-') ? parseInt(activeObject.split('-')[1]) : null;
  const activeCameraOverride = activeCameraId !== null ? cameraOverrides[activeCameraId] || {} : null;

  const handleExport = () => {
    const data = {
      setup,
      cameraOverrides,
      version: 1,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gsplat-setup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.setup) setSetup(data.setup);
        if (data.cameraOverrides) setCameraOverrides(data.cameraOverrides);
      } catch (err) {
        console.error('Failed to parse JSON', err);
        alert('导入失败：无效的 JSON 文件');
      }
    };
    reader.readAsText(file);
  };

  return (
  <>
    <div className="p-6 border-b border-[#333] flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Box className="w-6 h-6 text-[#F27D26]" />
          <span>GSplat 指南</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1 font-mono">相机位姿可视化工具</p>
      </div>
      <button 
        className="md:hidden text-gray-400"
        onClick={() => setIsSidebarOpen(false)}
      >
        <X className="w-6 h-6" />
      </button>
    </div>

    {/* Import/Export Actions */}
    <div className="px-6 py-4 border-b border-[#333] flex gap-2">
      <button
        onClick={handleExport}
        className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-xs font-mono uppercase rounded transition-colors"
      >
        <Download className="w-3 h-3" />
        导出配置
      </button>
      <label className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-xs font-mono uppercase rounded transition-colors cursor-pointer">
        <Upload className="w-3 h-3" />
        导入配置
        <input type="file" accept=".json" onChange={handleImport} className="hidden" />
      </label>
    </div>

    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {/* Camera Edit Mode */}
      {activeCameraId !== null && (
        <div className="p-4 bg-[#1a1a1a] rounded-lg border border-[#F27D26] space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex justify-between items-center border-b border-[#333] pb-2">
            <h3 className="text-sm font-bold text-[#F27D26] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#F27D26]" />
              相机 #{activeCameraId + 1}
            </h3>
            <button 
              onClick={() => setActiveObject(null)}
              className="text-xs text-gray-500 hover:text-white"
            >
              关闭
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-gray-400 uppercase">启用相机</label>
            <button
              onClick={() => {
                const newOverrides = { ...cameraOverrides };
                if (!newOverrides[activeCameraId]) newOverrides[activeCameraId] = {};
                newOverrides[activeCameraId].disabled = !activeCameraOverride?.disabled;
                setCameraOverrides(newOverrides);
              }}
              className={cn(
                "w-10 h-5 rounded-full transition-colors relative",
                !activeCameraOverride?.disabled ? "bg-[#F27D26]" : "bg-[#333]"
              )}
            >
              <div className={cn(
                "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                !activeCameraOverride?.disabled ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {!activeCameraOverride?.disabled && (
            <>
              <div className="space-y-3">
                <label className="text-xs font-mono text-gray-400 uppercase">位置微调 (Offset)</label>
                <div className="grid grid-cols-3 gap-2">
                  {['X', 'Y', 'Z'].map((axis, i) => (
                    <div key={axis}>
                      <label className="text-[10px] text-gray-500 block mb-1">{axis}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={activeCameraOverride?.positionOffset?.[i] ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const newOverrides = { ...cameraOverrides };
                          if (!newOverrides[activeCameraId]) newOverrides[activeCameraId] = {};
                          const currentPos = newOverrides[activeCameraId].positionOffset || [0, 0, 0];
                          const newPos = [...currentPos] as [number, number, number];
                          newPos[i] = val;
                          newOverrides[activeCameraId].positionOffset = newPos;
                          setCameraOverrides(newOverrides);
                        }}
                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs font-mono text-white focus:border-[#F27D26] outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-xs font-mono text-gray-400 uppercase">俯仰微调 (Pitch)</label>
                  <span className="text-xs font-mono text-[#F27D26]">{activeCameraOverride?.pitchOffset ?? 0}°</span>
                </div>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={activeCameraOverride?.pitchOffset ?? 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newOverrides = { ...cameraOverrides };
                    if (!newOverrides[activeCameraId]) newOverrides[activeCameraId] = {};
                    newOverrides[activeCameraId].pitchOffset = val;
                    setCameraOverrides(newOverrides);
                  }}
                  className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-xs font-mono text-gray-400 uppercase">焦距微调 (Focal)</label>
                  <span className="text-xs font-mono text-[#F27D26]">
                    {Math.round(fovToFocalLength(activeCameraOverride?.fov ?? setup.fov))}mm
                  </span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="200"
                  step="1"
                  value={fovToFocalLength(activeCameraOverride?.fov ?? setup.fov)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newOverrides = { ...cameraOverrides };
                    if (!newOverrides[activeCameraId]) newOverrides[activeCameraId] = {};
                    newOverrides[activeCameraId].fov = focalLengthToFov(val);
                    setCameraOverrides(newOverrides);
                  }}
                  className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Scene Selection */}
      <div className="space-y-3">
        <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">场景预设</label>
        <div className="grid grid-cols-1 gap-2">
          {(['studio', 'basketball', 'baseball'] as SceneType[]).map((s) => (
            <button
              key={s}
              onClick={() => setSetup({ ...setup, scene: s })}
              className={cn(
                "px-3 py-2 rounded-md text-xs font-medium transition-all border flex items-center gap-2",
                setup.scene === s
                  ? "bg-[#F27D26] text-black border-[#F27D26]"
                  : "bg-[#1a1a1a] text-gray-400 border-[#333] hover:border-gray-500"
              )}
            >
              <Map className="w-3 h-3" />
              {sceneLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Selection - REMOVED */}

      {/* Subject Settings - REMOVED */}
      
      {/* Pattern Selection */}
      <div className="space-y-3">
        <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">拍摄模式</label>
        <div className="grid grid-cols-1 gap-2">
          {(['orbital', 'hemisphere', 'spiral'] as PatternType[]).map((p) => (
            <button
              key={p}
              onClick={() => setSetup({ ...setup, pattern: p })}
              className={cn(
                "px-3 py-2 rounded-md text-xs font-medium transition-all border text-left",
                setup.pattern === p
                  ? "bg-[#F27D26] text-black border-[#F27D26]"
                  : "bg-[#1a1a1a] text-gray-400 border-[#333] hover:border-gray-500"
              )}
            >
              {patternLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Camera Settings */}
      <div className="space-y-4 border-t border-[#333] pt-4">
        <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">相机参数</label>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-xs font-mono text-gray-400 uppercase">焦距 (Focal Length)</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500">FOV: {Math.round(setup.fov)}°</span>
              <span className="text-xs font-mono text-[#F27D26]">{Math.round(fovToFocalLength(setup.fov))}mm</span>
            </div>
          </div>
          
          {/* FOV Scale (Top) - Horizontal FOV (36mm sensor) */}
          <div className="flex justify-between text-[10px] text-gray-500 font-mono mb-1">
            <span>104°</span>
            <span>54°</span>
            <span>40°</span>
            <span>24°</span>
            <span>10°</span>
          </div>

          <input
            type="range"
            min="14"
            max="200"
            step="1"
            value={fovToFocalLength(setup.fov)}
            onChange={(e) => setSetup({ ...setup, fov: focalLengthToFov(parseFloat(e.target.value)) })}
            className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#F27D26]"
          />
          
          {/* Focal Length Scale (Bottom) */}
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>14mm</span>
            <span>35mm</span>
            <span>50mm</span>
            <span>85mm</span>
            <span>200mm</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-mono text-gray-400 uppercase">显示视场角范围</label>
          <button
            onClick={() => setSetup({ ...setup, showFov: !setup.showFov })}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              setup.showFov ? "bg-[#F27D26]" : "bg-[#333]"
            )}
          >
            <div className={cn(
              "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
              setup.showFov ? "translate-x-5" : "translate-x-0"
            )} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-mono text-gray-400 uppercase">显示相机轨道</label>
          <button
            onClick={() => setSetup({ ...setup, showPath: !setup.showPath })}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative",
              setup.showPath ? "bg-[#F27D26]" : "bg-[#333]"
            )}
          >
            <div className={cn(
              "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
              setup.showPath ? "translate-x-5" : "translate-x-0"
            )} />
          </button>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-6">
        <NumberControl
          label="长轴半径 (Radius X)"
          value={setup.radiusX}
          setValue={(val) => setSetup({ ...setup, radiusX: val })}
          min={0.1}
          max={50}
          step={0.1}
          unit="m"
        />

        <NumberControl
          label="短轴半径 (Radius Z)"
          value={setup.radiusZ}
          setValue={(val) => setSetup({ ...setup, radiusZ: val })}
          min={0.1}
          max={50}
          step={0.1}
          unit="m"
        />

        <NumberControl
          label="高度 (俯仰)"
          value={setup.height}
          setValue={(val) => setSetup({ ...setup, height: val })}
          min={0}
          max={50}
          step={0.1}
          unit="m"
        />

        <NumberControl
          label={setup.pattern === 'spiral' ? '相机数量 (Total)' : '每层相机数 (Per Layer)'}
          value={setup.count}
          setValue={(val) => setSetup({ ...setup, count: Math.round(val) })}
          min={1}
          max={500}
          step={1}
        />

        {/* Layers is now available for all patterns (Orbital stacks rings) */}
        <NumberControl
          label={setup.pattern === 'spiral' ? '圈数 (Loops)' : '层数 (Layers)'}
          value={setup.layers}
          setValue={(val) => setSetup({ ...setup, layers: Math.round(val) })}
          min={1}
          max={50}
          step={1}
        />

        <NumberControl
          label="层间距 (Layer Spacing)"
          value={setup.layerSpacing}
          setValue={(val) => setSetup({ ...setup, layerSpacing: val })}
          min={0.1}
          max={10}
          step={0.1}
          unit="m"
        />

        {(setup.pattern === 'orbital' || setup.pattern === 'hemisphere') && (
          <NumberControl
            label="角度范围 (Angle Range)"
            value={setup.angleRange}
            setValue={(val) => setSetup({ ...setup, angleRange: val })}
            min={10}
            max={360}
            step={10}
            unit="°"
          />
        )}
      </div>

      {/* Stats */}
      <div className="p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
        <h3 className="text-xs font-mono text-gray-500 uppercase mb-3">设置统计</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase">总照片数</p>
            <p className="text-lg font-mono text-white">{cameraCount}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase">预计覆盖</p>
            <p className="text-lg font-mono text-[#F27D26]">
              {setup.pattern === 'orbital' ? '360°' : '全球面'}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div className="p-6 border-t border-[#333]">
      <button 
        onClick={() => setSetup({ 
          pattern: 'orbital', 
          radiusX: 4,
          radiusZ: 4,
          height: 1.5, 
          count: 12, 
          layers: 1, 
          scene: 'studio',
          subjectPosition: [0, 0, 0],
          subjectRotation: [0, 0, 0],
          subjectScale: [1, 1, 1],
          trackPosition: [0, 0, 0],
          trackRotation: [0, 0, 0],
          trackScale: [1, 1, 1],
          fov: 50,
          showFov: false,
          showPath: false,
          layerSpacing: 1.5,
          angleRange: 360,
        })}
        className="flex items-center justify-center gap-2 w-full py-2 bg-[#222] hover:bg-[#333] text-gray-300 text-xs font-mono uppercase rounded transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        重置默认
      </button>
    </div>
  </>
  );
};

const PathViz = ({ setup, onTrackClick }: { setup: CameraSetup; onTrackClick?: () => void }) => {
  if (!setup.showPath) return null;

  const [tx, ty, tz] = setup.trackPosition;
  const [rx, ry, rz] = setup.trackRotation;
  const [sx, sy, sz] = setup.trackScale;

  // Helper to rotate point
  const rotatePoint = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z);
    v.applyEuler(new THREE.Euler(rx, ry, rz));
    return v;
  };

  const points: THREE.Vector3[][] = [];
  
  const centerY = ty + setup.height;

  if (setup.pattern === 'orbital') {
    const layers = Math.max(1, setup.layers);
    const stackHeight = (layers - 1) * setup.layerSpacing * sy;
    const startY = centerY - (stackHeight / 2);
    
    const rangeRad = (setup.angleRange * Math.PI) / 180;
    const isFullCircle = setup.angleRange >= 360;

    for (let l = 0; l < layers; l++) {
      const layerY = startY + (l * setup.layerSpacing * sy);
      const layerPoints: THREE.Vector3[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const pct = i / segments;
        const angle = isFullCircle ? pct * Math.PI * 2 : pct * rangeRad;
        
        const lx = Math.sin(angle) * setup.radiusX * sx;
        const lz = Math.cos(angle) * setup.radiusZ * sz;
        const localY = layerY - ty;
        
        const rotated = rotatePoint(lx, localY, lz);
        layerPoints.push(new THREE.Vector3(rotated.x + tx, rotated.y + ty, rotated.z + tz));
      }
      points.push(layerPoints);
    }
  } else if (setup.pattern === 'hemisphere') {
    const layers = Math.max(1, setup.layers);
    const maxR = Math.max(setup.radiusX * sx, setup.radiusZ * sz);
    
    const maxElevation = (Math.PI / 2 * 0.9);
    const topRelHeight = layers > 1 ? maxR * Math.sin(maxElevation) : 0;
    const bottomRelHeight = 0;
    const avgRelHeight = (topRelHeight + bottomRelHeight) / 2;
    
    const baseCenterY = setup.height - avgRelHeight;
    
    const rangeRad = (setup.angleRange * Math.PI) / 180;
    const isFullCircle = setup.angleRange >= 360;

    for (let l = 0; l < layers; l++) {
      const elevation = (l / Math.max(1, layers - 1)) * maxElevation;
      const localLayerY = baseCenterY + (maxR * Math.sin(elevation));
      const radiusScale = Math.cos(elevation);
      
      const rx = setup.radiusX * sx * radiusScale;
      const rz = setup.radiusZ * sz * radiusScale;
      
      const layerPoints: THREE.Vector3[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const pct = i / segments;
        const angle = isFullCircle ? pct * Math.PI * 2 : pct * rangeRad;
        
        const lx = Math.sin(angle) * rx;
        const lz = Math.cos(angle) * rz;
        
        const rotated = rotatePoint(lx, localLayerY, lz);
        layerPoints.push(new THREE.Vector3(rotated.x + tx, rotated.y + ty, rotated.z + tz));
      }
      points.push(layerPoints);
    }
  } else if (setup.pattern === 'spiral') {
    const spiralPoints: THREE.Vector3[] = [];
    const total = 200;
    const loops = setup.layers;
    const heightStep = (setup.height * 2) / total;
    
    for (let i = 0; i <= total; i++) {
      const progress = i / total;
      const angle = progress * Math.PI * 2 * loops;
      const localY = -setup.height + (i * heightStep) + setup.height;
      
      const lx = Math.sin(angle) * setup.radiusX * sx;
      const lz = Math.cos(angle) * setup.radiusZ * sz;
      
      const rotated = rotatePoint(lx, localY, lz);
      spiralPoints.push(new THREE.Vector3(rotated.x + tx, rotated.y + ty, rotated.z + tz));
    }
    points.push(spiralPoints);
  }

  return (
    <group>
      {points.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#F27D26"
          opacity={0.5}
          transparent
          lineWidth={2}
          onClick={(e) => {
            e.stopPropagation();
            onTrackClick?.();
          }}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'auto'}
        />
      ))}
    </group>
  );
};

export default function GaussianSplattingGuide() {
  const [setup, setSetup] = useState<CameraSetup>({
    pattern: 'orbital',
    radiusX: 4,
    radiusZ: 4,
    height: 1.5,
    count: 12,
    layers: 1,
    scene: 'studio',
    subjectPosition: [0, 0, 0],
    subjectRotation: [0, 0, 0],
    subjectScale: [1, 1, 1],
    trackPosition: [0, 0, 0],
    trackRotation: [0, 0, 0],
    trackScale: [1, 1, 1],
    fov: 50, // Default ~35mm equivalent
    showFov: false,
    showPath: false,
    layerSpacing: 1.5,
    angleRange: 360,
  });

  const [cameraOverrides, setCameraOverrides] = useState<CameraOverrides>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [activeObject, setActiveObject] = useState<ActiveObject>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const orbitRef = useRef<any>(null);
  const subjectRef = useRef<THREE.Mesh>(null);
  const trackRef = useRef<THREE.Group>(null);

  // Calculate camera positions based on pattern
  const cameras = useMemo(() => {
    const positions: { 
      pos: [number, number, number]; 
      id: number; 
      rot: [number, number, number];
      disabled: boolean;
      fov: number;
      pitchOffset: number;
    }[] = [];
    
    // Use track position/rotation/scale
    const [tx, ty, tz] = setup.trackPosition;
    const [rx, ry, rz] = setup.trackRotation;
    const [sx, sy, sz] = setup.trackScale;

    // Helper to rotate point
    const rotatePoint = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z);
      v.applyEuler(new THREE.Euler(rx, ry, rz));
      return v;
    };
    
    const centerY = ty + setup.height; // Base center for the rig
    
    const applyOverride = (pos: [number, number, number], id: number): { pos: [number, number, number], disabled: boolean, fov: number, pitchOffset: number } => {
      const override = cameraOverrides[id];
      if (!override) return { pos, disabled: false, fov: setup.fov, pitchOffset: 0 };

      let [x, y, z] = pos;
      if (override.positionOffset) {
        x += override.positionOffset[0];
        y += override.positionOffset[1];
        z += override.positionOffset[2];
      }

      return {
        pos: [x, y, z],
        disabled: !!override.disabled,
        fov: override.fov ?? setup.fov,
        pitchOffset: override.pitchOffset ?? 0
      };
    };

    if (setup.pattern === 'orbital') {
      const layers = Math.max(1, setup.layers);
      const perLayer = setup.count;
      
      const stackHeight = (layers - 1) * setup.layerSpacing * sy; // Scale spacing by Y scale?
      const startY = centerY - (stackHeight / 2);
      
      const rangeRad = (setup.angleRange * Math.PI) / 180;
      const isFullCircle = setup.angleRange >= 360;

      for (let l = 0; l < layers; l++) {
        const layerY = startY + (l * setup.layerSpacing * sy);
        
        for (let i = 0; i < perLayer; i++) {
          let pct;
          if (isFullCircle) {
            pct = i / perLayer;
          } else {
            pct = perLayer > 1 ? i / (perLayer - 1) : 0;
          }
          
          const angle = isFullCircle ? pct * Math.PI * 2 : pct * rangeRad;
          const finalAngle = angle + (isFullCircle ? (l * 0.2) : 0);

          // Calculate local position (before track rotation/translation)
          // Scale radius by sx/sz
          const lx = Math.sin(finalAngle) * setup.radiusX * sx;
          const lz = Math.cos(finalAngle) * setup.radiusZ * sz;
          const ly = layerY; // relative to world 0 if trackPosition was 0
          
          // Local point relative to trackPosition
          const localY = ly - ty; 
          const rotated = rotatePoint(lx, localY, lz);
          
          const rawPos: [number, number, number] = [rotated.x + tx, rotated.y + ty, rotated.z + tz];
          const id = l * perLayer + i;
          const { pos, disabled, fov, pitchOffset } = applyOverride(rawPos, id);

          positions.push({ 
            pos, 
            id,
            rot: [rx, ry, rz], // Store rotation for viz if needed
            disabled,
            fov,
            pitchOffset
          });
        }
      }
    } else if (setup.pattern === 'hemisphere') {
      const layers = Math.max(1, setup.layers);
      const perLayer = setup.count;
      const maxR = Math.max(setup.radiusX * sx, setup.radiusZ * sz); // Scale radius
      
      const maxElevation = (Math.PI / 2 * 0.9);
      const topRelHeight = layers > 1 ? maxR * Math.sin(maxElevation) : 0;
      const bottomRelHeight = 0;
      const avgRelHeight = (topRelHeight + bottomRelHeight) / 2;
      
      // Center of hemisphere relative to trackPosition
      const baseCenterY = setup.height - avgRelHeight; 
      
      const rangeRad = (setup.angleRange * Math.PI) / 180;
      const isFullCircle = setup.angleRange >= 360;

      for (let l = 0; l < layers; l++) {
        const elevation = (l / Math.max(1, layers - 1)) * maxElevation;
        const localLayerY = baseCenterY + (maxR * Math.sin(elevation));
        const radiusScale = Math.cos(elevation);
        
        const rx = setup.radiusX * sx * radiusScale;
        const rz = setup.radiusZ * sz * radiusScale;
        
        for (let i = 0; i < perLayer; i++) {
          let pct;
          if (isFullCircle) {
            pct = i / perLayer;
          } else {
            pct = perLayer > 1 ? i / (perLayer - 1) : 0;
          }
          
          const angle = isFullCircle ? pct * Math.PI * 2 : pct * rangeRad;
          const finalAngle = angle + (isFullCircle ? (l * 0.5) : 0);

          const lx = Math.sin(finalAngle) * rx;
          const lz = Math.cos(finalAngle) * rz;
          
          const rotated = rotatePoint(lx, localLayerY, lz);
          
          const rawPos: [number, number, number] = [rotated.x + tx, rotated.y + ty, rotated.z + tz];
          const id = l * perLayer + i;
          const { pos, disabled, fov, pitchOffset } = applyOverride(rawPos, id);

          positions.push({ 
            pos, 
            id,
            rot: [rx, ry, rz],
            disabled,
            fov,
            pitchOffset
          });
        }
      }
    } else if (setup.pattern === 'spiral') {
      const total = setup.count;
      const loops = setup.layers;
      const heightStep = (setup.height * 2) / total;
      
      for (let i = 0; i < total; i++) {
        const progress = i / total;
        const angle = progress * Math.PI * 2 * loops;
        const localY = -setup.height + (i * heightStep) + setup.height;
        
        const lx = Math.sin(angle) * setup.radiusX * sx;
        const lz = Math.cos(angle) * setup.radiusZ * sz;
        
        const rotated = rotatePoint(lx, localY, lz);
        
        const rawPos: [number, number, number] = [rotated.x + tx, rotated.y + ty, rotated.z + tz];
        const id = i;
        const { pos, disabled, fov, pitchOffset } = applyOverride(rawPos, id);

        positions.push({ 
          pos, 
          id,
          rot: [rx, ry, rz],
          disabled,
          fov,
          pitchOffset
        });
      }
    }
    
    return positions;
  }, [setup, cameraOverrides]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeObject && !isPreviewMode) {
        if (e.key === 'w') setTransformMode('translate');
        if (e.key === 'e') setTransformMode('rotate');
        if (e.key === 'r') setTransformMode('scale');
        if (e.key === 'Escape') setActiveObject(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeObject, isPreviewMode]);

  useEffect(() => {
    if (!isPreviewMode) return;

    const handlePreviewKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const currentId = activeObject && activeObject.startsWith('camera-') 
          ? parseInt(activeObject.split('-')[1]) 
          : 0;
        
        let nextId = currentId;
        if (e.key === 'ArrowRight') {
          nextId = (currentId + 1) % cameras.length;
        } else {
          nextId = (currentId - 1 + cameras.length) % cameras.length;
        }
        
        setActiveObject(`camera-${nextId}`);
      }
      if (e.key === 'Escape') {
        setIsPreviewMode(false);
      }
    };

    window.addEventListener('keydown', handlePreviewKeys);
    return () => window.removeEventListener('keydown', handlePreviewKeys);
  }, [isPreviewMode, activeObject, cameras.length]);

  // Convert Focal Length (mm) to FOV (degrees) assuming 35mm sensor (36mm width)
  // FOV = 2 * atan(sensorSize / (2 * focalLength))
  // However, standard is usually vertical FOV or horizontal. Three.js uses Vertical FOV.
  // 35mm sensor height is 24mm.
  
  const activeCameraId = activeObject?.startsWith('camera-') ? parseInt(activeObject.split('-')[1]) : null;
  const activeCamera = activeCameraId !== null ? cameras.find(c => c.id === activeCameraId) : null;

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-white overflow-hidden font-sans">
      {/* Mobile Header */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-50 p-4 flex justify-between items-center pointer-events-none">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="pointer-events-auto p-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-white"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Controls (Desktop) */}
      <div className="hidden md:flex w-80 flex-shrink-0 border-r border-[#333] bg-[#111] flex-col">
        <Sidebar 
          setup={setup} 
          setSetup={setSetup} 
          setIsSidebarOpen={setIsSidebarOpen} 
          cameraCount={cameras.length} 
          cameraOverrides={cameraOverrides}
          setCameraOverrides={setCameraOverrides}
          activeObject={activeObject}
          setActiveObject={setActiveObject}
        />
      </div>

      {/* Sidebar Controls (Mobile Drawer) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="relative w-80 bg-[#111] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <Sidebar 
              setup={setup} 
              setSetup={setSetup} 
              setIsSidebarOpen={setIsSidebarOpen} 
              cameraCount={cameras.length} 
              cameraOverrides={cameraOverrides}
              setCameraOverrides={setCameraOverrides}
              activeObject={activeObject}
              setActiveObject={setActiveObject}
            />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-black/80 backdrop-blur-md rounded-lg border border-white/10 z-40">
         <div className="flex items-center gap-1 pr-2 border-r border-white/10">
            <button
              onClick={() => setActiveObject('subject')}
              className={cn("p-2 rounded hover:bg-white/10", activeObject === 'subject' ? "text-[#F27D26]" : "text-gray-400")}
              title="Select Focus Point"
            >
              <Box className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveObject('track')}
              className={cn("p-2 rounded hover:bg-white/10", activeObject === 'track' ? "text-[#F27D26]" : "text-gray-400")}
              title="Select Track"
            >
              <RotateCcw className="w-5 h-5" /> {/* Using RotateCcw as placeholder for Orbit icon */}
            </button>
         </div>
         <div className="flex items-center gap-1 pl-2">
            <button
               onClick={() => {
                 if (!isPreviewMode) {
                   if (!activeObject || !activeObject.startsWith('camera-')) {
                     setActiveObject('camera-0');
                   }
                   setIsPreviewMode(true);
                 } else {
                   setIsPreviewMode(false);
                 }
               }}
               className={cn("p-2 rounded hover:bg-white/10", isPreviewMode ? "text-[#F27D26]" : "text-gray-400")}
               title="Toggle Camera Preview"
            >
               <Eye className="w-5 h-5" />
            </button>

            {!isPreviewMode && (
              <>
                <div className="w-px h-4 bg-white/10 mx-1" />
                {activeObject !== 'subject' && (
                  <>
                    <button
                      onClick={() => setTransformMode('translate')}
                      className={cn("p-2 rounded hover:bg-white/10", transformMode === 'translate' ? "text-[#F27D26]" : "text-gray-400")}
                      title="Move (W)"
                    >
                      <Move className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setTransformMode('rotate')}
                      className={cn("p-2 rounded hover:bg-white/10", transformMode === 'rotate' ? "text-[#F27D26]" : "text-gray-400")}
                      title="Rotate (E)"
                    >
                      <RotateCw className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setTransformMode('scale')}
                      className={cn("p-2 rounded hover:bg-white/10", transformMode === 'scale' ? "text-[#F27D26]" : "text-gray-400")}
                      title="Scale (R)"
                    >
                      <Scaling className="w-5 h-5" />
                    </button>
                  </>
                )}
                {activeObject === 'subject' && (
                  <div className="px-2 py-1 text-xs text-gray-400 font-mono uppercase">
                    移动视点
                  </div>
                )}
              </>
            )}
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full">
        <div className="w-full h-full bg-[#050505]">
          <Canvas 
            shadows={{ type: THREE.PCFShadowMap }}
            camera={{ position: [8, 6, 8], fov: 45 }}
            onPointerMissed={() => setActiveObject(null)}
          >
            <color attach="background" args={['#050505']} />
            
            {!isPreviewMode && <OrbitControls ref={orbitRef} makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.8} />}
            
            {isPreviewMode && activeCamera && (
               <PreviewCamera 
                 position={activeCamera.pos}
                 target={setup.subjectPosition}
                 fov={activeCamera.fov}
                 pitchOffset={activeCamera.pitchOffset}
               />
            )}
            
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            
            {/* Scene & Subject */}
            <group position={[0, 0, 0]}>

            {/* Track Transform Controls Proxy */}
            <group 
              ref={trackRef}
              position={new THREE.Vector3(...setup.trackPosition)}
              rotation={new THREE.Euler(...setup.trackRotation)}
              scale={new THREE.Vector3(...setup.trackScale)}
            >
               <mesh visible={false}>
                 <boxGeometry args={[setup.radiusX * 2, 1, setup.radiusZ * 2]} />
               </mesh>
            </group>

            {activeObject === 'track' && !isPreviewMode && (
              <TransformControls
                object={trackRef}
                mode={transformMode}
                // @ts-ignore
                onDraggingChanged={(e: any) => {
                  if (orbitRef.current) {
                    orbitRef.current.enabled = !e.value;
                  }
                }}
                onObjectChange={(e: any) => {
                   if (!trackRef.current) return;
                   const o = trackRef.current;
                   
                   setSetup(prev => {
                     const newTrackPos: [number, number, number] = [o.position.x, o.position.y, o.position.z];
                     const oldTrackPos = prev.trackPosition;
                     
                     // Calculate delta
                     const dx = newTrackPos[0] - oldTrackPos[0];
                     const dy = newTrackPos[1] - oldTrackPos[1];
                     const dz = newTrackPos[2] - oldTrackPos[2];
                     
                     // Apply delta to subject position to maintain relative offset
                     const newSubjectPos: [number, number, number] = [
                       prev.subjectPosition[0] + dx,
                       prev.subjectPosition[1] + dy,
                       prev.subjectPosition[2] + dz
                     ];

                     return {
                       ...prev,
                       trackPosition: newTrackPos,
                       trackRotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                       trackScale: [o.scale.x, o.scale.y, o.scale.z],
                       subjectPosition: newSubjectPos
                     };
                   });
                }}
              />
            )}

            {/* Focus Point (formerly Subject) */}
            <mesh 
              ref={subjectRef}
              castShadow 
              receiveShadow
              position={[
                setup.subjectPosition[0], 
                setup.subjectPosition[1], 
                setup.subjectPosition[2]
              ]}
              rotation={new THREE.Euler(...setup.subjectRotation)}
              scale={new THREE.Vector3(...setup.subjectScale)}
              onClick={(e) => {
                e.stopPropagation();
                setActiveObject('subject');
                setIsSidebarOpen(true);
              }}
            >
              <sphereGeometry args={[0.25, 32, 32]} />
              <meshStandardMaterial 
                color={activeObject === 'subject' ? "#FF4444" : "#FF6666"} 
                roughness={0.1} 
                metalness={0.1} 
                emissive="#FF0000"
                emissiveIntensity={activeObject === 'subject' ? 1.5 : 0.8}
                toneMapped={false}
              />
            </mesh>

            {activeObject === 'subject' && !isPreviewMode && (
              <TransformControls
                 object={subjectRef}
                 mode="translate" // Force translate mode for focus point
                 showX={true}
                 showY={true}
                 showZ={true}
                 // @ts-ignore
                 onDraggingChanged={(e: any) => {
                   if (orbitRef.current) {
                     orbitRef.current.enabled = !e.value;
                   }
                 }}
                 onObjectChange={(e: any) => {
                    if (!subjectRef.current) return;
                    const o = subjectRef.current;
                    
                    setSetup(prev => ({
                      ...prev,
                      subjectPosition: [o.position.x, o.position.y, o.position.z],
                    }));
                 }}
              />
            )}

              {/* Environment Rendering */}
              {setup.scene === 'studio' && (
                <>
                  <mesh position={[0, -0.51, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[20, 20]} />
                    <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0.2} />
                  </mesh>
                  <Grid 
                    position={[0, -0.5, 0]} 
                    args={[20, 20]} 
                    cellColor="#222" 
                    sectionColor="#444" 
                    fadeDistance={15} 
                    fadeStrength={1} 
                  />
                </>
              )}
              
              {setup.scene === 'basketball' && <BasketballCourt />}
              {setup.scene === 'baseball' && <BaseballField />}
            </group>

            {/* Cameras */}
            <PathViz 
              setup={setup} 
              onTrackClick={() => {
                setActiveObject('track');
                if (!isSidebarOpen) setIsSidebarOpen(true);
              }} 
            />
            {cameras.map((cam) => {
              if (isPreviewMode && cam.id === activeCameraId) return null;
              return (
                <CameraViz 
                  key={cam.id} 
                  position={cam.pos} 
                  target={[
                    setup.subjectPosition[0], 
                    setup.subjectPosition[1], 
                    setup.subjectPosition[2]
                  ]} 
                  index={cam.id}
                  fov={cam.fov}
                  showFov={setup.showFov}
                  disabled={cam.disabled}
                  pitchOffset={cam.pitchOffset}
                  isSelected={activeObject === `camera-${cam.id}`}
                  onClick={() => {
                    setActiveObject(`camera-${cam.id}`);
                    setIsSidebarOpen(true);
                  }}
                />
              );
            })}

            <Environment preset="city" />
          </Canvas>
          
          {/* Preview Mode Controls */}
          {isPreviewMode && activeCamera && (
            <div className="absolute top-4 right-4 p-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg z-50 flex flex-col items-center gap-2 min-w-[200px]">
              <div className="flex items-center justify-between w-full">
                <button
                  onClick={() => {
                    const currentId = activeCamera.id;
                    const prevId = (currentId - 1 + cameras.length) % cameras.length;
                    setActiveObject(`camera-${prevId}`);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                  title="Previous Camera"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="text-center">
                  <div className="text-sm font-bold text-[#F27D26]">Camera {activeCamera.id + 1}</div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {activeCamera.id + 1} / {cameras.length}
                  </div>
                </div>

                <button
                  onClick={() => {
                    const currentId = activeCamera.id;
                    const nextId = (currentId + 1) % cameras.length;
                    setActiveObject(`camera-${nextId}`);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                  title="Next Camera"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              
              <div className="w-full h-px bg-white/10 my-1" />
              
              <div className="flex justify-between w-full text-[10px] font-mono text-gray-400">
                <span>FOV: {Math.round(activeCamera.fov)}°</span>
                <span>Focal: {Math.round(fovToFocalLength(activeCamera.fov))}mm</span>
              </div>
            </div>
          )}

          {/* Overlay Legend */}
          <div className="absolute bottom-6 right-6 p-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg max-w-xs hidden md:block">
            <h4 className="text-xs font-mono text-gray-400 uppercase mb-2">图例</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#FF4444] rounded-full shadow-[0_0_5px_#FF4444]"></div>
                <span className="text-xs text-gray-300">视线交点 (Focus)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-[#4a4a4a] rounded-sm"></div>
                <span className="text-xs text-gray-300">相机位置</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-[#F27D26]"></div>
                <span className="text-xs text-gray-300">视场角 (FOV)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
