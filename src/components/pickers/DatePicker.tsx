import React, { useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface DatePickerProps {
  label?: string;
  value?: Date | null;
  onChange?: (date: Date) => void;
  placeholder?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onSelect?: (date: string) => void;
  initialDate?: string;
}

export function DatePicker({ 
  label, 
  value: controlledValue, 
  onChange: controlledOnChange, 
  placeholder = 'Select date',
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onSelect: externalOnSelect,
  initialDate
}: DatePickerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    if (externalOnClose && !val) externalOnClose();
    setInternalIsOpen(val);
  };

  const value = controlledValue !== undefined 
    ? controlledValue 
    : (initialDate ? parseISO(initialDate) : null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

  const handleSelect = (date: Date) => {
    if (controlledOnChange) controlledOnChange(date);
    if (externalOnSelect) externalOnSelect(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {label && <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-left text-white focus:outline-none focus:border-orange-500 transition-colors flex items-center justify-between"
      >
        <span className={value ? 'text-white' : 'text-zinc-500'}>
          {value ? format(value, 'MMM d, yyyy') : placeholder}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[20%] md:absolute md:inset-auto md:top-full md:left-0 md:w-80 md:mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-[150] overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-white font-semibold">
                    {format(currentMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="text-center text-xs font-medium text-zinc-500 py-1">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                    const isSelected = value && isSameDay(day, value);
                    const isCurrentMonth = isSameMonth(day, currentMonth);

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelect(day)}
                        className={`
                          relative h-9 rounded-lg text-sm font-medium transition-all
                          ${!isCurrentMonth ? 'text-zinc-700' : 'text-zinc-300 hover:bg-zinc-800'}
                          ${isSelected ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20' : ''}
                          ${isToday(day) && !isSelected ? 'text-orange-500' : ''}
                        `}
                      >
                        {format(day, 'd')}
                        {isToday(day) && !isSelected && (
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-orange-500 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
