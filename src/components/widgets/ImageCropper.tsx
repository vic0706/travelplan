import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

// 將 Base64 轉換並進行裁切的工具函式
const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<Blob> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  // Scale down to max 1200px to reduce file size while keeping good quality
  const MAX_SIDE = 1200;
  const scale = Math.min(1, MAX_SIDE / Math.max(pixelCrop.width, pixelCrop.height));
  const outW = Math.round(pixelCrop.width * scale);
  const outH = Math.round(pixelCrop.height * scale);

  canvas.width = outW;
  canvas.height = outH;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) resolve(file);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', 0.75);
  });
};

export async function uploadImageToSupabase(fileOrBlob: File | Blob, folder: string = 'itineraries') {
  const formData = new FormData();
  formData.append('file', fileOrBlob);
  formData.append('folder', folder);

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error('Upload failed');
  const data = await response.json();
  return data.publicUrl;
}

// ✅ 修正：加上明確的 TypeScript interface，prop 統一命名為 imageSrc
interface ImageCropperProps {
  imageSrc: string;
  aspect: number;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropper({ imageSrc, aspect, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    try {
      // ✅ 修正：使用 imageSrc 而非舊的 image
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedImageBlob);
    } catch (e) {
      console.error('Crop error:', e);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 relative w-full h-full">
        <Cropper
          image={imageSrc}  // ✅ 修正：Cropper 元件的 image prop 也改用 imageSrc
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompleteInternal}
          objectFit="contain"
        />
      </div>
      
      {/* 底部按鈕區 */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-50 px-6">
        <button 
          onClick={onCancel} 
          className="flex-1 py-3 bg-zinc-800 text-white font-bold rounded-2xl shadow-lg border border-zinc-700"
        >
          取消
        </button>
        <button 
          onClick={handleConfirm} 
          className="flex-1 py-3 bg-orange-500 text-white font-black tracking-wider uppercase rounded-2xl shadow-lg shadow-orange-500/20"
        >
          確認裁切
        </button>
      </div>
    </div>
  );
}