import { Platform } from 'react-native';

/**
 * FlatList tuning for long chat histories — reduces jank without FlashList.
 */
export const CHAT_LIST_PERF_PROPS = {
  initialNumToRender: 18,
  maxToRenderPerBatch: 12,
  windowSize: 9,
  updateCellsBatchingPeriod: 50,
  removeClippedSubviews: Platform.OS === 'android',
} as const;
