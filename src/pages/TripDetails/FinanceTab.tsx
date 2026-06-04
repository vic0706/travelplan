import React from 'react';
import { Plus, DollarSign } from 'lucide-react';
import { clsx } from 'clsx';
import { Expense } from '../../types';

interface FinanceTabProps {
  filteredExpenses: Expense[];
  currency: string;
  canEdit: boolean;
  getUserNameById: (uid: number) => string;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
}

export function FinanceTab({
  filteredExpenses, currency, canEdit, getUserNameById, onAddExpense, onEditExpense,
}: FinanceTabProps) {
  const dailyTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-lg font-bold text-white">Daily Expenses</h3>
        <div className="text-right">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Daily Total</div>
          <div className="text-xl font-bold text-white font-mono">
            {currency} {dailyTotal.toLocaleString()}
          </div>
        </div>
      </div>

      {filteredExpenses.length > 0 ? (
        filteredExpenses.map(expense => (
          <div
            key={expense.id}
            onClick={() => { if (canEdit) onEditExpense(expense); }}
            className={clsx(
              'bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center justify-between transition-colors',
              canEdit && 'cursor-pointer hover:bg-zinc-800/50'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <DollarSign className="text-zinc-400" size={20} />
              </div>
              <div>
                <h4 className="text-white font-medium">{expense.item_name}</h4>
                <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">
                  Paid by {getUserNameById(expense.payer_id)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-white">{expense.amount.toLocaleString()}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{expense.currency}</div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
          <p>No expenses recorded for this day.</p>
        </div>
      )}

      {canEdit && (
        <button
          onClick={onAddExpense}
          className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
        >
          <Plus size={20} /><span className="font-medium">Add Expense</span>
        </button>
      )}
    </div>
  );
}
