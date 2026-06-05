import React, { useState, useEffect } from 'react';
import { X, Footprints, Bus, Car, Bike, Clock, Loader2, Sparkles, Motorbike, Pencil } from 'lucide-react';
import { clsx } from 'clsx';
import { Itinerary } from '../../types';
import { motion } from 'framer-motion';

interface NextTransportFormProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: Itinerary | null | undefined;
  onSave: (data: { next_transport_mode: string; next_transport_time: string; next_transport_auto_time: string }) => Promise<void>;
}

// 💡 已移除 color 和 bg 定義，統一使用主題色
const TRANSPORT_MODES = [
  { id: 'DRIVING',     label: '開車',   icon: Car },
  { id: 'TRANSIT',     label: '大眾運輸', icon: Bus },
  { id: 'WALKING',     label: '步行',   icon: Footprints },
  { id: 'BICYCLING',   label: '自行車', icon: Bike },
  { id: 'MOTORCYCLING', label: '機車',  icon: Motorbike },
  { id: 'CUSTOM',      label: '自訂',   icon: Pencil },
];

export function NextTransportForm({ isOpen, onClose, itinerary, onSave }: NextTransportFormProps) {
  const [mode, setMode] = useState('DRIVING');
  const [duration, setDuration] = useState<number>(15);
  const [loading, setLoading] = useState(false);

  // 載入現有資料
  useEffect(() => {
    if (isOpen && itinerary) {
      if (itinerary.next_transport_mode === 'auto') {
        setDuration(0);
        setMode('DRIVING'); // 預設顯示在第一個
      } else {
        const currentMode = itinerary.next_transport_mode || 'DRIVING';
        setMode(currentMode);
        const mins = itinerary.next_transport_time 
          ? parseInt(itinerary.next_transport_time.replace(/\D/g, '')) 
          : 15;
        setDuration(mins || 15);
      }
    }
  }, [isOpen, itinerary]);

  if (!isOpen || !itinerary) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      // 💡 修正：如果時間為 0，next_transport_time 存為 'auto'
      // 💡 next_transport_mode 永遠儲存選中的模式（如 WALKING）
      const isAuto = duration === 0;
      await onSave({
        next_transport_mode: mode, 
        next_transport_time: isAuto ? 'auto' : `${duration} min`,
        next_transport_auto_time: '' // 這是給後端回寫用的暫存欄位
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      await onSave({ next_transport_mode: '', next_transport_time: '', next_transport_auto_time: '' });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 sm:p-0 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#1c1c1e] border border-zinc-800 rounded-[36px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-[#242426] shrink-0">
          <div>
            <h3 className="font-black text-white text-base uppercase tracking-widest">前往下一站</h3>
            <p className="text-[10px] text-zinc-500 font-bold mt-1 truncate max-w-[200px]">離開 {itinerary.title}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Transport Mode Grid */}
          <div className="grid grid-cols-3 gap-3">
            {TRANSPORT_MODES.map(m => {
              const Icon = m.icon;
              const isActive = mode === m.id;
              
              return (
                <button
                  key={m.id} type="button"
                  onClick={() => setMode(m.id)}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border transition-all active:scale-95",
                    // 💡 被選中時統一使用主題橘色 (bg-orange-500/10, text-orange-500)
                    isActive 
                      ? "bg-orange-500/10 border-orange-500/50 text-orange-500 shadow-inner" 
                      : "bg-[#242426] border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-white hover:border-zinc-500"
                  )}
                >
                  <Icon size={24} className="mb-1" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Time Input Area */}
          <div className="bg-[#242426] border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={12} className="text-orange-500" /> 預估交通時間
              </label>
              
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
                {duration === 0 ? (
                  <div className="flex items-center gap-1.5 text-orange-500 animate-pulse">
                    <Sparkles size={14} />
                    <span className="text-sm font-black">自動</span>
                  </div>
                ) : (
                  <>
                    <input
                      type="number" min="0" max="300"
                      inputMode="numeric" pattern="[0-9]*"
                      value={duration}
                      onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-12 bg-transparent text-white text-lg font-black text-right outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[10px] text-zinc-500 font-bold">分鐘</span>
                  </>
                )}
              </div>
            </div>

            {/* 💡 拉桿也統一使用主題橘色 accent-orange-500 */}
            <input 
              type="range" min="0" max="120" step="5" 
              value={duration} 
              onChange={(e) => setDuration(parseInt(e.target.value))} 
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer outline-none bg-orange-500 accent-orange-500"
              style={{ accentColor: '#f97316' }} // 強制顯示為主題橘
            />

            <div className="flex justify-between text-[9px] text-zinc-600 font-bold px-1">
              <span className={clsx(duration === 0 && "text-orange-500")}>自動</span>
              <span>30分</span>
              <span>1時</span>
              <span>2時</span>
            </div>
            
            {duration === 0 && (
              <p className="text-[10px] text-orange-500/60 text-center font-bold italic">
                * 設定為 0 將由 AI 根據距離自動計算
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-[#1c1c1e] flex gap-3 shrink-0">
          <button 
            onClick={handleClear} 
            disabled={loading || !itinerary.next_transport_mode} 
            className="flex-1 py-4 bg-[#242426] hover:bg-red-500/10 text-zinc-400 hover:text-red-500 font-bold rounded-2xl transition-colors text-xs uppercase tracking-widest"
          >
            清除
          </button>
          {/* 💡 確認按鈕统一使用主題橘色 */}
          <button 
            onClick={handleSave} 
            disabled={loading} 
            className="flex-[2] py-4 bg-orange-500 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all text-white shadow-orange-500/10 hover:bg-orange-600"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : '確認儲存'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}