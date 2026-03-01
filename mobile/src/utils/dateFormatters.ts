/**
 * Shared date/time formatting utilities
 * Used by ChannelScreen, ConversationScreen, ThreadScreen, and ThreadIndicator
 */

/**
 * Format a message timestamp for display.
 * - includeDate: true  -> "Today at 10:30 AM" / "Yesterday at 10:30 AM" / "2/8/2026 10:30 AM"
 * - includeDate: false -> "10:30 AM" (time only, used in DM bubbles)
 */
export function formatMessageTime(
  dateString: string,
  options: { includeDate?: boolean } = { includeDate: true },
): string {
  const date = new Date(dateString);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!options.includeDate) {
    return timeStr;
  }

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return `Today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeStr}`;
  }

  return `${date.toLocaleDateString()} ${timeStr}`;
}

/**
 * Format a timestamp as relative time for thread indicators.
 * "just now" / "3m ago" / "2h ago" / "5d ago" / "2/8/2026"
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format a date for section headers in conversation view.
 * "Today" / "Yesterday" / "Monday, February 8"
 *
 * Uses calendar-day comparison (not elapsed-time) so the boundary
 * is always midnight, not a rolling 24-hour window.
 */
export function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Check whether a date-header separator should be shown above a message.
 */
export function shouldShowDateHeader(
  currentDateStr: string,
  prevDateStr: string | null,
): boolean {
  if (!prevDateStr) return true;
  return (
    new Date(currentDateStr).toDateString() !==
    new Date(prevDateStr).toDateString()
  );
}
