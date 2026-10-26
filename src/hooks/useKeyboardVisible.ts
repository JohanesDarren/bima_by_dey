import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

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

/**
 * Tinggi keyboard dalam piksel, untuk dijadikan padding bawah.
 *
 * KENAPA INI PERLU
 * Aplikasi ini berjalan dengan `edgeToEdgeEnabled=true` (Expo SDK 57, targetSdk
 * 36). Pada mode edge-to-edge, `windowSoftInputMode="adjustResize"` TIDAK lagi
 * mengecilkan jendela aplikasi — keyboard hanya MENIMPA isi layar. Akibatnya
 * kolom tulis chat berada di balik keyboard dan pengguna tidak melihat teks yang
 * sedang diketik (kejadian nyata di HP).
 *
 * Solusinya: baca tinggi keyboard dari peristiwa `keyboardDidShow` lalu beri
 * padding bawah sebesar itu, sehingga kolom tulis selalu berada di atas keyboard.
 *
 * `keyboardDidShow` dipakai (bukan `keyboardWillShow`) karena Android tidak
 * memancarkan `willShow`, dan iOS tetap terbantu karena selisih waktunya kecil.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // Android lama melaporkan tinggi 0 pada beberapa perangkat; ambil nilai
    // `endCoordinates.height` dan abaikan yang tidak masuk akal.
    const handleShow = (event: KeyboardEvent) => {
      const height = event.endCoordinates?.height ?? 0;
      setInset(height > 0 ? height : 0);
    };
    const handleHide = () => setInset(0);

    const showSub = Keyboard.addListener('keyboardDidShow', handleShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', handleHide);

    // iOS: keyboard bisa berubah tinggi (mis. saran kata muncul).
    const iosShowSub =
      Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillShow', handleShow) : null;

    return () => {
      showSub.remove();
      hideSub.remove();
      iosShowSub?.remove();
    };
  }, []);

  return inset;
}
