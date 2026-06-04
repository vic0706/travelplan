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

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

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
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-left text-white focus:outline-none focus:border-orange-500 transition-colors flex items-center justify-between group"
      >
        <span className={value ? 'text-white font-medium' : 'text-zinc-500'}>
          {value || placeholder}
        </span>
        <Clock size={16} className="text-zinc-500 group-hover:text-orange-500 transition-colors" />
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
              className="fixed inset-x-4 top-[20%] md:absolute md:inset-auto md:top-full md:left-0 md:w-72 md:mt-2 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl z-[150] overflow-hidden flex flex-col max-h-[400px]"
            >
              <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
                <span className="text-sm font-bold text-white">Select Time</span>
                <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden h-64">
                {/* Hours Column */}
                <div className="flex-1 overflow-y-auto py-24 custom-scrollbar snap-y snap-mandatory">
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHour(h)}
                      className={`w-full py-3 text-center transition-all snap-center ${
                        hour === h ? 'text-2xl font-bold text-orange-500 bg-orange-500/10' : 'text-lg text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {h.toString().padStart(2, '0')}
                    </button>
                  ))}
                </div>

                <div className="flex items-center text-zinc-700 font-bold text-2xl">:</div>

                {/* Minutes Column */}
                <div className="flex-1 overflow-y-auto py-24 custom-scrollbar snap-y snap-mandatory">
                  {minutes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinute(m)}
                      className={`w-full py-3 text-center transition-all snap-center ${
                        minute === m ? 'text-2xl font-bold text-orange-500 bg-orange-500/10' : 'text-lg text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {m.toString().padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSelect}
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-orange-500/20"
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
