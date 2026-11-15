/**
 * Guards against iOS TextInput replaying the message that was just sent
 * (autocorrect / native field sync).
 *
 * Until the native field is cleared, a replay of that message or a leading
 * slice of it is dropped, and a keystroke appended onto it comes back as only
 * the new suffix. Once the field has been cleared, the next keystroke is the
 * start of a new message, including when it matches the start of the old one.
 * A later replay of the whole sent message is still dropped, except a single
 * character, which cannot be told apart from a real keystroke.
 *
 * Returns the text to commit, or null when the event should be dropped.
 */

/** Returns the text to apply, or null when `incomingText` should be ignored. */
export function resolvePostSendChange(
  sentText: string,
  incomingText: string,
  controlledValue: string,
  fieldCleared = false,
): string | null {
  // Parent already has content — normal edit, never suppress.
  if (controlledValue !== '') return incomingText;

  // Harmless empty replay while the field is already cleared.
  if (incomingText === '') return null;

  if (!fieldCleared) {
    if (incomingText === sentText) return null;
    if (sentText && incomingText.toLowerCase() === sentText.toLowerCase()) return null;
    // The native field still holds a leading slice of the sent message.
    if (sentText && incomingText.length < sentText.length && sentText.startsWith(incomingText)) {
      return null;
    }
    // The user typed onto the not-yet-cleared field. Keep only what they added.
    if (sentText && incomingText.startsWith(sentText) && incomingText.length > sentText.length) {
      return incomingText.slice(sentText.length);
    }
    return incomingText;
  }

  // The box is empty. One character is the user starting the next message.
  if (incomingText.length === 1) return incomingText;

  if (sentText && incomingText.toLowerCase() === sentText.toLowerCase()) return null;

  if (sentText && incomingText.startsWith(sentText) && incomingText.length > sentText.length) {
    return incomingText.slice(sentText.length);
  }

  return incomingText;
}
