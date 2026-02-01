'use client';

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Yes',
  cancelText = 'No',
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const btnConfirm =
    variant === 'danger'
      ? 'cursor-pointer rounded-xl border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 hover:border-red-700 transition'
      : 'cursor-pointer rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#B71C1C] hover:border-[#B71C1C] transition';

  const btnCancel =
    'cursor-pointer rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-[#20242A] hover:border-[#E03A3E] transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-6 shadow-xl">
        <h3 className="text-lg font-bold text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{message}</p>

        <div className="mt-6 flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className={btnCancel}>
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} className={btnConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
