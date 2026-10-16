/**
 * Whether the on-screen keyboard is open. Used to hide floating bottom buttons, which
 * would otherwise ride up on top of the keyboard and cover the content being typed into.
 * Native uses Keyboard events; mobile web infers it from the visual viewport shrinking.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return;
      const check = () => setVisible(vv.height < window.innerHeight * 0.75);
      vv.addEventListener('resize', check);
      return () => vv.removeEventListener('resize', check);
    }
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
