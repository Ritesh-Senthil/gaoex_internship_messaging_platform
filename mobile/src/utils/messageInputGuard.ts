/**
 * Guards against iOS TextInput firing stale onChangeText events after send
 * (autocorrect / native field sync). Must not swallow the user's first new keystroke.
 */

/** Returns true when `incomingText` should be ignored after a send cleared the field. */
export function shouldIgnoreStalePostSendChange(
  sentText: string,
  incomingText: string,
  controlledValue: string,
): boolean {
  // Parent already has content — normal edit, never suppress.
  if (controlledValue !== '') return false;

  // Harmless empty replay while the field is already cleared.
  if (incomingText === '') return true;

  if (incomingText === sentText) return true;

  if (sentText && incomingText.toLowerCase() === sentText.toLowerCase()) return true;

  // iOS sometimes replays the full prior message or an autocorrect variant (>1 char).
  if (incomingText.length > 1) {
    if (sentText && (incomingText.startsWith(sentText) || sentText.startsWith(incomingText))) {
      return true;
    }
  }

  // Single character — treat as intentional user input.
  return false;
}
