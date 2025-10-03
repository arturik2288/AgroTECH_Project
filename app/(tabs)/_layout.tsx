// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="camera"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: "#15803d", borderTopWidth: 0, height: 64 },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="history"
        options={{ tabBarIcon: ({ color, size }) => (
          <Ionicons name="reorder-three-outline" size={size} color={color} />
        )}}
      />
      <Tabs.Screen
        name="camera"
        options={{ tabBarIcon: ({ color, size }) => (
          <Ionicons name="camera-outline" size={size + 8} color={color} />
        )}}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ color, size }) => (
          <Ionicons name="person-circle-outline" size={size} color={color} />
        )}}
      />
    </Tabs>
  );
}
