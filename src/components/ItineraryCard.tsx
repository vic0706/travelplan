import React from 'react';
import { Clock, MapPin, Navigation, MoreVertical, Trash2, Edit3, AlertTriangle, Star, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary } from '../types';
import { clsx } from 'clsx';

interface ItineraryCardProps {
  item: Itinerary;
  onEdit: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
  isDragOverlay?: boolean;
}

export function ItineraryCard({ item, onEdit, onDelete, isFirst, isLast, isDragOverlay }: ItineraryCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  // 計算持續時間 (例如: 2h 30m)
  const getDuration = () => {
    try {
      const start = new Date(`2000-01-01T${item.start_time}`);
      const end = new Date(`2000-01-01T${item.end_time}`);
      let diffMs = end.getTime() - start.getTime();
      if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      if (hrs === 0) return `${mins}m`;
      if (mins === 0) return `${hrs}h`;
      return `${hrs}h ${mins}m`;
    } catch {
      return '';
    }
  };

  // 生成 Google Maps 連結
  const getGoogleMapsLink = () => {
    if (item.google_place_id) {
      return `https://www.google.com/maps/place/?q=place_id:${item.google_place_id}`;
    }
    if (item.lat && item.lng) {
      return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
    }
    if (item.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`;
  };

  return (
    <div className={clsx(
      "relative group flex gap-4",
      isDragOverlay ? "opacity-90 scale-105" : "hover:-translate-y-0.5 transition-transform"
    )}>
      {/* 1. 左側時間軸 */}
      <div className="flex flex-col items-center min-w-[60px] shrink-0 mt-1">
        <div className="text-sm font-bold text-white">{item.start_time}</div>
        <div className="text-xs font-medium text-zinc-500 mt-1">{getDuration()}</div>
        {!isLast && (
          <div className="w-px h-full bg-zinc-800 my-2 group-hover:bg-orange-500/30 transition-colors" />
        )}
      </div>

      {/* 2. 主卡片內容 */}
      <div className={clsx(
        "flex-1 bg-zinc-900 border rounded-3xl overflow-hidden shadow-xl transition-all",
        item.sync_conflict_warning ? "border-red-500/50" : "border-zinc-800 hover:border-zinc-700"
      )}>
        <div className="flex flex-col sm:flex-row h-full">
          
          {/* 圖片區塊 */}
          <div className="w-full sm:w-32 h-32 sm:h-auto shrink-0 relative bg-zinc-800 overflow-hidden">
            <img 
              src={item.image_url} 
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&q=80';
              }}
            />
            {item.icon && (
              <div className="absolute top-2 left-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-xl flex items-center justify-center text-lg shadow-lg border border-white/10">
                {item.icon}
              </div>
            )}
          </div>

          {/* 資訊區塊 */}
          <div className="flex-1 p-4 flex flex-col justify-center min-w-0 relative">
            
            {/* 💡 智慧防呆警告 (AI Sync Warning) */}
            {item.sync_conflict_warning && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg w-fit mb-2">
                <AlertTriangle size={14} />
                {item.sync_conflict_warning}
              </div>
            )}

            <div className="flex items-start justify-between gap-4 mb-1">
              <h4 className="text-lg font-bold text-white leading-tight line-clamp-2">
                {item.title}
              </h4>
              
              {/* 選單按鈕 */}
              <div className="relative shrink-0">
                <button 
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-colors"
                >
                  <MoreVertical size={18} />
                </button>

                <AnimatePresence>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 top-full mt-1 w-36 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        <button onClick={() => { setShowMenu(false); onEdit(); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 transition-colors text-left">
                          <Edit3 size={16} /> Edit
                        </button>
                        <button onClick={() => { setShowMenu(false); onDelete(); }} className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors text-left border-t border-zinc-700">
                          <Trash2 size={16} /> Delete
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* 💡 Google Places 評分與評價數 */}
            {item.rating && (
              <div className="flex items-center gap-1 mb-2">
                <div className="flex items-center text-yellow-500">
                  <Star size={14} className="fill-current" />
                  <span className="text-xs font-bold ml-1">{item.rating.toFixed(1)}</span>
                </div>
                {item.reviews_count && (
                  <span className="text-xs text-zinc-500">({item.reviews_count.toLocaleString()})</span>
                )}
              </div>
            )}

            <div className="space-y-1.5 mt-auto">
              {item.address && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                  <MapPin size={14} className="shrink-0 text-zinc-500" />
                  <span className="line-clamp-1 flex-1">{item.address}</span>
                  {/* Google Maps 捷徑 */}
                  <a 
                    href={getGoogleMapsLink()} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-zinc-800 rounded-md text-zinc-500 hover:text-orange-500 transition-colors shrink-0"
                    title="Open in Google Maps"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {item.notes && (
                <p className="text-sm text-zinc-500 line-clamp-2 mt-2">{item.notes}</p>
              )}
            </div>

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {item.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}