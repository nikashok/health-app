import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/ui/icons';
import { colors } from '@/ui/theme';

/**
 * Bottom tabs: Today (calories, meals, weight), Diary (any day), Progress (trends and
 * body charts). Each tab draws its own large in-screen title, so the navigation header
 * is hidden; screens pushed on top (Add Food, Log Entry, …) cover the tab bar.
 */
function tabIcon(name: IconName) {
  return ({ color }: { color: string }) => <Icon name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  // The default 49 pt bar clips the labels' descenders on web; 54 pt + the home-indicator
  // inset fits a 24 pt icon over a 10 pt label.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.separator,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 54 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', lineHeight: 13 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('today') }} />
      <Tabs.Screen name="diary" options={{ title: 'Diary', tabBarIcon: tabIcon('diary') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: tabIcon('progress') }} />
    </Tabs>
  );
}
