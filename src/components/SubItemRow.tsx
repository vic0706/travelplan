import React, { useState, useRef } from 'react';
import { Map, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface SubItemRowProps {
  sub: any;
  itineraryImageUrl: string | null;
  isLast: boolean;
  hasMore: boolean;
}

export function SubItemRow({ sub, itineraryImageUrl, isLast, hasMore }: SubItemRowProps) {
  const [showNotes, setShowNotes] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowNotes(!showNotes);
    if (!showNotes && rowRef.current) {
      setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  };

  return (
    <div ref={rowRef} className={clsx("flex flex-col gap-1 text-sm p-3 rounded-2xl border relative overflow-hidden group/sub transition-all", itineraryImageUrl ? "text-white/90 bg-black/40 border-white/10" : "text-zinc-400 bg-zinc-900/50 border-zinc-800/50")}>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-700 group-hover/sub:bg-orange-500 transition-colors"></div>
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="text-xs font-mono text-zinc-400 whitespace-nowrap min-w-[80px]">{sub.start_time} - {sub.end_time}</div>
        <div className={clsx("font-semibold flex-1 truncate", itineraryImageUrl ? "text-white" : "text-zinc-100")}>{sub.title || sub.text}</div>
        <div className="flex items-center gap-2 shrink-0">
          {sub.address && <a href={sub.address.startsWith('http') ? sub.address : `http://maps.google.com/?q=${encodeURIComponent(sub.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={clsx("p-1.5 rounded-full transition-colors", itineraryImageUrl ? "text-white/70 hover:text-white hover:bg-white/10" : "text-zinc-500 hover:text-orange-500 hover:bg-zinc-800")}><Map size={14} /></a>}
          {(sub.notes || (sub.tags && sub.tags.length > 0)) && <button onClick={handleToggle} className={clsx("p-1.5 rounded-full transition-colors", itineraryImageUrl ? "text-white/70 hover:text-white hover:bg-white/10" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}><ChevronDown size={14} className={clsx("transition-transform", showNotes ? "rotate-180" : "")} /></button>}
        </div>
      </div>
      <AnimatePresence>
        {showNotes && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pl-2">
            {sub.tags && Array.isArray(sub.tags) && sub.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2 mb-1">{sub.tags.map((tag: string, idx: number) => <span key={idx} className={clsx("text-[10px] px-1.5 py-0.5 rounded border", itineraryImageUrl ? "text-white/80 border-white/20 bg-white/5" : "text-zinc-400 border-zinc-700 bg-zinc-800")}>{tag}</span>)}</div>}
            {sub.notes && <div className={clsx("text-xs mt-1 italic leading-relaxed p-2 rounded-lg", itineraryImageUrl ? "bg-white/10 text-white/80" : "bg-zinc-800/50 text-zinc-400")}>{sub.notes}</div>}
            {hasMore && <div className="text-[9px] text-zinc-500 text-center mt-2 pb-1 animate-pulse">▼ More sub-activities below</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}