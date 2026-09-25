'use client';

import React, { useState } from 'react';
import { PLATFORM_LOGOS, PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from '@/lib/api';

interface PlatformLogoProps {
  platform: Platform | string;
  size?: number;
  className?: string;
}

export default function PlatformLogo({
  platform,
  size = 24,
  className = '',
}: PlatformLogoProps) {
  const [imgError, setImgError] = useState(false);

  const p = platform as Platform;
  const logoUrl = PLATFORM_LOGOS[p];
  const color = PLATFORM_COLORS[p] || '#1C2321';
  const label = PLATFORM_LABELS[p] || platform;

  // If X or image not available/errored, render vector icon or fallback
  if (p === 'x' || (!logoUrl && !imgError)) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded bg-black text-white ${className}`}
        style={{ width: size, height: size }}
        title="X (Twitter)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6) }}
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>
    );
  }

  if (imgError || !logoUrl) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 rounded text-white font-semibold ${className}`}
        style={{
          width: size,
          height: size,
          background: color,
          fontSize: Math.max(10, Math.round(size * 0.45)),
        }}
        title={label}
      >
        {label.charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={label}
      title={label}
      onError={() => setImgError(true)}
      className={`shrink-0 rounded object-cover shadow-sm ${className}`}
      style={{
        width: size,
        height: size,
      }}
    />
  );
}
