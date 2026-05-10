import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
