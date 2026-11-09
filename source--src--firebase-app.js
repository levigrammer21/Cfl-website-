import {initializeApp} from 'firebase/app'

export const mode=import.meta.env.VITE_CFL_MODE || 'preview'
export const emulator=mode==='emulator'
export const emulatorHost=import.meta.env.VITE_EMULATOR_HOST || '127.0.0.1'
const config=emulator?{apiKey:'demo-key',authDomain:'demo-cfl.firebaseapp.com',projectId:'demo-cfl',storageBucket:'demo-cfl.appspot.com',appId:'1:123:web:demo'}:{
  apiKey:'AIzaSyALNWprlsknXwJLjn3YUbcrXN5i2xV_zsU',authDomain:'pokemongridiron.firebaseapp.com',projectId:'pokemongridiron',
  storageBucket:'pokemongridiron.firebasestorage.app',messagingSenderId:'1083451194498',appId:'1:1083451194498:web:cde4347001eedfc0dd889b'
}
export const app=initializeApp(config)
