import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  type KeyboardEvent,
  type ScrollViewProps,
} from "react-native";

type Props = ScrollViewProps & {
  keyboardVerticalOffset?: number;
  avoidKeyboard?: boolean;
};

export function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  avoidKeyboard = true,
  onFocus,
  onScroll,
  onContentSizeChange,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const clearPending = useCallback(() => {
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, []);

  const revealFocusedInput = useCallback(() => {
    if (Platform.OS === "web" || keyboardTop.current === null) {
      return;
    }

    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (!focusedInput) return;

    focusedInput.measureInWindow((_x, y, _width, height) => {
      if (keyboardTop.current === null) return;

      const desiredBottom = keyboardTop.current - 32;
      const inputBottom = y + height;
      const overlap = inputBottom - desiredBottom;

      if (overlap > 0) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollY.current + overlap),
          animated: true,
        });
      }
    });
  }, []);

  const scheduleReveal = useCallback(() => {
    clearPending();

    pendingTimer.current = setTimeout(() => {
      pendingTimer.current = null;
      revealFocusedInput();
    }, 150);
  }, [clearPending, revealFocusedInput]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleShow = (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      scheduleReveal();
    };

    const handleHide = () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
      clearPending();
    };

    const show = Keyboard.addListener("keyboardDidShow", handleShow);

    const hide = Keyboard.addListener("keyboardDidHide", handleHide);

    return () => {
      show.remove();
      hide.remove();
      clearPending();
    };
  }, [scheduleReveal, clearPending]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      enabled={avoidKeyboard && Platform.OS === "ios"}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        {...props}
        ref={scrollRef}
        style={style}
        contentContainerStyle={[
          contentContainerStyle,
          Platform.OS === "android" && keyboardHeight > 0
            ? { paddingBottom: keyboardHeight + 96 }
            : undefined,
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets={
          Platform.OS === "ios" && avoidKeyboard
        }
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
          onScroll?.(event);
        }}
        onContentSizeChange={(width, height) => {
          onContentSizeChange?.(width, height);

          if (keyboardTop.current !== null) {
            scheduleReveal();
          }
        }}
        onFocus={(event) => {
          onFocus?.(event);

          if (keyboardTop.current !== null) {
            scheduleReveal();
          }
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
