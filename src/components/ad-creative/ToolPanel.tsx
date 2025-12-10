/**
 * 左侧工具面板
 */

import { useCallback } from 'react';
import {
  Type,
  Image,
  Square,
  Circle,
  Triangle,
  Palette,
  Package,
  DollarSign,
  Upload,
} from 'lucide-react';
import { Canvas, Textbox, Rect, Circle as FabricCircle, Triangle as FabricTriangle, FabricImage } from 'fabric';
import type { AdProductContext } from '@/lib/ad-creative/types';

interface ToolPanelProps {
  canvas: Canvas | null;
  productContext: AdProductContext | null;
  onSelectProduct: () => void;
}

export function ToolPanel({ canvas, productContext, onSelectProduct }: ToolPanelProps) {
  // 生成唯一 ID
  const generateId = () => `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 添加文字
  const addText = useCallback(() => {
    if (!canvas) return;

    const text = new Textbox('双击编辑文字', {
      left: 100,
      top: 100,
      fontSize: 32,
      fontFamily: 'Arial',
      fill: '#000000',
      width: 200,
      textAlign: 'center',
    });
    text.set('id', generateId());

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  }, [canvas]);

  // 添加矩形
  const addRect = useCallback(() => {
    if (!canvas) return;

    const rect = new Rect({
      left: 100,
      top: 100,
      width: 150,
      height: 100,
      fill: '#4F46E5',
      rx: 8,
      ry: 8,
    });
    rect.set('id', generateId());

    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
  }, [canvas]);

  // 添加圆形
  const addCircle = useCallback(() => {
    if (!canvas) return;

    const circle = new FabricCircle({
      left: 100,
      top: 100,
      radius: 50,
      fill: '#10B981',
    });
    circle.set('id', generateId());

    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
  }, [canvas]);

  // 添加三角形
  const addTriangle = useCallback(() => {
    if (!canvas) return;

    const triangle = new FabricTriangle({
      left: 100,
      top: 100,
      width: 100,
      height: 100,
      fill: '#F59E0B',
    });
    triangle.set('id', generateId());

    canvas.add(triangle);
    canvas.setActiveObject(triangle);
    canvas.renderAll();
  }, [canvas]);

  // 添加商品图片
  const addProductImage = useCallback(async () => {
    if (!canvas || !productContext?.images?.[0]) return;

    const imageUrl = productContext.images[0];

    try {
      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });

      // 缩放图片到合适大小
      const maxSize = 300;
      const scale = Math.min(maxSize / (img.width || 1), maxSize / (img.height || 1));
      img.scale(scale);

      img.set({
        left: 100,
        top: 100,
      });
      img.set('id', generateId());

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    } catch (error) {
      console.error('Failed to load product image:', error);
    }
  }, [canvas, productContext]);

  // 上传图片
  const handleUploadImage = useCallback(() => {
    if (!canvas) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;

        try {
          const img = await FabricImage.fromURL(dataUrl);

          // 缩放图片到合适大小
          const maxSize = 300;
          const scale = Math.min(maxSize / (img.width || 1), maxSize / (img.height || 1));
          img.scale(scale);

          img.set({
            left: 100,
            top: 100,
          });
          img.set('id', generateId());

          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.renderAll();
        } catch (error) {
          console.error('Failed to load uploaded image:', error);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [canvas]);

  // 添加价格标签
  const addPriceTag = useCallback(() => {
    if (!canvas) return;

    const price = productContext?.prices?.com || 29.99;

    // 创建价格文字
    const priceText = new Textbox(`$${price}`, {
      left: 100,
      top: 100,
      fontSize: 48,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fill: '#DC2626',
    });
    priceText.set('id', generateId());

    canvas.add(priceText);
    canvas.setActiveObject(priceText);
    canvas.renderAll();
  }, [canvas, productContext]);

  // 设置背景色
  const setBackgroundColor = useCallback((color: string) => {
    if (!canvas) return;
    canvas.backgroundColor = color;
    canvas.renderAll();
  }, [canvas]);

  const tools = [
    { icon: Type, label: '文字', onClick: addText },
    { icon: Square, label: '矩形', onClick: addRect },
    { icon: Circle, label: '圆形', onClick: addCircle },
    { icon: Triangle, label: '三角', onClick: addTriangle },
    { icon: Upload, label: '上传图片', onClick: handleUploadImage },
  ];

  const backgroundColors = [
    '#FFFFFF',
    '#000000',
    '#1A1A2E',
    '#DC2626',
    '#2563EB',
    '#059669',
    '#D97706',
    '#7C3AED',
  ];

  return (
    <div className="w-16 bg-white border-r border-gray-200 flex flex-col py-4 flex-shrink-0">
      {/* 基础工具 */}
      <div className="space-y-1 px-2">
        {tools.map((tool) => (
          <button
            key={tool.label}
            onClick={tool.onClick}
            className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={tool.label}
          >
            <tool.icon className="w-5 h-5" />
            <span className="text-[10px]">{tool.label}</span>
          </button>
        ))}
      </div>

      {/* 分隔线 */}
      <div className="my-4 mx-2 border-t border-gray-200" />

      {/* 商品相关工具 */}
      <div className="space-y-1 px-2">
        <button
          onClick={onSelectProduct}
          className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="选择商品"
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px]">商品</span>
        </button>

        {productContext && (
          <>
            <button
              onClick={addProductImage}
              className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="添加商品图"
            >
              <Image className="w-5 h-5" />
              <span className="text-[10px]">商品图</span>
            </button>

            <button
              onClick={addPriceTag}
              className="w-full aspect-square flex flex-col items-center justify-center gap-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="添加价格"
            >
              <DollarSign className="w-5 h-5" />
              <span className="text-[10px]">价格</span>
            </button>
          </>
        )}
      </div>

      {/* 分隔线 */}
      <div className="my-4 mx-2 border-t border-gray-200" />

      {/* 背景色 */}
      <div className="px-2">
        <div className="flex flex-col items-center gap-1 mb-2">
          <Palette className="w-4 h-4 text-gray-500" />
          <span className="text-[10px] text-gray-500">背景</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {backgroundColors.map((color) => (
            <button
              key={color}
              onClick={() => setBackgroundColor(color)}
              className="w-full aspect-square rounded border border-gray-200 hover:ring-2 hover:ring-purple-500 transition-all"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
