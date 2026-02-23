import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { apiFetch } from '../utils/api';
import { Loader2, Plus, X } from 'lucide-react';

interface FinanceFormProps {
  tripId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function FinanceForm({ tripId, onSuccess, onCancel }: FinanceFormProps) {
  const { user } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    item_name: '',
    amount: '',
    currency: 'TWD',
    date: new Date().toLocaleDateString('sv-SE'),
    payer_id: user?.id || 0,
    split_members: [] as number[],
    notes: ''
  });

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/trips/${tripId}/members`);
        if (res.ok) {
          const data = await res.json() as User[];
          setMembers(data);
          // Default split members to all
          setFormData(prev => ({ ...prev, split_members: data.map((m: User) => m.id) }));
        }
      } catch (err) {
        console.error('Failed to fetch members', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [tripId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await apiFetch(`/api/trips/${tripId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
        })
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to add expense');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSplitMember = (memberId: number) => {
    setFormData(prev => {
      const current = prev.split_members;
      if (current.includes(memberId)) {
        return { ...prev, split_members: current.filter(id => id !== memberId) };
      } else {
        return { ...prev, split_members: [...current, memberId] };
      }
    });
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Add Expense</h3>
        <button onClick={onCancel} className="text-zinc-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Item Name</label>
          <input
            type="text"
            required
            value={formData.item_name}
            onChange={e => setFormData({ ...formData, item_name: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="e.g., Dinner"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Amount</label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Currency</label>
            <select
              value={formData.currency}
              onChange={e => setFormData({ ...formData, currency: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="TWD">TWD</option>
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Date</label>
          <input
            type="date"
            required
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Paid By</label>
          <select
            value={formData.payer_id}
            onChange={e => setFormData({ ...formData, payer_id: Number(e.target.value) })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-2">Split Among</label>
          <div className="grid grid-cols-2 gap-2">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleSplitMember(m.id)}
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                  formData.split_members.includes(m.id)
                    ? 'bg-orange-500/20 border-orange-500 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-900">
                  {m.avatar_url && <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />}
                </div>
                <span className="text-xs font-medium truncate">{m.name}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95 mt-4"
        >
          {submitting ? 'Adding...' : 'Add Expense'}
        </button>
      </form>
    </div>
  );
}
