// apps/web/src/app/not-found.tsx
import React from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold text-foreground">404 — Not Found</h1>
        <p className="text-muted-foreground">The page or analysis you're looking for doesn't exist.</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Back to Analyzer
        </Link>
      </div>
    </div>
  );
}
