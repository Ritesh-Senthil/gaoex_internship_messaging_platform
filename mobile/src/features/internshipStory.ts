/**
 * GAOEX internship story (scrollytelling) — optional feature toggle.
 *
 * Quick disable (keeps files, hides entry point + route):
 *   Set ENABLE_INTERNSHIP_STORY to false below.
 *
 * Full revert (remove feature entirely):
 *   1. Delete this file and internshipStoryNavigation.tsx
 *   2. Delete mobile/src/components/story/
 *   3. Delete mobile/src/screens/InternshipStoryScreen.tsx
 *   4. Remove [INTERNSHIP_STORY] blocks in AppNavigator.tsx and ProgramsScreen.tsx
 *   5. Remove InternshipStory from RootStackParamList in types/index.ts
 *   6. If reanimated is unused elsewhere: npm uninstall react-native-reanimated && delete babel.config.js
 */

export const ENABLE_INTERNSHIP_STORY = true;
