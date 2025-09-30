import { COLORS } from "@/constants/ui";
import { StatusBar, StyleSheet, View } from "react-native";
import Header from "./layout/Header";

export default function Index() {
  return (
    <View
      style={styles.container}
    >
      <StatusBar barStyle={"dark-content"} />
      <Header /> 
    </View>
  );
}

const styles = StyleSheet.create({
  container:{
    flex: 1,
    backgroundColor: COLORS.PRIMARY_BACKGORUND,
  }
})
