import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ArrowLeft, MapPin } from 'lucide-react';

interface City {
  id: string | number;
  name: string;
  country: string;
}

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (cityId: string | number) => void;
  groupedCities: Record<string, City[]>;
}

export function LocationPicker({ isOpen, onClose, onSelect, groupedCities }: LocationPickerProps) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  if (!isOpen) return null;

  const countries = Object.keys(groupedCities).sort();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        >
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 shrink-0">
            <div className="flex items-center gap-2">
              {selectedCountry && (
                <button 
                  onClick={() => setSelectedCountry(null)}
                  className="p-1 -ml-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h3 className="text-lg font-bold text-white">
                {selectedCountry ? selectedCountry : 'Select Country'}
              </h3>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {!selectedCountry ? (
              <div className="space-y-1">
                {countries.map(country => (
                  <button
                    key={country}
                    onClick={() => setSelectedCountry(country)}
                    className="w-full flex items-center justify-between p-4 hover:bg-zinc-800 rounded-xl transition-colors group text-left"
                  >
                    <span className="font-medium text-zinc-200 group-hover:text-white">{country}</span>
                    <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {groupedCities[selectedCountry]?.map(city => (
                  <button
                    key={city.id}
                    onClick={() => {
                      onSelect(city.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800 rounded-xl transition-colors group text-left"
                  >
                    <MapPin size={18} className="text-zinc-500 group-hover:text-orange-500" />
                    <span className="font-medium text-zinc-200 group-hover:text-white">{city.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
