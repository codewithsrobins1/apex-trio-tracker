'use client';

import { useState } from 'react';

type SessionCodeBannerProps = {
  code: string;
  isHost: boolean;
};

export default function SessionCodeBanner({ code, isHost }: SessionCodeBannerProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="session-banner mb-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </div>
        <div>
          <div className="text-xs text-secondary uppercase tracking-wider mb-1">
            Session Code
          </div>
          <div className="session-code">{code}</div>
        </div>
      </div>

      {isHost && (
        <button
          onClick={copyCode}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            copied
              ? 'bg-success text-white'
              : 'bg-accent/10 text-accent border border-accent hover:bg-accent hover:text-white'
          }`}
        >
          {copied ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Code
            </span>
          )}
        </button>
      )}

      {!isHost && (
        <div className="live-indicator">
          <span className="live-dot" />
          <span>Live</span>
        </div>
      )}
    </div>
  );
}
