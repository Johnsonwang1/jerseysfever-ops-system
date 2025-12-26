/**
 * Fabric.js 画布编辑器组件
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas } from 'fabric';
import { AD_ASPECT_RATIOS, type AdAspectRatio } from '@/lib/ad-creative/types';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface CanvasEditorProps {
  aspectRatio: AdAspectRatio;
  initialData?: object;
  onCanvasReady: (canvas: Canvas) => void;
  onSelectionChange: (objectId: string | null) => void;
  onCanvasChange: () => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
}

// 编辑器内部使用的缩放尺寸
const EDITOR_MAX_WIDTH = 800;
const EDITOR_MAX_HEIGHT = 600;

export function CanvasEditor({
  aspectRatio,
  initialData,
  onCanvasReady,
  onSelectionChange,
  onCanvasChange,
  onHistoryChange: _onHistoryChange,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const [zoom, setZoom] = useState(1);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // 获取实际尺寸
  const actualSize = AD_ASPECT_RATIOS[aspectRatio];

  // 计算显示尺寸（适应编辑器区域）
  const calculateDisplaySize = useCallback(() => {
    const { width: actualWidth, height: actualHeight } = actualSize;
    const aspectRatioValue = actualWidth / actualHeight;

    let displayWidth = EDITOR_MAX_WIDTH;
    let displayHeight = displayWidth / aspectRatioValue;

    if (displayHeight > EDITOR_MAX_HEIGHT) {
      displayHeight = EDITOR_MAX_HEIGHT;
      displayWidth = displayHeight * aspectRatioValue;
    }

    return {
      width: Math.round(displayWidth),
      height: Math.round(displayHeight),
    };
  }, [actualSize]);

  // 初始化 Canvas
  useEffect(() => {
    if (!canvasRef.current || fabricRef.current) return;

    const size = calculateDisplaySize();
    setDisplaySize(size);

    const canvas = new Canvas(canvasRef.current, {
      width: size.width,
      height: size.height,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
    });

    // 设置缩放以匹配实际尺寸
    const scaleX = size.width / actualSize.width;
    const scaleY = size.height / actualSize.height;
    canvas.setZoom(Math.min(scaleX, scaleY));

    fabricRef.current = canvas;
    onCanvasReady(canvas);

    // 事件监听
    canvas.on('selection:created', (e) => {
      const selected = e.selected?.[0];
      onSelectionChange(selected?.get('id') as string || null);
    });

    canvas.on('selection:updated', (e) => {
      const selected = e.selected?.[0];
      onSelectionChange(selected?.get('id') as string || null);
    });

    canvas.on('selection:cleared', () => {
      onSelectionChange(null);
    });

    canvas.on('object:modified', () => {
      onCanvasChange();
    });

    canvas.on('object:added', () => {
      onCanvasChange();
    });

    canvas.on('object:removed', () => {
      onCanvasChange();
    });

    // 键盘事件
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!fabricRef.current) return;

      // 忽略来自输入框的键盘事件
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Delete 键删除选中对象
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObjects = fabricRef.current.getActiveObjects();
        if (activeObjects.length > 0) {
          e.preventDefault(); // 只在有选中对象时阻止默认行为
          activeObjects.forEach(obj => fabricRef.current?.remove(obj));
          fabricRef.current.discardActiveObject();
          fabricRef.current.renderAll();
        }
      }

      // Ctrl+Z 撤销
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        // TODO: 撤销
      }

      // Ctrl+Y 重做
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        // TODO: 重做
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  // 尺寸变化时调整画布
  useEffect(() => {
    if (!fabricRef.current) return;

    const size = calculateDisplaySize();
    setDisplaySize(size);

    fabricRef.current.setDimensions({
      width: size.width,
      height: size.height,
    });

    const scaleX = size.width / actualSize.width;
    const scaleY = size.height / actualSize.height;
    fabricRef.current.setZoom(Math.min(scaleX, scaleY) * zoom);

    fabricRef.current.renderAll();
  }, [aspectRatio, zoom, actualSize, calculateDisplaySize]);

  // 加载初始数据
  useEffect(() => {
    if (!fabricRef.current || !initialData) return;

    fabricRef.current.loadFromJSON(initialData, () => {
      fabricRef.current?.renderAll();
    });
  }, [initialData]);

  // 缩放控制
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-200">
      {/* 画布区域 */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto p-8"
      >
        <div
          className="relative bg-white shadow-lg"
          style={{
            width: displaySize.width * zoom,
            height: displaySize.height * zoom,
          }}
        >
          <canvas ref={canvasRef} />

          {/* 尺寸标签 */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-500 whitespace-nowrap">
            {actualSize.width} × {actualSize.height}px ({aspectRatio})
          </div>
        </div>
      </div>

      {/* 底部缩放控制 */}
      <div className="h-10 bg-white border-t border-gray-200 flex items-center justify-center gap-2 px-4 flex-shrink-0">
        <button
          onClick={handleZoomOut}
          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <span className="text-sm text-gray-600 min-w-[60px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomReset}
          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded ml-2"
          title="重置缩放"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
