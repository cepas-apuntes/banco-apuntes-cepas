// src/firebase.js
// Configuración de Firebase para el Banco de Apuntes Digitales (CEPAS)
//
// Estos valores NO son secretos: Firebase está diseñado para que esta
// configuración esté visible en el código del sitio. La seguridad real
// se controla en las Reglas de Firestore y Storage (archivos .rules).
//
// Reemplazá estos valores por los que te da Firebase cuando creás tu
// proyecto. Los encontrás en:
// Configuración del proyecto → Tus apps → Configuración del SDK

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvB0FD6h9Qz2u9cjFzZYtjSLqnX2rFDY4",
  authDomain: "apuntes-digitales-cepas.firebaseapp.com",
  projectId: "apuntes-digitales-cepas",
  storageBucket: "apuntes-digitales-cepas.firebasestorage.app",
  messagingSenderId: "793649070681",
  appId: "1:793649070681:web:90e2e28b9eb48c8904e748",
};

const app = initializeApp(firebaseConfig);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
