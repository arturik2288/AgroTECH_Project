// app/history.tsx
import { StyleSheet, Text, View } from "react-native";
export default function HistoryScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>История снимков</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ecead1", padding: 16 },
  title: { fontSize: 22, fontWeight: "600" },
});
