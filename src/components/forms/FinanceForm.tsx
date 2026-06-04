import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { apiFetch } from '../../utils/api';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, X, Delete, Check, ChevronDown } from 'lucide-react';
import { DynamicIcon } from '../common/DynamicIcon';
import { User } from '../../types';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface FinanceFormProps {
  tripId: string;
  defaultDate?: string;
  currencies?: string[];
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

// ── 手機數字鍵盤時間輸入 ───────────────────────────────────────────────
const TimeInput = ({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string;
}) => (
  <input
    type="text"
    inputMode="numeric"
    value={value}
    onChange={e => {
      const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
      onChange(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d);
    }}
    onBlur={e => {
      const parts = e.target.value.split(':');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const h = Math.min(23, parseInt(parts[0]) || 0);
        const m = Math.min(59, parseInt(parts[1]) || 0);
        onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }}
    placeholder="HH:MM"
    className={className}
  />
);

// ── 日期選擇 chips ────────────────────────────────────────────────────
function DateChips({ date, onChange, centerDate }: {
  date: string; onChange: (d: string) => void; centerDate: string;
}) {
  const dates = Array.from({ length: 9 }, (_, i) => {
    const d = addDays(parseISO(centerDate), i - 4);
    return format(d, 'yyyy-MM-dd');
  });
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar">
      {dates.map(d => {
        const obj = parseISO(d);
        const isSelected = d === date;
        return (
          <button key={d} type="button" onClick={() => onChange(d)}
            className={clsx(
              'shrink-0 flex flex-col items-center px-3 py-2 rounded-2xl transition-all',
              isSelected
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105'
                : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700'
            )}>
            <span className="text-[9px] font-bold uppercase tracking-wide leading-none">{format(obj, 'EEE')}</span>
            <span className="text-base font-black leading-tight my-0.5">{format(obj, 'd')}</span>
            <span className={clsx('text-[8px] font-medium leading-none', isSelected ? 'opacity-80' : 'opacity-60')}>{format(obj, 'MMM')}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── 類別選擇 Modal ─────────────────────────────────────────────────────
function CategoryModal({ categories, selected, onSelect, onClose }: {
  categories: any[]; selected: string;
  onSelect: (name: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36 }}
        className="bg-[#1c1c1e] border-t border-zinc-800 rounded-t-[32px] p-6 w-full max-w-lg"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-black text-white uppercase tracking-widest">選擇分類</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white bg-zinc-800 rounded-full"><X size={17} /></button>
        </div>
        <div className="grid grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto no-scrollbar">
          {categories.map((c: any) => (
            <button key={c.id} onClick={() => { onSelect(c.name); onClose(); }}
              className={clsx('flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
                selected === c.name
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-[#242426] border-zinc-800 text-zinc-400 hover:border-zinc-600'
              )}>
              <DynamicIcon name={c.icon} size={26} />
              <span className="text-[10px] font-bold text-center leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function FinanceForm({ tripId, defaultDate, currencies = ['TWD'], onSuccess, onCancel, initialData }: FinanceFormProps) {
  const { user, categories } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const centerDate = defaultDate || today;

  const [itemName, setItemName] = useState(initialData?.item_name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate || today);
  const [timeStr, setTimeStr] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [category, setCategory] = useState(initialData?.category || 'Food');
  const [payerId, setPayerId] = useState<number>(initialData?.payer_id || user?.id || 0);
  const [splitMembers, setSplitMembers] = useState<number[]>(initialData?.split_members || []);
  const [amountStr, setAmountStr] = useState(initialData?.amount?.toString() || '0');
  const [currency, setCurrency] = useState(initialData?.currency || currencies[0] || 'TWD');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/trips/${tripId}/members`);
        if (res.ok) {
          const data = await res.json() as User[];
          setMembers(data);
          if (!initialData) {
            setSplitMembers(data.map(m => m.id));
            if (!payerId && data.length > 0) setPayerId(data[0].id);
          }
        }
      } catch { }
      finally { setLoading(false); }
    };
    fetchMembers();
  }, [tripId]);

  useEffect(() => {
    if (!initialData && categories.length > 0) {
      setCategory(categories.find((c: any) => c.is_default)?.name || categories[0].name);
    }
  }, [categories, initialData]);

  const handleDigit = (digit: string) => {
    if (amountStr === '0' && digit !== '.') setAmountStr(digit);
    else {
      if (digit === '.' && amountStr.includes('.')) return;
      setAmountStr(prev => prev + digit);
    }
  };
  const handleBackspace = () => setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  const handleClear = () => setAmountStr('0');

  const handleSubmit = async () => {
    if (!itemName || parseFloat(amountStr) === 0) return;
    setSubmitting(true);
    try {
      const endpoint = initialData ? `/api/trips/${tripId}/expenses/${initialData.id}` : `/api/trips/${tripId}/expenses`;
      const res = await apiFetch(endpoint, {
        method: initialData ? 'PUT' : 'POST',
        body: JSON.stringify({ item_name: itemName, amount: parseFloat(amountStr), currency, date, category, payer_id: payerId, split_members: splitMembers, notes: '' })
      });
      if (!res.ok) throw new Error();
      onSuccess();
    } catch { alert('儲存失敗'); }
    finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!initialData) return;
    setSubmitting(true);
    setShowDeleteConfirm(false);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/expenses/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onSuccess();
    } catch { alert('刪除失敗'); }
    finally { setSubmitting(false); }
  };

  const toggleSplitMember = (id: number) =>
    setSplitMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const selectedCategory = categories.find((c: any) => c.name === category);
  const payerMember = members.find(m => m.id === payerId);

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-[#1c1c1e]">
      <Loader2 className="animate-spin text-orange-500" size={28} />
    </div>
  );

  return (
    <>
      <div className="bg-[#1c1c1e] flex flex-col h-full" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <button onClick={onCancel} className="p-2 text-zinc-400 hover:text-white bg-[#242426] rounded-full transition-colors border border-zinc-800">
            <X size={17} />
          </button>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">{initialData ? '編輯記帳' : '新增記帳'}</h3>
          <div className="flex gap-2">
            {initialData && (
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
                <Delete size={18} />
              </button>
            )}
            {/* placeholder for alignment */}
            {!initialData && <div className="w-9" />}
          </div>
        </div>

        {/* ── 說明 + 日期chips + 時間 ──────────────────────────────── */}
        <div className="shrink-0 px-4 pt-3 pb-2 space-y-3 border-b border-zinc-800/60">
          {/* 描述 */}
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="消費項目..."
            className="w-full bg-[#242426] border border-zinc-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/70 placeholder:text-zinc-600"
          />

          {/* 日期 chips + 時間 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <DateChips date={date} onChange={setDate} centerDate={centerDate} />
            </div>
            <div className="shrink-0">
              <TimeInput
                value={timeStr}
                onChange={setTimeStr}
                className="w-20 bg-[#242426] border border-zinc-800 rounded-xl px-2 py-2.5 text-white font-mono font-bold text-sm text-center focus:outline-none focus:border-orange-500/70"
              />
            </div>
          </div>

          {/* 分類 + 付款人 + 分攤 */}
          <div className="flex items-center gap-2">
            {/* 分類圖示 */}
            <button onClick={() => setIsCategoryModalOpen(true)}
              className="shrink-0 w-12 h-12 rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/20 flex items-center justify-center active:scale-95 transition-all"
              title={category}>
              {selectedCategory
                ? <DynamicIcon name={selectedCategory.icon} size={24} />
                : <DynamicIcon name="tag" size={24} />
              }
            </button>

            {/* 付款人 */}
            <button onClick={() => setIsPayerModalOpen(true)}
              className="flex-1 flex items-center gap-2 bg-[#242426] border border-zinc-800 rounded-2xl px-3 py-2 text-left hover:border-zinc-700 transition-colors min-w-0">
              <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                <img src={payerMember?.avatar_url || `https://ui-avatars.com/api/?name=${payerMember?.name || '?'}&size=56`} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">付款人</div>
                <div className="text-xs font-bold text-white truncate">{payerMember?.name || '—'}</div>
              </div>
            </button>

            {/* 分攤 */}
            <button onClick={() => setIsSplitModalOpen(true)}
              className="flex-1 flex items-center gap-2 bg-[#242426] border border-zinc-800 rounded-2xl px-3 py-2 text-left hover:border-zinc-700 transition-colors min-w-0">
              <div className="flex -space-x-1.5 shrink-0">
                {splitMembers.slice(0, 3).map(id => {
                  const m = members.find(member => member.id === id);
                  return (
                    <div key={id} className="w-7 h-7 rounded-full border-2 border-[#242426] bg-zinc-700 overflow-hidden">
                      <img src={m?.avatar_url || `https://ui-avatars.com/api/?name=${m?.name || '?'}&size=56`} alt="" className="w-full h-full object-cover" />
                    </div>
                  );
                })}
                {splitMembers.length > 3 && (
                  <div className="w-7 h-7 rounded-full border-2 border-[#242426] bg-zinc-700 flex items-center justify-center text-[8px] text-zinc-300 font-bold">+{splitMembers.length - 3}</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">分攤</div>
                <div className="text-xs font-bold text-white truncate">{splitMembers.length === members.length ? '所有人' : `${splitMembers.length} 人`}</div>
              </div>
            </button>
          </div>
        </div>

        {/* ── 計算機 ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col px-4 pt-3 pb-2 bg-zinc-900/50 min-h-0">
          {/* 金額顯示 */}
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="relative">
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="appearance-none bg-transparent text-orange-400 font-bold text-lg pr-5 focus:outline-none cursor-pointer">
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-orange-400 pointer-events-none" size={14} />
            </div>
            <div className="text-4xl font-mono font-black text-white tracking-tight">{amountStr}</div>
          </div>

          {/* 按鍵 — flex-1 grid 撐滿剩餘空間 */}
          <div className="flex-1 grid grid-cols-4 gap-2 min-h-0" style={{ gridTemplateRows: 'repeat(4, 1fr)' }}>
            {['1', '2', '3', 'C'].map(k => (
              <button key={k} onClick={() => k === 'C' ? handleClear() : handleDigit(k)}
                className={clsx('rounded-2xl font-black text-xl transition-all active:scale-95 active:brightness-75',
                  k === 'C' ? 'bg-red-500/15 text-red-400' : 'bg-[#242426] text-white hover:bg-zinc-700'
                )}>
                {k}
              </button>
            ))}
            {['4', '5', '6', '⌫'].map(k => (
              <button key={k} onClick={() => k === '⌫' ? handleBackspace() : handleDigit(k)}
                className={clsx('rounded-2xl font-black text-xl transition-all active:scale-95 active:brightness-75',
                  k === '⌫' ? 'bg-[#242426] text-orange-400' : 'bg-[#242426] text-white hover:bg-zinc-700'
                )}>
                {k}
              </button>
            ))}
            {['7', '8', '9', '.'].map(k => (
              <button key={k} onClick={() => handleDigit(k)}
                className="rounded-2xl font-black text-xl bg-[#242426] text-white hover:bg-zinc-700 transition-all active:scale-95 active:brightness-75">
                {k}
              </button>
            ))}
            <button onClick={() => handleDigit('0')}
              className="rounded-2xl font-black text-xl bg-[#242426] text-white hover:bg-zinc-700 transition-all active:scale-95 active:brightness-75 col-span-2">
              0
            </button>
            <button onClick={handleSubmit} disabled={submitting || !itemName || parseFloat(amountStr) === 0}
              className="rounded-2xl font-black text-xl bg-orange-500 text-white hover:bg-orange-600 transition-all active:scale-95 col-span-2 shadow-lg shadow-orange-500/20 disabled:opacity-40 flex items-center justify-center">
              {submitting ? <Loader2 className="animate-spin" size={26} /> : <Check size={26} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* 刪除確認 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1c1c1e] border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">刪除記帳？</h3>
              <p className="text-zinc-400 mb-6 text-sm">確定要刪除 <span className="text-white font-medium">{itemName}</span>？此操作無法復原。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:bg-zinc-800 transition-colors">取消</button>
                <button onClick={confirmDelete} className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors">刪除</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 類別選擇 */}
        {isCategoryModalOpen && (
          <CategoryModal
            categories={categories}
            selected={category}
            onSelect={setCategory}
            onClose={() => setIsCategoryModalOpen(false)}
          />
        )}

        {/* 付款人 */}
        {isPayerModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              className="bg-[#1c1c1e] border-t border-zinc-800 rounded-t-3xl p-6 w-full max-w-lg" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-black text-white uppercase tracking-widest">誰付款？</h3>
                <button onClick={() => setIsPayerModalOpen(false)} className="p-2 bg-zinc-800 rounded-full text-zinc-400"><X size={17} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {members.map(m => (
                  <button key={m.id} onClick={() => { setPayerId(m.id); setIsPayerModalOpen(false); }}
                    className={clsx('flex items-center gap-3 p-3 rounded-2xl border transition-all',
                      payerId === m.id ? 'bg-orange-500 border-orange-500 text-white' : 'bg-[#242426] border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    )}>
                    <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                      <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-bold truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* 分攤 */}
        {isSplitModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              className="bg-[#1c1c1e] border-t border-zinc-800 rounded-t-3xl p-6 w-full max-w-lg" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-black text-white uppercase tracking-widest">分攤對象</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSplitMembers(members.map(m => m.id))} className="text-xs text-orange-400 font-bold px-3 py-1.5 bg-orange-500/10 rounded-xl">全選</button>
                  <button onClick={() => setIsSplitModalOpen(false)} className="p-2 bg-zinc-800 rounded-full text-zinc-400"><X size={17} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto no-scrollbar">
                {members.map(m => (
                  <button key={m.id} onClick={() => toggleSplitMember(m.id)}
                    className={clsx('flex items-center gap-3 p-3 rounded-2xl border transition-all',
                      splitMembers.includes(m.id) ? 'bg-orange-500 border-orange-500 text-white' : 'bg-[#242426] border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    )}>
                    <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                      <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-bold truncate flex-1">{m.name}</span>
                    {splitMembers.includes(m.id) && <Check size={14} className="shrink-0" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSplitModalOpen(false)}
                className="w-full mt-5 bg-orange-500 text-white font-black py-3 rounded-2xl shadow-lg shadow-orange-500/20 text-sm uppercase tracking-wide">
                完成
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
