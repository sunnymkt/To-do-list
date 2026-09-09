import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase 콘솔(https://console.firebase.google.com)에서 프로젝트를 만들고
// '웹 앱 추가'로 발급받은 설정 값을 아래에 그대로 붙여넣으세요.
const firebaseConfig = {
  apiKey: "AIzaSyC2KIjXaEWBf5v6G8eop-4C9YFQP07p5_w",
  authDomain: "nhfood-mkt.firebaseapp.com",
  projectId: "nhfood-mkt",
  storageBucket: "nhfood-mkt.firebasestorage.app",
  messagingSenderId: "693190394131",
  appId: "1:693190394131:web:6a601cb536a5f74014dae6",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
