// app/camera.tsx
import { StyleSheet, Text, View } from "react-native";
// позже сюда воткнёшь expo-camera и свой ИИ-пайплайн
export default function CameraScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Камера (центр)</Text>
      <Text>Здесь будет превью камеры и кнопка “Снять”.</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ecead1", padding: 16 },
  title: { fontSize: 22, fontWeight: "600", marginBottom: 8 },
});
