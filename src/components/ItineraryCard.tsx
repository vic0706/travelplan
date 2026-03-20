import React from 'react';
import { MapPin, MoreVertical, Trash2, Edit3, AlertTriangle, Star, ExternalLink } from 'lucide-react';
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
    } catch { return ''; }
  };

  const getGoogleMapsLink = () => {
    if (item.google_place_id) return `https://www.google.com/maps/place/?q=place_id:${item.google_place_id}`;
    if (item.lat && item.lng) return `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.title)}`;
  };

  return (
    <div className={clsx("relative group flex gap-4", isDragOverlay ? "opacity-90 scale-105" : "hover:-translate-y-0.5 transition-transform")}>
      
      {/* 左側：時間、持續時間與星星數 */}
      <div className="flex flex-col items-center min-w-[75px] shrink-0 mt-3">
        <div className="text-sm font-bold text-white">{item.start_time}</div>
        <div className="text-[10px] font-medium text-zinc-500 mt-0.5">{getDuration()}</div>
        
        {/* 💡 星星數放在時間下方 */}
        {item.rating && (
          <div className="flex items-center gap-1 mt-2 bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded-md">
            <Star size={10} className="fill-current" />
            <span className="text-[10px] font-bold">{item.rating.toFixed(1)}</span>
          </div>
        )}

        {!isLast && <div className="w-px h-full bg-zinc-800 my-2 group-hover:bg-orange-500/30 transition-colors" />}
      </div>

      {/* 右側：主卡片 (乾淨版) */}
      <div className={clsx(
        "flex-1 bg-zinc-900 rounded-2xl p-4 transition-all relative border",
        // 💡 發生衝突或公休時，顯示紅框
        item.sync_conflict_warning ? "border-red-500 ring-1 ring-red-500/50 bg-red-500/5" : "border-zinc-800 hover:border-zinc-700"
      )}>
        
        {/* 💡 警告標籤 */}
        {item.sync_conflict_warning && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 mb-2">
            <AlertTriangle size={14} />
            {item.sync_conflict_warning}
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* 圖示 */}
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-lg shrink-0 border border-zinc-700/50">
              {item.icon || '📍'}
            </div>
            
            {/* 標題與地址 */}
            <div className="pt-0.5">
              <h4 className="text-base font-bold text-white leading-tight">{item.title}</h4>
              {item.address && (
                <div className="flex items-center gap-1 mt-1 text-xs text-zinc-400">
                  <MapPin size={12} className="shrink-0 text-zinc-500" />
                  <span className="line-clamp-1">{item.address}</span>
                  <a href={getGoogleMapsLink()} target="_blank" rel="noopener noreferrer" className="p-1 hover:text-orange-500 transition-colors" title="Open in Maps">
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 右上角選單 */}
          <div className="relative shrink-0">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors">
              <MoreVertical size={16} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute right-0 top-full mt-1 w-32 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <button onClick={() => { setShowMenu(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-white hover:bg-zinc-700 transition-colors">
                      <Edit3 size={14} /> Edit
                    </button>
                    <button onClick={() => { setShowMenu(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors border-t border-zinc-700">
                      <Trash2 size={14} /> Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 備註與標籤 */}
        {(item.notes || (item.tags && item.tags.length > 0)) && (
          <div className="mt-3 pt-3 border-t border-zinc-800/50">
            {item.notes && <p className="text-xs text-zinc-400 line-clamp-2 mb-2">{item.notes}</p>}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] font-medium text-zinc-500">{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}