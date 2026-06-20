import { Tabs } from 'expo-router';

/**
 * Tab shell. Home is the only tab in v1's bottom nav (PRD §5); Diary is reached
 * from Home (and later from the Add Entry button), not a tab. Home renders its own
 * iOS large title in-screen, so the navigation header is hidden.
 */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
    </Tabs>
  );
}
