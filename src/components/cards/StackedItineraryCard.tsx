import React, { useState } from 'react';
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

  const linkedBooking = currentCard.related_id ? bookings.find(b => b.id === currentCard.related_id) : undefined;
  const displayItem = linkedBooking && !currentCard.image_url
    ? { ...currentCard, image_url: linkedBooking.image_url || '' }
    : currentCard;

  return (
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
          canEdit={isCurrentBackup ? false : canEdit}
          isConflicted={conflictedIdsInView.has(currentCard.id)}
          onEdit={() => {
            if (isCurrentBackup) return;
            linkedBooking ? onEditBooking(linkedBooking) : onEditItinerary(item);
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
          onSwapToMain={isCurrentBackup ? () => onSwapBackup(item.id, currentCard.id) : undefined}
          onAddBackup={canEdit ? () => onAddBackup(item) : undefined}
        />
      </motion.div>
    </AnimatePresence>
  );
}
