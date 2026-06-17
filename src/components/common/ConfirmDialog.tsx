import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '確定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'danger'
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onCancel();
    } catch (error) {
      console.error('Confirm action failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={loading ? undefined : onCancel}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  type === 'danger' ? 'bg-red-500/10 text-red-500' : 
                  type === 'warning' ? 'bg-orange-500/10 text-orange-500' : 
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-lg font-bold text-white">{title}</h3>
              </div>
              
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                {message}
              </p>

              <div className={`flex gap-3 ${confirmText && confirmText.length > 20 ? 'flex-col-reverse' : ''}`}>
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className={`${confirmText && confirmText.length > 20 ? 'w-full py-3' : 'flex-1 py-3'} rounded-xl font-semibold text-zinc-400 hover:bg-zinc-800 transition-colors disabled:opacity-50`}
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className={`${confirmText && confirmText.length > 20 ? 'w-full py-3' : 'flex-1 py-3'} rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 ${
                    type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' : 
                    type === 'warning' ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20' : 
                    'bg-blue-500 hover:bg-blue-600 shadow-blue-500/20'
                  }`}
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span className={`text-center leading-tight ${confirmText && confirmText.length > 30 ? 'text-xs' : confirmText && confirmText.length > 20 ? 'text-sm' : 'text-base'}`}>{confirmText}</span>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
