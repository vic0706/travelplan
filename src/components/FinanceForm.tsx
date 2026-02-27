import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { apiFetch } from '../utils/api';
import { Loader2, X, Delete, Check, ChevronDown, Calendar } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import * as LucideIcons from 'lucide-react';
import { User } from '../types';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface FinanceFormProps {
  tripId: string;
  defaultDate?: string;
  currencies?: string[];
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any; // For editing
}

const DynamicIcon = ({ name, className, size = 16 }: { name: string, className?: string, size?: number }) => {
  // Capitalize first letter to match Lucide export names if needed, but usually they are PascalCase
  // The DB might store 'Utensils' or 'utensils'. Lucide exports are PascalCase.
  const iconName = name.charAt(0).toUpperCase() + name.slice(1);
  const Icon = (LucideIcons as any)[iconName] || (LucideIcons as any)[name] || LucideIcons.Circle;
  return <Icon className={className} size={size} />;
};

export function FinanceForm({ tripId, defaultDate, currencies = ['TWD'], onSuccess, onCancel, initialData }: FinanceFormProps) {
  const { user } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [itemName, setItemName] = useState(initialData?.item_name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialData?.category || 'Food'); // Default to Food if not set
  const [payerId, setPayerId] = useState<number>(initialData?.payer_id || user?.id || 0);
  const [splitMembers, setSplitMembers] = useState<number[]>(initialData?.split_members || []);
  const [amountStr, setAmountStr] = useState(initialData?.amount?.toString() || '0');
  const [currency, setCurrency] = useState(initialData?.currency || currencies[0] || 'TWD');
  
  const [categories, setCategories] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [membersRes, catsRes] = await Promise.all([
          apiFetch(`/api/trips/${tripId}/members`),
          apiFetch('/api/settings/categories')
        ]);

        if (membersRes.ok) {
          const data = await membersRes.json() as User[];
          setMembers(data);
          if (!initialData) {
            setSplitMembers(data.map(m => m.id));
            if (!payerId && data.length > 0) setPayerId(data[0].id);
          }
        }
        
        if (catsRes.ok) {
          const cats = await catsRes.json() as any[];
          setCategories(cats);
          // If initial category is not in list (e.g. legacy 'food' vs 'Food'), try to match or default
          if (!initialData && cats.length > 0) {
             setCategory(cats.find((c: any) => c.is_default)?.name || cats[0].name);
          }
        }
      } catch (err) {
        console.error('Failed to fetch data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tripId]);

  const handleDigit = (digit: string) => {
    if (amountStr === '0' && digit !== '.') {
      setAmountStr(digit);
    } else {
      if (digit === '.' && amountStr.includes('.')) return;
      setAmountStr(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  const handleClear = () => {
    setAmountStr('0');
  };

  const handleSubmit = async () => {
    if (!itemName || parseFloat(amountStr) === 0) return;
    setSubmitting(true);
    try {
      const endpoint = initialData ? `/api/trips/${tripId}/expenses/${initialData.id}` : `/api/trips/${tripId}/expenses`;
      const method = initialData ? 'PUT' : 'POST';
      
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({
          item_name: itemName,
          amount: parseFloat(amountStr),
          currency,
          date,
          category,
          payer_id: payerId,
          split_members: splitMembers,
          notes: ''
        })
      });

      if (!res.ok) throw new Error('Failed to save expense');
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!initialData) return;
    setSubmitting(true);
    setShowDeleteConfirm(false);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/expenses/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onSuccess();
    } catch (err) {
      alert('Failed to delete');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSplitMember = (id: number) => {
    setSplitMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] pb-safe-bottom">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-white">{initialData ? 'Edit Expense' : 'Add Expense'}</h3>
          <div className="flex gap-2">
            {initialData && (
              <button onClick={handleDeleteClick} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
                <Delete size={20} />
              </button>
            )}
            <button onClick={onCancel} className="p-2 text-zinc-400 hover:bg-zinc-800 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Date & Category */}
          <div className="flex gap-3">
          <DateRangePicker
            label="Date"
            value={{ start: new Date(date), end: new Date(date) }}
            onChange={range => setDate(range.start?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0])}
          />
            <div className="relative flex-1">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full h-full appearance-none bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500 pr-10"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                 {/* Show icon of selected category */}
                 <DynamicIcon name={categories.find(c => c.name === category)?.icon || 'Circle'} size={18} />
              </div>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Name */}
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="Expense Name"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500"
          />

          {/* Paid By */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Paid By</label>
            <div className="flex overflow-x-auto gap-2 no-scrollbar pb-1">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPayerId(m.id)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-full border transition-all shrink-0",
                    payerId === m.id ? "bg-orange-500 border-orange-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400"
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-800 overflow-hidden">
                     <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt={m.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xs font-medium">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Split Among */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">Split Among</label>
            <div className="flex overflow-x-auto gap-2 no-scrollbar pb-1">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleSplitMember(m.id)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-full border transition-all shrink-0",
                    splitMembers.includes(m.id) ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20" : "bg-zinc-950 border-zinc-800 text-zinc-500 opacity-50"
                  )}
                >
                  <div className="w-5 h-5 rounded-full bg-zinc-800 overflow-hidden">
                     <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt={m.name} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xs font-medium">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calculator Section */}
        <div className="bg-zinc-950 border-t border-zinc-800 p-4">
          {/* Display */}
          <div className="flex items-end justify-between mb-4 px-2">
            <div className="relative">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="appearance-none bg-transparent text-orange-500 font-bold text-xl pr-6 focus:outline-none cursor-pointer"
              >
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" size={16} />
            </div>
            <div className="text-4xl font-mono font-bold text-white tracking-tight">
              {amountStr}
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-3">
            {['1', '2', '3', 'C'].map(k => (
              <button
                key={k}
                onClick={() => k === 'C' ? handleClear() : handleDigit(k)}
                className={clsx(
                  "h-14 rounded-2xl font-bold text-xl transition-all active:scale-95",
                  k === 'C' ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
              >
                {k}
              </button>
            ))}
            {['4', '5', '6', '⌫'].map(k => (
              <button
                key={k}
                onClick={() => k === '⌫' ? handleBackspace() : handleDigit(k)}
                className={clsx(
                  "h-14 rounded-2xl font-bold text-xl transition-all active:scale-95",
                  k === '⌫' ? "bg-zinc-900 text-orange-500 hover:bg-zinc-800" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}
              >
                {k}
              </button>
            ))}
            {['7', '8', '9', '.'].map(k => (
              <button
                key={k}
                onClick={() => handleDigit(k)}
                className="h-14 rounded-2xl font-bold text-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95"
              >
                {k}
              </button>
            ))}
            <button
              onClick={() => handleDigit('0')}
              className="h-14 rounded-2xl font-bold text-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95 col-span-2"
            >
              0
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !itemName || parseFloat(amountStr) === 0}
              className="h-14 rounded-2xl font-bold text-xl bg-orange-500 text-white hover:bg-orange-600 transition-all active:scale-95 col-span-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Check size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">Delete Expense?</h3>
              <p className="text-zinc-400 mb-6">Are you sure you want to delete <span className="text-white font-medium">{itemName}</span>? This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
