import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amountRs: number | null | undefined): string {
  if (amountRs === null || amountRs === undefined || isNaN(amountRs)) {
    return '₹0.00';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountRs);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function getDaysRemaining(dueAtString: string | null | undefined): {
  days: number;
  isOverdue: boolean;
  label: string;
} {
  if (!dueAtString) {
    return { days: 0, isOverdue: false, label: 'No date' };
  }
  const now = new Date();
  const due = new Date(dueAtString);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      days: Math.abs(diffDays),
      isOverdue: true,
      label: `${Math.abs(diffDays)}d overdue`,
    };
  } else if (diffDays === 0) {
    return { days: 0, isOverdue: false, label: 'Due today' };
  } else {
    return { days: diffDays, isOverdue: false, label: `${diffDays}d remaining` };
  }
}

