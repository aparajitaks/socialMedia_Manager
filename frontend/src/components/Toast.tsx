'use client';

import React from 'react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm"
      style={{ pointerEvents: 'auto' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded border text-xs shadow-sm transition-all"
          style={{
            background: '#FAFAF8',
            borderColor: t.type === 'error' ? '#B34A3C' : '#2B6E63',
            color: '#1C2321',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: t.type === 'error' ? '#B34A3C' : '#2B6E63' }}
            />
            <span className="font-medium">{t.message}</span>
          </div>

          <button
            onClick={() => onDismiss(t.id)}
            className="text-xs ml-2 hover:opacity-75"
            style={{ color: '#9A9A93' }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
