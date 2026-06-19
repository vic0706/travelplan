import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary, Booking } from '../../types';
import { ItineraryCard } from './ItineraryCard';

interface StackedItineraryCardProps {
  item: Itinerary;
  backups: Itinerary[];
  index: number;
  displayList: Itinerary[];
  conflictedIdsInView: Set<number>;
  bookings: Booking[];
  canEdit: boolean;
  expandSignal: number;
  collapseSignal: number;
  defaultSignal: number;
  expandState: 'default' | 'expanded' | 'collapsed';
  onEditItinerary: (item: Itinerary) => void;
  onEditNextTransport: (item: Itinerary) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyItinerary: (item: Itinerary) => void;
  onChangeDateItinerary: (item: Itinerary) => void;
  onToggleLock: (item: Itinerary) => void;
  dragHandleListeners?: Record<string, unknown>;
  onAddBackup: (primary: Itinerary) => void;
  onSwapBackup: (primaryId: number, backupId: number) => void;
}

export function StackedItineraryCard({
  item, backups, index, displayList, conflictedIdsInView, bookings, canEdit,
  expandSignal, collapseSignal, defaultSignal, expandState,
  onEditItinerary, onEditNextTransport, onEditBooking, onCopyItinerary,
  onChangeDateItinerary, onToggleLock, dragHandleListeners,
  onAddBackup, onSwapBackup,
}: StackedItineraryCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);

  const allCards = [item, ...backups];
  const currentCard = allCards[currentIndex];
  const isCurrentBackup = currentIndex > 0;
  const totalCards = allCards.length;

  const gotoPrev = () => {
    if (currentIndex === 0) return;
    setDirection(-1);
    setCurrentIndex(i => i - 1);
  };

  const gotoNext = () => {
    if (currentIndex >= totalCards - 1) return;
    setDirection(1);
    setCurrentIndex(i => i + 1);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    swipeStartX.current = e.clientX;
    swipeStartY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (swipeStartX.current === null) return;
    const diffX = e.clientX - swipeStartX.current;
    const diffY = Math.abs(e.clientY - (swipeStartY.current ?? e.clientY));
    swipeStartX.current = null;
    swipeStartY.current = null;
    // Ignore if primarily a vertical gesture (drag-to-reorder)
    if (Math.abs(diffX) < 50 || diffY > Math.abs(diffX)) return;
    if (diffX < 0) gotoNext();
    else gotoPrev();
  };

  const linkedBooking = currentCard.related_id ? bookings.find(b => b.id === currentCard.related_id) : undefined;
  const displayItem = linkedBooking && !currentCard.image_url
    ? { ...currentCard, image_url: linkedBooking.image_url || '' }
    : currentCard;

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentIndex}
            initial={{ x: direction * 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -24, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          >
            <ItineraryCard
              item={displayItem}
              nextItem={!isCurrentBackup ? displayList[index + 1] : undefined}
              canEdit={canEdit}
              isConflicted={conflictedIdsInView.has(currentCard.id)}
              onEdit={() => {
                if (isCurrentBackup) {
                  onEditItinerary(currentCard);
                } else {
                  linkedBooking ? onEditBooking(linkedBooking) : onEditItinerary(item);
                }
              }}
              showNextTransport={!isCurrentBackup && index < displayList.length - 1}
              onEditNextTransport={() => onEditNextTransport(item)}
              expandSignal={expandSignal}
              collapseSignal={collapseSignal}
              defaultSignal={defaultSignal}
              expandState={expandState}
              onCopy={!isCurrentBackup ? () => onCopyItinerary(item) : undefined}
              onChangeDate={!isCurrentBackup ? () => onChangeDateItinerary(item) : undefined}
              onToggleLock={!isCurrentBackup ? () => onToggleLock(item) : undefined}
              dragHandleListeners={!isCurrentBackup ? dragHandleListeners : undefined}
              cardIndex={currentIndex}
              totalCards={totalCards}
              onPrevCard={gotoPrev}
              onNextCard={gotoNext}
              isBackup={isCurrentBackup}
              onSwapToMain={isCurrentBackup ? () => setShowSwapConfirm(true) : undefined}
              onAddBackup={canEdit ? () => onAddBackup(item) : undefined}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 切換確認彈窗 */}
      {showSwapConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">切換為主要行程？</h3>
            <p className="text-zinc-400 text-sm mb-1">
              <span className="text-orange-400 font-bold">「{currentCard.title}」</span> 將成為主要行程
            </p>
            <p className="text-zinc-500 text-xs mb-6">
              原主要行程「{item.title}」將改為備案
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSwapConfirm(false)}
                className="flex-1 py-3 rounded-2xl text-zinc-400 hover:bg-zinc-800 font-bold transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setShowSwapConfirm(false); onSwapBackup(item.id, currentCard.id); }}
                className="flex-1 py-3 rounded-2xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors"
              >
                確認切換
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
