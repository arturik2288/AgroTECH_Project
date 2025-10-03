// app/_layout.tsx
import { Slot } from "expo-router";

export default function RootLayout() {
  // просто прокидываем детей (включая index и группу (tabs))
  return <Slot />;
}
