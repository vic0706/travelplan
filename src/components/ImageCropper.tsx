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

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((file) => {
      if (file) resolve(file);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', 0.9);
  });
};

export async function uploadImageToSupabase(fileOrBlob: File | Blob, folder: string = 'itineraries') {
  const formData = new FormData();
  formData.append('file', fileOrBlob);
  formData.append('folder', folder);

  // 💡 確保這裡呼叫的是最新的 media 路由
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error('Upload failed');
  const data = await response.json();
  return data.publicUrl;
}

export function ImageCropper({ image, aspect, onCropComplete, onCancel }: any) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropCompleteInternal = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedImageBlob = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedImageBlob);
    } catch (e) {
      console.error('Crop error:', e);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 relative w-full h-full">
        {/* 💡 react-easy-crop 會自動撐滿具有 relative 的父容器 */}
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompleteInternal}
          objectFit="contain" // 防止因為長寬比例極端導致的破圖
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