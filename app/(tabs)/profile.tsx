// app/profile.tsx
import { StyleSheet, Text, View } from "react-native";
export default function ProfileScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Личный кабинет</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ecead1", padding: 16 },
  title: { fontSize: 22, fontWeight: "600" },
});
