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
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
