/* ═══════════════════════════════════════════════════════════
   Firebase 초기화 (ES 모듈)
   - SDK 함수와 app/auth/db/storage 인스턴스를 window에 올려서
     admin/js/*.js (일반 스크립트)에서 그대로 쓰게 합니다.
   - 이 파일 다음에 오는 <script defer> 파일들은 문서 순서대로 실행됩니다.
   ═══════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updatePassword, updateEmail, deleteUser, EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeApp as initializeSecondaryApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, updateDoc, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, getDownloadURL, listAll, uploadBytes, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_eYNKzfa-aT41E3Dqt_HyJc6UeSR5ErA",
  authDomain: "songmath.firebaseapp.com",
  projectId: "songmath",
  storageBucket: "songmath.firebasestorage.app",
  messagingSenderId: "936295436575",
  appId: "1:936295436575:web:d1e201508719850cfbe02a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db      = getFirestore(app);
window.db = db;
const storage = getStorage(app);
const functionsInstance = getFunctions(app, "asia-northeast3");

// 학생 계정 생성용 보조 앱 (생성 후 자동 로그인 방지)
const secondaryApp = initializeSecondaryApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

// 일반 스크립트에서 쓰도록 전역으로 노출
Object.assign(window, {
  initializeApp, getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, updatePassword, updateEmail, deleteUser, EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, initializeSecondaryApp, getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, updateDoc, query, where, orderBy, Timestamp, getStorage, ref, getDownloadURL, listAll, uploadBytes, uploadBytesResumable, deleteObject, getFunctions, httpsCallable,
  firebaseConfig, app, auth, db, storage, functionsInstance, secondaryApp, secondaryAuth,
});
