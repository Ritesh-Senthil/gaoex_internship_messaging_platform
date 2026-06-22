/**
 * Scrolls a chat list to the bottom when the keyboard opens, if the user is
 * already pinned to the latest messages.
 */

import { useEffect, RefObject } from 'react';
import { Keyboard, Platform, FlatList } from 'react-native';

export function useKeyboardScrollOnShow(
  flatListRef: RefObject<FlatList<unknown> | null>,
  isNearBottomRef: RefObject<boolean>,
  scrollToBottom: (animated: boolean) => void,
) {
  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

    const scrollIfPinned = () => {
      if (!isNearBottomRef.current) return;
      scrollToBottom(false);
      requestAnimationFrame(() => scrollToBottom(true));
    };

    const showSub = Keyboard.addListener(eventName, scrollIfPinned);
    const didShowSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardDidShow', scrollIfPinned)
        : null;

    return () => {
      showSub.remove();
      didShowSub?.remove();
    };
  }, [flatListRef, isNearBottomRef, scrollToBottom]);
}
