/**
 * Isolated navigation config for the GAOEX internship story screen.
 * Spread into AppNavigator's Stack when ENABLE_INTERNSHIP_STORY is true.
 */

import { colors } from '../constants/theme';
import InternshipStoryScreen from '../screens/InternshipStoryScreen';

export const internshipStoryScreenProps = {
  name: 'InternshipStory' as const,
  component: InternshipStoryScreen,
  options: {
    headerShown: true,
    headerStyle: { backgroundColor: colors.backgroundSecondary },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '600' as const },
    title: 'GAOEX',
  },
};
