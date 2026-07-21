import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvB0FD6h9Qz2u9cjFzZYtjSLqnX2rFDY4",
  authDomain: "apuntes-digitales-cepas.firebaseapp.com",
  projectId: "apuntes-digitales-cepas",
  messagingSenderId: "793649070681",
  appId: "1:793649070681:web:90e2e28b9eb48c8904e748",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
