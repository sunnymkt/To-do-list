import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X, CalendarDays, ListTodo, Users, Star, Check, Pencil, Download, Upload, Plane, Palmtree, LogOut } from "lucide-react";
import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot } from "firebase/firestore";

const BG = "#F8F9FC";
const SURFACE = "#FFFFFF";
const SURFACE_ALT = "#EEF2FF";
const SIDEBAR_BG = "#F5F6FA";
const ACCENT = "#4F73F5";
const ACCENT_SOFT = "rgba(79,115,245,0.10)";
const IMPORTANT = "#F59E0B";
const IMPORTANT_SOFT = "rgba(245,158,11,0.12)";
const TRIP = "#10B981";
const TRIP_SOFT = "rgba(16,185,129,0.12)";
const VACATION = "#8B5CF6";
const VACATION_SOFT = "rgba(139,92,246,0.12)";
const TODO_SOFT = "#F1F2F6";
const TODO_TEXT = "#4B5563";

const TYPE_STYLES = {
  meeting: { label: "회의", icon: Users, dot: ACCENT, soft: ACCENT_SOFT, text: ACCENT },
  important: { label: "중요 일정", icon: Star, dot: IMPORTANT, soft: IMPORTANT_SOFT, text: "#B45309" },
  trip: { label: "출장", icon: Plane, dot: TRIP, soft: TRIP_SOFT, text: "#047857" },
  vacation: { label: "휴가", icon: Palmtree, dot: VACATION, soft: VACATION_SOFT, text: "#6D28D9" },
};
function styleFor(type) {
  return TYPE_STYLES[type] || TYPE_STYLES.meeting;
}

// 팀원 이름 -> 한 음절 배지 매핑
const NAME_BADGES = {
  "서현": "서",
  "최유희": "최",
  "양준영": "양",
  "서미애": "미",
  "김시라": "시",
  "김현택": "택",
  "권오성": "5",
  "김병철": "병",
  "장명은": "명",
};
function badgeForName(name) {
  if (!name) return "?";
  return NAME_BADGES[name] || name[0];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n) {
  return String(n).padStart(2, "0");
}
function fmtDate(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayStr() {
  const t = new Date();
  return fmtDate(t.getFullYear(), t.getMonth(), t.getDate());
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return fmtDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const seedEvents = [
  { id: "e1", date: todayStr(), time: "10:00", title: "유통영업팀 주간 회의", type: "meeting" },
];
const seedTodos = [
  { id: "t1", text: "계통,시판 행사 비용 집계", done: false, date: todayStr() },
];

// 사용자 아이디를 Firebase 인증용 이메일 형식으로 변환합니다 (내부용, 실제 이메일 불필요).
function toAuthEmail(username) {
  return `${username.trim().toLowerCase()}@nhfood-calendar.app`;
}

function authErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use": return "이미 사용 중인 아이디예요.";
    case "auth/weak-password": return "비밀번호는 6자 이상이어야 해요.";
    case "auth/invalid-email": return "아이디는 영문/숫자로 입력해주세요.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "아이디 또는 비밀번호가 올바르지 않아요.";
    default: return "오류가 발생했어요. 다시 시도해주세요.";
  }
}

// 사용자별 데이터는 Firestore의 calendarData/{uid} 문서에 저장합니다.
async function loadUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "calendarData", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}
async function saveUserData(uid, data) {
  try {
    await setDoc(doc(db, "calendarData", uid), data, { merge: true });
    return true;
  } catch {
    return false;
  }
}

