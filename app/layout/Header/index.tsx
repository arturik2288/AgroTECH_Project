import StyledText from "@/components/StyledText";
import { COLORS } from "@/constants/ui";
import { StyleSheet, View } from "react-native";

const Header = () => {
  return (
    <View style={styles.container}>
      <StyledText>Привет</StyledText>
    </View>
  );
};

const styles = StyleSheet.create({
  container:{
    flex: 1,
    paddingTop: 80,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: COLORS.SECONDARY_BACKGROUND
  }

})


export default Header;
