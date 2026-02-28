import React, { useState } from 'react';
import { X, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TimePickerProps {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
}

export function TimePicker({ label, value, onChange, placeholder = 'Select time' }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hour, setHour] = useState(value ? parseInt(value.split(':')[0]) : 12);
  const [minute, setMinute] = useState(value ? parseInt(value.split(':')[1]) : 0);

  const handleSelect = () => {
    const formattedHour = hour.toString().padStart(2, '0');
    const formattedMinute = minute.toString().padStart(2, '0');
    onChange(`${formattedHour}:${formattedMinute}`);
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
          {value || placeholder}
        </span>
        <Clock size={16} className="text-zinc-500" />
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
              className="fixed inset-x-4 top-[30%] md:absolute md:inset-auto md:top-full md:left-0 md:w-64 md:mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-[150] overflow-hidden p-4"
            >
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="flex flex-col items-center">
                  <label className="text-xs text-zinc-500 mb-1">Hour</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={hour}
                    onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-16 h-12 bg-zinc-800 rounded-xl text-center text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <span className="text-2xl font-bold text-zinc-600 mt-4">:</span>
                <div className="flex flex-col items-center">
                  <label className="text-xs text-zinc-500 mb-1">Minute</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={minute}
                    onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-16 h-12 bg-zinc-800 rounded-xl text-center text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSelect}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
