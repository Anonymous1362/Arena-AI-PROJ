import { Keyboard, Platform } from "react-native";
import { useEffect, useState } from "react";

/**
 * Tracks the software keyboard so bottom controls can stop reserving a tab or
 * gesture area that is no longer on screen. Layout movement itself remains
 * owned by KeyboardAvoidingView, which follows the keyboard animation.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
