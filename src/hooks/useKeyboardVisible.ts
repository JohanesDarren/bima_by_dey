import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Apakah keyboard sedang terbuka. Dipakai layar masak & panel chat untuk memberi
 * panel chat seluruh ruang sisa saat pengguna mengetik.
 *
 * `onShow` (opsional) dipanggil tiap kali keyboard muncul — dibaca lewat ref, jadi
 * pemanggil boleh memberi fungsi baru tiap render tanpa memasang ulang listener.
 */
export function useKeyboardVisible(onShow?: () => void): boolean {
  const [visible, setVisible] = useState(false);
  const onShowRef = useRef(onShow);
  useEffect(() => {
    onShowRef.current = onShow;
  });

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setVisible(true);
      onShowRef.current?.();
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