function AuthScreen({ mode, setMode, form, setForm, onSubmit, error, loading }) {
  return (
    <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: BG, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl p-6" style={{ backgroundColor: SURFACE, border: "1px solid #D6DAE3" }}>
        <h1 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>마케팅부 일정관리</h1>
        <p className="text-xs text-gray-500 mb-5">
          {mode === "login" ? "로그인해서 내 일정을 확인하세요" : "새 계정을 만드세요"}
        </p>

        {mode === "signup" && (
          <>
            <label className="text-xs font-medium text-gray-500 block mb-1">이름</label>
            <input
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 mb-3"
              style={{ backgroundColor: SIDEBAR_BG }}
            />
          </>
        )}

        <label className="text-xs font-medium text-gray-500 block mb-1">아이디</label>
        <input
          value={form.username}
          onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
          className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 mb-3"
          style={{ backgroundColor: SIDEBAR_BG }}
          autoCapitalize="none"
          autoCorrect="off"
        />

        <label className="text-xs font-medium text-gray-500 block mb-1">비밀번호</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
          className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 mb-4"
          style={{ backgroundColor: SIDEBAR_BG }}
        />

        {error && <p className="text-xs mb-3" style={{ color: "#EF4444" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full text-center text-xs text-gray-500 mt-4 hover:text-gray-700"
        >
          {mode === "login" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </form>
    </div>
  );
}

export default function CalendarTodoApp() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [events, setEvents] = useState(seedEvents);
  const [todos, setTodos] = useState(seedTodos);
  const [newTodo, setNewTodo] = useState("");
  const [newTodoDate, setNewTodoDate] = useState(todayStr());
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ id: null, date: todayStr(), endDate: todayStr(), continuous: false, time: "09:00", title: "", type: "meeting", shared: true });

  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState("");
  const [editingTodoDate, setEditingTodoDate] = useState("");

  // 미리보기 카드: 어떤 날짜 위에 마우스가 있는지 + 그 셀의 화면 위치
  const [previewDate, setPreviewDate] = useState(null);
  const [previewRect, setPreviewRect] = useState(null);
  const closeTimer = useRef(null);

  // 모바일 폭 감지 (주말 칸 너비 조정, 칸 안에 보이는 항목 수 조정용)
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 640); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // --- 로그인/인증 상태 ---
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    if (!authForm.username.trim() || !authForm.password) {
      setAuthError("아이디와 비밀번호를 입력해주세요.");
      return;
    }
    if (authMode === "signup" && !authForm.name.trim()) {
      setAuthError("이름을 입력해주세요.");
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, toAuthEmail(authForm.username), authForm.password);
        await updateProfile(cred.user, { displayName: authForm.name.trim() });
        setCurrentUser({ ...cred.user, displayName: authForm.name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, toAuthEmail(authForm.username), authForm.password);
      }
    } catch (err) {
      setAuthError(authErrorMessage(err.code));
    } finally {
      setAuthLoading(false);
    }
  }

  // 저장된 일정/할 일 불러오기 (로그인한 사용자별로 Firestore에서 불러옵니다)
  useEffect(() => {
    if (!currentUser) { setLoaded(false); return; }
    let cancelled = false;
    (async () => {
      const data = await loadUserData(currentUser.uid);
      if (cancelled) return;
      if (data) {
        if (Array.isArray(data.events)) setEvents(data.events);
        if (Array.isArray(data.todos)) setTodos(data.todos);
      } else {
        setEvents(seedEvents);
        setTodos(seedTodos);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // 일정/할 일이 바뀔 때마다 로그인한 사용자 문서에 저장 (불러오기가 끝난 뒤에만)
  useEffect(() => {
    if (!loaded || !currentUser) return;
    saveUserData(currentUser.uid, { events }).then(ok => setSaveError(!ok));
  }, [events, loaded, currentUser]);

  useEffect(() => {
    if (!loaded || !currentUser) return;
    saveUserData(currentUser.uid, { todos }).then(ok => setSaveError(!ok));
  }, [todos, loaded, currentUser]);

  // 완료하지 못한 채 날짜가 지난 할 일은 자동으로 오늘 날짜로 이월됩니다. (저장된 데이터를 불러온 뒤 1회 실행)
  useEffect(() => {
    if (!loaded) return;
    const t = todayStr();
    setTodos(prev => {
      const overdue = prev.some(td => !td.done && td.date < t);
      if (!overdue) return prev;
      return prev.map(td => (!td.done && td.date < t) ? { ...td, date: t } : td);
    });
  }, [loaded]);

  const fileInputRef = useRef(null);

  // 백업 파일(JSON)로 내보내기 — 저장 공간과 별개로 언제든 안전하게 보관할 수 있습니다.
  function exportData() {
    const payload = JSON.stringify({ events, todos, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendar-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 백업 파일에서 불러오기
  function triggerImport() {
    if (fileInputRef.current) fileInputRef.current.click();
  }
  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (Array.isArray(parsed.events)) setEvents(parsed.events);
        if (Array.isArray(parsed.todos)) setTodos(parsed.todos);
      } catch {
        alert("파일을 읽을 수 없습니다. 올바른 백업 파일인지 확인해주세요.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = `${viewYear}년 ${viewMonth + 1}월`;

  function changeMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  }
  function goToday() {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }
  function openFormForDate(dateStr) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setPreviewDate(null);
    setPreviewRect(null);
    setForm({ id: null, date: dateStr, endDate: dateStr, continuous: false, time: "09:00", title: "", type: "meeting", shared: true });
    setFormOpen(true);
  }
  function openEventForEdit(ev) {
    if (ev.ownerUid && currentUser && ev.ownerUid !== currentUser.uid) return; // 다른 팀원의 일정은 수정 불가
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setPreviewDate(null);
    setPreviewRect(null);
    const hasRange = !!ev.endDate && ev.endDate !== ev.date;
    setForm({ id: ev.id, date: ev.date, endDate: ev.endDate || ev.date, continuous: hasRange, time: ev.time, title: ev.title, type: ev.type, shared: ev.shared !== false });
    setFormOpen(true);
  }
  function submitEvent(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const finalEndDate = form.continuous && form.endDate && form.endDate >= form.date ? form.endDate : form.date;
    const payload = { id: form.id, date: form.date, endDate: finalEndDate, time: form.time, title: form.title, type: form.type, shared: form.shared };
    if (form.id) {
      setEvents(prev => prev.map(ev => ev.id === form.id ? payload : ev).sort((a, b) =>
        a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
      ));
    } else {
      setEvents(prev => [...prev, { ...payload, id: "e" + Date.now() }].sort((a, b) =>
        a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
      ));
    }
    setFormOpen(false);
  }
  function deleteEvent(id) {
    setEvents(prev => prev.filter(ev => ev.id !== id));
    setFormOpen(false);
  }
  function addTodo() {
    if (!newTodo.trim()) return;
    setTodos(prev => [...prev, { id: "t" + Date.now(), text: newTodo.trim(), done: false, date: newTodoDate, createdAt: todayStr() }]);
    setNewTodo("");
  }
  function toggleTodo(id) {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }
  function deleteTodo(id) {
    setTodos(prev => prev.filter(t => t.id !== id));
  }
  function startEditTodo(t) {
    setEditingTodoId(t.id);
    setEditingTodoText(t.text);
    setEditingTodoDate(t.date);
  }
  function cancelEditTodo() {
    setEditingTodoId(null);
  }
  function saveEditTodo() {
    if (!editingTodoText.trim()) { setEditingTodoId(null); return; }
    setTodos(prev => prev.map(t => t.id === editingTodoId ? { ...t, text: editingTodoText.trim(), date: editingTodoDate || t.date } : t));
    setEditingTodoId(null);
  }

  // 셀에 마우스를 올리면 살짝 지연 후 미리보기를 열고, 벗어나면 닫습니다.
  function handleCellEnter(e, dateStr, hasContent) {
    if (!hasContent) return;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewRect(rect);
    setPreviewDate(dateStr);
  }
  function handleCellLeave() {
    closeTimer.current = setTimeout(() => {
      setPreviewDate(null);
      setPreviewRect(null);
    }, 120);
  }
  // 날짜를 클릭하면 미리보기를 엽니다 (내용이 없어도 "일정 추가" 버튼을 쓸 수 있게 항상 엽니다).
  function handleCellClick(e, dateStr) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPreviewRect(rect);
    setPreviewDate(dateStr);
  }
  function handlePreviewEnter() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }
  function handlePreviewLeave() {
    setPreviewDate(null);
    setPreviewRect(null);
  }

  // --- 팀 공유 일정 ---
  // 내 캘린더(calendarData/{uid})는 내 전체 일정(공유+비공유)의 원본입니다.
  // shared !== false 인 일정만 sharedEvents 컬렉션에 미러링해서 다른 팀원이 볼 수 있게 합니다.
  const [teamSharedEvents, setTeamSharedEvents] = useState([]);
  const mirroredIdsRef = useRef(new Set());

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "sharedEvents"), (snap) => {
      setTeamSharedEvents(snap.docs.map(d => d.data()));
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    if (!loaded || !currentUser) return;
    const myName = currentUser.displayName || currentUser.email;
    const currentSharedIds = new Set(events.filter(ev => ev.shared !== false).map(ev => ev.id));
    const prevIds = mirroredIdsRef.current;

    for (const id of prevIds) {
      if (!currentSharedIds.has(id)) {
        deleteDoc(doc(db, "sharedEvents", `${currentUser.uid}_${id}`)).catch(() => {});
      }
    }
    for (const ev of events) {
      if (currentSharedIds.has(ev.id)) {
        setDoc(doc(db, "sharedEvents", `${currentUser.uid}_${ev.id}`), {
          ...ev,
          ownerUid: currentUser.uid,
          ownerName: myName,
        }).catch(() => {});
      }
    }
    mirroredIdsRef.current = currentSharedIds;
  }, [events, loaded, currentUser]);

  // 캘린더 표시용: 내 일정 전부 + 다른 팀원이 공유한 일정 (내 것 중복 제외)
  const combinedEvents = useMemo(() => {
    if (!currentUser) return events;
    const myName = currentUser.displayName || currentUser.email;
    const own = events.map(ev => ({ ...ev, ownerUid: currentUser.uid, ownerName: myName }));
    const others = teamSharedEvents.filter(ev => ev.ownerUid !== currentUser.uid);
    return [...own, ...others];
  }, [events, teamSharedEvents, currentUser]);

  const todayEvents = useMemo(() => {
    const t = todayStr();
    return combinedEvents.filter(ev => ev.date === t).sort((a, b) => a.time.localeCompare(b.time));
  }, [combinedEvents]);

  const upcomingGrouped = useMemo(() => {
    const t = todayStr();
    const future = combinedEvents.filter(ev => ev.date > t).sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
    );
    const groups = [];
    let currentKey = null;
    for (const ev of future) {
      const [y, m] = ev.date.split("-");
      const key = `${y}-${m}`;
      if (key !== currentKey) {
        groups.push({ key, year: y, month: parseInt(m, 10), events: [] });
        currentKey = key;
      }
      groups[groups.length - 1].events.push(ev);
    }
    return groups;
  }, [combinedEvents]);

  const multiDayEvents = useMemo(() => combinedEvents.filter(ev => ev.endDate && ev.endDate !== ev.date), [combinedEvents]);

  // 연속 일정을 주 단위로 잘라서, 캘린더 그리드 위에 이어지는 막대로 그릴 위치를 계산합니다.
  const barSegments = useMemo(() => {
    const segments = [];
    const weeksCount = grid.length / 7;
    for (let row = 0; row < weeksCount; row++) {
      for (const ev of multiDayEvents) {
        let segStartCol = -1, segEndCol = -1;
        for (let col = 0; col < 7; col++) {
          const day = grid[row * 7 + col];
          if (day == null) continue;
          const dateStr = fmtDate(viewYear, viewMonth, day);
          if (dateStr >= ev.date && dateStr <= ev.endDate) {
            if (segStartCol === -1) segStartCol = col;
            segEndCol = col;
          }
        }
        if (segStartCol !== -1) {
          segments.push({ key: `${ev.id}-${row}`, ev, row, segStartCol, segEndCol });
        }
      }
    }
    return segments;
  }, [grid, multiDayEvents, viewYear, viewMonth]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of combinedEvents) {
      if (ev.endDate && ev.endDate !== ev.date) continue; // 연속 일정은 별도 막대로 표시
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    for (const k in map) map[k].sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [combinedEvents]);

  // 특정 날짜에 표시할 전체 일정(단일일 + 그 날짜를 포함하는 연속 일정)
  function eventsOnDate(dateStr) {
    const single = eventsByDate[dateStr] || [];
    const multi = multiDayEvents.filter(ev => dateStr >= ev.date && dateStr <= ev.endDate);
    return [...multi, ...single];
  }

  // 일정 담당자를 한 음절 배지로 표시합니다.
  function renderBadge(ev, size = 13) {
    return (
      <span
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.6)}px`, fontWeight: 700, backgroundColor: styleFor(ev.type).dot, color: "#fff" }}
      >
        {badgeForName(ev.ownerName)}
      </span>
    );
  }

  const todosByDate = useMemo(() => {
    const map = {};
    for (const td of todos) {
      if (!map[td.date]) map[td.date] = [];
      map[td.date].push(td);
    }
    return map;
  }, [todos]);

  const todayTodos = useMemo(() => todos.filter(t => t.date === todayStr()), [todos]);
  const doneCount = todayTodos.filter(t => t.done).length;

  function shortDateLabel(dateStr) {
    const [, m, d] = dateStr.split("-");
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  }

  function dateWithWeekday(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
    return { md: `${m}/${d}`, wd };
  }

  // 미리보기 카드 위치 계산: 셀 아래쪽에 붙이되, 화면 오른쪽/아래쪽을 넘치면 반대쪽으로
  const previewStyle = useMemo(() => {
    if (!previewRect) return null;
    const cardWidth = 240;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
    let left = previewRect.left;
    if (left + cardWidth > viewportW - 12) left = viewportW - cardWidth - 12;
    if (left < 12) left = 12;
    const spaceBelow = viewportH - previewRect.bottom;
    const openUpward = spaceBelow < 180;
    return {
      position: "fixed",
      left,
      top: openUpward ? undefined : previewRect.bottom + 6,
      bottom: openUpward ? viewportH - previewRect.top + 6 : undefined,
      width: cardWidth,
      zIndex: 60,
    };
  }, [previewRect]);

  const previewEvents = previewDate ? eventsOnDate(previewDate) : [];
  const previewTodos = previewDate ? (todosByDate[previewDate] || []) : [];

  if (!authChecked) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: BG, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        <p className="text-sm text-gray-400">확인하는 중...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        form={authForm}
        setForm={setAuthForm}
        onSubmit={handleAuthSubmit}
        error={authError}
        loading={authLoading}
      />
    );
  }

  if (!loaded) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: BG, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        <p className="text-sm text-gray-400">저장된 일정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen" style={{ backgroundColor: BG, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>

      <div className="mx-auto px-3 sm:px-6 py-5 sm:py-8" style={{ maxWidth: "1680px" }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
          <div>
            <h1 className="text-base font-semibold" style={{ color: "#111827" }}>마케팅부 일정관리</h1>
            <p className="text-xs mt-1 text-gray-500">
              {currentUser.displayName || currentUser.email} 님 · 회의, 중요 일정, 할 일을 한 곳에서 관리하세요
            </p>
            {saveError && (
              <p className="text-xs mt-1" style={{ color: "#EF4444" }}>저장에 실패했습니다. 방금 한 변경사항이 유지되지 않을 수 있어요.</p>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end sm:flex-nowrap">
            <button
              onClick={() => signOut(auth)}
              title="로그아웃"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <LogOut size={14} /> <span className="hidden sm:inline">로그아웃</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={triggerImport}
              title="백업 파일에서 불러오기"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <Upload size={14} /> <span className="hidden sm:inline">가져오기</span>
            </button>
            <button
              onClick={exportData}
              title="현재 일정/할 일을 파일로 저장"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
            >
              <Download size={14} /> <span className="hidden sm:inline">내보내기</span>
            </button>
            <button
              onClick={() => openFormForDate(todayStr())}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 flex-1 sm:flex-none whitespace-nowrap"
              style={{ backgroundColor: ACCENT }}
            >
              <Plus size={16} /> 일정 추가
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
          {/* Calendar */}
          <div className="md:col-span-3 rounded-xl p-3 sm:p-5" style={{ backgroundColor: SURFACE, border: "1px solid #D6DAE3" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: ACCENT_SOFT }}>
                <CalendarDays size={16} style={{ color: ACCENT }} />
                <span className="text-sm font-semibold" style={{ color: ACCENT }}>{monthLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100">
                  오늘
                </button>
                <button onClick={() => changeMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1" style={{ gridTemplateColumns: isMobile ? "1fr 2fr 2fr 2fr 2fr 2fr 1fr" : undefined }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-center text-xs font-medium py-1"
                  style={{ color: i === 0 ? "#EF4444" : i === 6 ? ACCENT : "#6B7280" }}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" style={{ position: "relative", gridTemplateColumns: isMobile ? "1fr 2fr 2fr 2fr 2fr 2fr 1fr" : undefined }}>
              {grid.map((day, idx) => {
                const col = idx % 7;
                const row = Math.floor(idx / 7);
                if (day === null) return <div key={idx} className="min-h-24 sm:min-h-28 lg:min-h-36 rounded-lg" style={{ gridColumn: col + 1, gridRow: row + 1, backgroundColor: col === 6 ? "#F7F9FD" : "transparent" }} />;
                const dateStr = fmtDate(viewYear, viewMonth, day);
                const isToday = dateStr === todayStr();
                const dayEvents = eventsByDate[dateStr] || [];
                const dayTodos = todosByDate[dateStr] || [];
                const coveredByMultiDay = multiDayEvents.some(ev => dateStr >= ev.date && dateStr <= ev.endDate);
                const hasContent = eventsOnDate(dateStr).length > 0 || dayTodos.length > 0;
                const maxShown = isMobile ? 2 : 4;
                const shownEvents = dayEvents.slice(0, isMobile ? 1 : 3);
                const todoSlots = Math.max(0, maxShown - shownEvents.length);
                const shownTodos = dayTodos.slice(0, todoSlots);
                const extra = (dayEvents.length - shownEvents.length) + (dayTodos.length - shownTodos.length);
                const weekday = idx % 7;
                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleCellClick(e, dateStr)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCellClick(e, dateStr); }}
                    onMouseEnter={(e) => handleCellEnter(e, dateStr, hasContent)}
                    onMouseLeave={handleCellLeave}
                    className="min-h-24 sm:min-h-28 lg:min-h-36 rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-1 border border-transparent hover:border-gray-200 hover:-translate-y-0.5 hover:shadow-sm transition-all cursor-pointer"
                    style={{ backgroundColor: isToday ? SURFACE_ALT : weekday === 6 ? "#F7F9FD" : "transparent", gridColumn: col + 1, gridRow: row + 1 }}
                  >
                    <span
                      className="text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                      style={{
                        color: isToday ? "#FFFFFF" : weekday === 0 ? "#EF4444" : weekday === 6 ? ACCENT : "#111827",
                        backgroundColor: isToday ? ACCENT : "transparent",
                        boxShadow: isToday ? "0 0 0 3px rgba(79,115,245,0.18)" : "none",
                      }}
                    >
                      {day}
                    </span>
                    <div className="flex flex-col gap-0.5" style={{ marginTop: coveredByMultiDay ? "20px" : undefined }}>
                      {shownEvents.map(ev => (
                        <button
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); openEventForEdit(ev); }}
                          className="text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 w-full text-left"
                          style={{
                            backgroundColor: styleFor(ev.type).soft,
                            color: styleFor(ev.type).text,
                          }}
                        >
                          {renderBadge(ev)}
                          <span className="opacity-70">{ev.time}</span>
                          <span className="truncate">{ev.title}</span>
                        </button>
                      ))}
                      {shownTodos.map(td => (
                        <button
                          key={td.id}
                          onClick={(e) => { e.stopPropagation(); toggleTodo(td.id); }}
                          className="text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1 w-full text-left"
                          style={{ backgroundColor: TODO_SOFT, color: td.done ? "#9CA3AF" : TODO_TEXT }}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm border flex items-center justify-center flex-shrink-0"
                            style={{ borderColor: "#9CA3AF", backgroundColor: td.done ? "#9CA3AF" : "transparent" }}
                          >
                            {td.done && <Check size={8} color="#FFFFFF" strokeWidth={3} />}
                          </span>
                          <span className={`truncate ${td.done ? "line-through" : ""}`}>{td.text}</span>
                        </button>
                      ))}
                      {extra > 0 && (
                        <span className="text-xs text-gray-400 px-1.5">+{extra}개 더</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {barSegments.map(seg => (
                <button
                  key={seg.key}
                  onClick={(e) => { e.stopPropagation(); openEventForEdit(seg.ev); }}
                  className="text-xs rounded truncate flex items-center gap-1 text-left px-1.5"
                  style={{
                    gridColumnStart: seg.segStartCol + 1,
                    gridColumnEnd: seg.segEndCol + 2,
                    gridRowStart: seg.row + 1,
                    alignSelf: "start",
                    justifySelf: "stretch",
                    marginTop: "22px",
                    height: "18px",
                    zIndex: 5,
                    backgroundColor: styleFor(seg.ev.type).soft,
                    color: styleFor(seg.ev.type).text,
                  }}
                >
                  {renderBadge(seg.ev)}
                  <span className="opacity-70">{seg.ev.time}</span>
                  <span className="truncate">{seg.ev.title}</span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, grid.length / 7 - 1) }).map((_, row) => (
                <div
                  key={`week-divider-${row}`}
                  style={{
                    gridColumnStart: 1,
                    gridColumnEnd: 8,
                    gridRowStart: row + 1,
                    alignSelf: "end",
                    height: "1px",
                    backgroundColor: "#EEF0F4",
                    pointerEvents: "none",
                  }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-4" style={{ borderTop: "1px solid #F1F2F6" }}>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ACCENT }} /> 회의
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: IMPORTANT }} /> 중요 일정
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TRIP }} /> 출장
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: VACATION }} /> 휴가
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#9CA3AF" }} /> 할 일
              </div>
              <div className="text-xs text-gray-300 sm:ml-auto hidden sm:block">날짜에 마우스를 올리면 전체 일정을 미리볼 수 있어요</div>
            </div>
          </div>

          {/* Right column: Today's events, Today's todos, Upcoming */}
          <div className="md:col-span-1 xl:col-span-2 grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="rounded-xl p-4 sm:p-5" style={{ backgroundColor: SURFACE, border: "1px solid #D6DAE3" }}>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={16} style={{ color: ACCENT }} />
                <span className="text-sm font-semibold" style={{ color: "#111827" }}>오늘 일정</span>
              </div>
              {todayEvents.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">오늘 등록된 일정이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {todayEvents.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between gap-2 group rounded-lg p-2" style={{ border: "1px solid #EEF0F4" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {renderBadge(ev, 14)}
                        {React.createElement(styleFor(ev.type).icon, { size: 14, style: { color: styleFor(ev.type).dot, flexShrink: 0 } })}
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "#111827" }}>{ev.title}</p>
                          <p className="text-xs text-gray-400">
                            {ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate} · ${ev.time}` : ev.time}
                          </p>
                        </div>
                      </div>
                      {(!ev.ownerUid || ev.ownerUid === currentUser.uid) && (
                        <>
                          <button onClick={() => openEventForEdit(ev)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteEvent(ev.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl p-4 sm:p-5" style={{ backgroundColor: SURFACE, border: "1px solid #D6DAE3" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListTodo size={16} style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold" style={{ color: "#111827" }}>오늘 할 일</span>
                </div>
                {todayTodos.length > 0 && (
                  <span className="text-xs text-gray-400">{doneCount}/{todayTodos.length} 완료</span>
                )}
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
                  placeholder="할 일 입력 후 Enter"
                  className="flex-1 text-xs px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                  style={{ backgroundColor: SIDEBAR_BG }}
                />
                <button onClick={addTodo} className="px-2.5 rounded-lg text-white flex items-center justify-center" style={{ backgroundColor: ACCENT }}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                <button
                  onClick={() => setNewTodoDate(todayStr())}
                  className="text-xs font-medium px-2 py-1 rounded-lg border flex-shrink-0"
                  style={{
                    borderColor: newTodoDate === todayStr() ? ACCENT : "#E5E7EB",
                    backgroundColor: newTodoDate === todayStr() ? ACCENT_SOFT : "transparent",
                    color: newTodoDate === todayStr() ? ACCENT : "#6B7280",
                  }}
                >
                  오늘
                </button>
                <button
                  onClick={() => setNewTodoDate(addDays(todayStr(), 1))}
                  className="text-xs font-medium px-2 py-1 rounded-lg border flex-shrink-0"
                  style={{
                    borderColor: newTodoDate === addDays(todayStr(), 1) ? ACCENT : "#E5E7EB",
                    backgroundColor: newTodoDate === addDays(todayStr(), 1) ? ACCENT_SOFT : "transparent",
                    color: newTodoDate === addDays(todayStr(), 1) ? ACCENT : "#6B7280",
                  }}
                >
                  내일
                </button>
                <input
                  type="date"
                  value={newTodoDate}
                  onChange={(e) => setNewTodoDate(e.target.value)}
                  className="text-xs px-1.5 py-1 rounded-lg outline-none border border-gray-200 flex-1 min-w-0"
                  style={{ backgroundColor: SIDEBAR_BG }}
                />
              </div>
              {newTodoDate !== todayStr() && (
                <p className="text-xs mb-3" style={{ color: ACCENT }}>
                  {(() => { const [, m, d] = newTodoDate.split("-"); return `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`; })()} 할 일로 추가돼요 (캘린더에서 확인 가능)
                </p>
              )}
              {todayTodos.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">오늘 할 일이 없습니다. 완료하지 못한 할 일은 다음날로 자동 이월됩니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {todayTodos.map(t => (
                    <div key={t.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-gray-50" style={{ border: "1px solid #EEF0F4" }}>
                      {editingTodoId === t.id ? (
                        <>
                          <input
                            autoFocus
                            value={editingTodoText}
                            onChange={(e) => setEditingTodoText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditTodo();
                              if (e.key === "Escape") cancelEditTodo();
                            }}
                            className="flex-1 text-xs px-2 py-1 rounded-lg outline-none border"
                            style={{ backgroundColor: SIDEBAR_BG, borderColor: ACCENT }}
                          />
                          <input
                            type="date"
                            value={editingTodoDate}
                            onChange={(e) => setEditingTodoDate(e.target.value)}
                            className="text-xs px-1.5 py-1 rounded-lg outline-none border border-gray-200 flex-shrink-0"
                            style={{ backgroundColor: SIDEBAR_BG, width: "8.5rem" }}
                          />
                          <button onClick={saveEditTodo} className="flex-shrink-0" style={{ color: ACCENT }}>
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEditTodo} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleTodo(t.id)}
                            className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                            style={{ borderColor: t.done ? ACCENT : "#D1D5DB", backgroundColor: t.done ? ACCENT : "transparent" }}
                          >
                            {t.done && <span className="text-white text-xs leading-none">✓</span>}
                          </button>
                          <span className={`text-xs flex-1 ${t.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                            {t.text}
                            {t.createdAt && (
                              <span className="text-gray-300 ml-1.5">{shortDateLabel(t.createdAt)}</span>
                            )}
                          </span>
                          <button onClick={() => startEditTodo(t)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => deleteTodo(t.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

            <div className="rounded-xl p-4 sm:p-5 flex-1" style={{ backgroundColor: SURFACE, border: "1px solid #D6DAE3" }}>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} style={{ color: ACCENT }} />
                <span className="text-sm font-semibold" style={{ color: "#111827" }}>다가오는 일정</span>
              </div>
              {upcomingGrouped.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">예정된 일정이 없습니다. 캘린더에서 날짜를 눌러 추가하세요.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcomingGrouped.map((group, gi) => (
                    <div key={group.key}>
                      <div
                        className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1.5"
                        style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                      >
                        {gi > 0 && group.year !== upcomingGrouped[0].year ? `${group.year}년 ${group.month}월` : `${group.month}월`}
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.events.map(ev => (
                          <div key={ev.id} className="flex items-center justify-between gap-2 group rounded-lg p-2" style={{ border: "1px solid #EEF0F4" }}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex flex-col items-center justify-center flex-shrink-0" style={{ width: "2.75rem" }}>
                                <span className="text-sm font-bold leading-tight" style={{ color: ACCENT }}>
                                  {dateWithWeekday(ev.date).md}
                                </span>
                                <span className="text-xs text-gray-400 leading-tight">
                                  ({dateWithWeekday(ev.date).wd})
                                </span>
                              </div>
                              {renderBadge(ev, 14)}
                              {React.createElement(styleFor(ev.type).icon, { size: 14, style: { color: styleFor(ev.type).dot, flexShrink: 0 } })}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "#111827" }}>{ev.title}</p>
                                <p className="text-xs text-gray-400">
                                  {ev.endDate && ev.endDate !== ev.date ? `~ ${shortDateLabel(ev.endDate)} · ${ev.time}` : ev.time}
                                </p>
                              </div>
                            </div>
                            {(!ev.ownerUid || ev.ownerUid === currentUser.uid) && (
                              <>
                                <button onClick={() => openEventForEdit(ev)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => deleteEvent(ev.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hover preview card: 날짜 셀에 마우스를 올리면 해당 날짜의 전체 일정/할 일 목록 */}
      {previewDate && previewStyle && !formOpen && (
        <div
          style={previewStyle}
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
        >
          <div
            className="rounded-xl p-3.5"
            style={{
              backgroundColor: SURFACE,
              border: "1px solid #E5E7EB",
              boxShadow: "0 12px 28px rgba(17,24,39,0.14)",
            }}
          >
            <div className="flex items-center justify-between mb-2.5 gap-2">
              <span className="text-xs font-semibold" style={{ color: "#111827" }}>
                {previewDate.slice(5).replace("-", "월 ")}일
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {previewDate === todayStr() && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>오늘</span>
                )}
                <button
                  onClick={() => openFormForDate(previewDate)}
                  className="flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-lg text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Plus size={11} /> 일정 추가
                </button>
              </div>
            </div>

            {previewEvents.length === 0 && previewTodos.length === 0 ? (
              <p className="text-xs text-gray-400">등록된 일정이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {previewEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => openEventForEdit(ev)}
                    className="flex items-start gap-2 w-full text-left hover:bg-gray-50 rounded-md p-0.5 -m-0.5"
                  >
                    {renderBadge(ev, 14)}
                    {React.createElement(styleFor(ev.type).icon, { size: 12, style: { color: styleFor(ev.type).dot, marginTop: 2, flexShrink: 0 } })}
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: "#111827" }}>{ev.title}</p>
                      <p className="text-xs text-gray-400">
                        {ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate} · ${ev.time}` : ev.time}
                      </p>
                    </div>
                  </button>
                ))}
                {previewTodos.length > 0 && previewEvents.length > 0 && (
                  <div style={{ borderTop: "1px solid #F1F2F6", margin: "2px 0" }} />
                )}
                {previewTodos.map(td => (
                  <button
                    key={td.id}
                    onClick={(e) => { e.stopPropagation(); toggleTodo(td.id); }}
                    className="flex items-start gap-2 w-full text-left hover:bg-gray-50 rounded-md p-0.5 -m-0.5"
                  >
                    <span
                      className="w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0"
                      style={{ marginTop: 2, borderColor: "#9CA3AF", backgroundColor: td.done ? "#9CA3AF" : "transparent" }}
                    >
                      {td.done && <Check size={8} color="#FFFFFF" strokeWidth={3} />}
                    </span>
                    <p className={`text-xs ${td.done ? "line-through text-gray-400" : "text-gray-700"}`}>{td.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add event modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(17,24,39,0.35)" }}>
          <div className="w-full max-w-sm rounded-xl p-5" style={{ backgroundColor: SURFACE }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold" style={{ color: "#111827" }}>{form.id ? "일정 수정" : "일정 추가"}</span>
              <button type="button" onClick={() => setFormOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <label className="text-xs font-medium text-gray-500 block mb-1">제목</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") submitEvent(e); }}
              placeholder="예: 유통영업팀 회의"
              className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300 mb-3"
              style={{ backgroundColor: SIDEBAR_BG }}
            />

            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="continuous-checkbox"
                checked={form.continuous}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm(f => ({
                    ...f,
                    continuous: checked,
                    endDate: checked ? (f.endDate && f.endDate >= f.date ? f.endDate : f.date) : f.date,
                  }));
                }}
                className="w-4 h-4 rounded"
                style={{ accentColor: ACCENT }}
              />
              <label htmlFor="continuous-checkbox" className="text-xs font-medium text-gray-600">연속 (여러 날에 걸친 일정)</label>
            </div>

            {!form.continuous ? (
              <div className="flex gap-3 mb-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500 block mb-1">날짜</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value, endDate: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                    style={{ backgroundColor: SIDEBAR_BG }}
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs font-medium text-gray-500 block mb-1">시간</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                    style={{ backgroundColor: SIDEBAR_BG }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-500 block mb-1">시작일</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm(f => ({
                        ...f,
                        date: e.target.value,
                        endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value,
                      }))}
                      className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                      style={{ backgroundColor: SIDEBAR_BG }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-500 block mb-1">종료일</label>
                    <input
                      type="date"
                      value={form.endDate}
                      min={form.date}
                      onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
                      className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                      style={{ backgroundColor: SIDEBAR_BG }}
                    />
                  </div>
                </div>
                <div className="w-28 mb-3">
                  <label className="text-xs font-medium text-gray-500 block mb-1">시간</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none border border-gray-200 focus:border-gray-300"
                    style={{ backgroundColor: SIDEBAR_BG }}
                  />
                </div>
              </>
            )}

            <label className="text-xs font-medium text-gray-500 block mb-1.5">유형</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.entries(TYPE_STYLES).map(([key, s]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: key }))}
                  className="text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 border"
                  style={{
                    borderColor: form.type === key ? s.dot : "#E5E7EB",
                    backgroundColor: form.type === key ? s.soft : "transparent",
                    color: form.type === key ? s.text : "#6B7280",
                  }}
                >
                  {React.createElement(s.icon, { size: 13 })} {s.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.shared}
                onChange={(e) => setForm(f => ({ ...f, shared: e.target.checked }))}
                className="w-4 h-4 rounded"
                style={{ accentColor: ACCENT }}
              />
              <span className="text-xs font-medium text-gray-600">
                팀에 공유 (체크 해제하면 나에게만 보여요)
              </span>
            </label>

            <button
              type="button"
              onClick={submitEvent}
              disabled={!form.title.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT }}
            >
              {form.id ? "수정 완료" : "저장"}
            </button>
            {form.id && (
              <button
                type="button"
                onClick={() => deleteEvent(form.id)}
                className="w-full py-2.5 rounded-lg text-sm font-medium mt-2 flex items-center justify-center gap-1.5"
                style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.08)" }}
              >
                <Trash2 size={14} /> 일정 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
