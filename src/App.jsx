import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X, CalendarDays, ListTodo, Users, Star, Check, Pencil, Download, Upload, Plane, Palmtree } from "lucide-react";

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

export default function CalendarTodoApp() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [events, setEvents] = useState(seedEvents);
  const [todos, setTodos] = useState(seedTodos);
  const [newTodo, setNewTodo] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ id: null, date: todayStr(), endDate: todayStr(), continuous: false, time: "09:00", title: "", type: "meeting" });

  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState("");
  const [editingTodoDate, setEditingTodoDate] = useState("");

  // 미리보기 카드: 어떤 날짜 위에 마우스가 있는지 + 그 셀의 화면 위치
  const [previewDate, setPreviewDate] = useState(null);
  const [previewRect, setPreviewRect] = useState(null);
  const closeTimer = useRef(null);

  // 저장된 일정/할 일 불러오기 (앱을 다시 열어도 안전하게 유지)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [evRes, tdRes] = await Promise.all([
          window.storage.get("calendar-events", false).catch(() => null),
          window.storage.get("calendar-todos", false).catch(() => null),
        ]);
        if (cancelled) return;
        if (evRes && evRes.value) {
          try { setEvents(JSON.parse(evRes.value)); } catch { /* 저장된 값 손상 시 기본값 유지 */ }
        }
        if (tdRes && tdRes.value) {
          try { setTodos(JSON.parse(tdRes.value)); } catch { /* 저장된 값 손상 시 기본값 유지 */ }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 일정이 바뀔 때마다 저장 (불러오기가 끝난 뒤에만 — 그 전에 저장하면 불러온 데이터를 덮어씁니다)
  useEffect(() => {
    if (!loaded) return;
    window.storage.set("calendar-events", JSON.stringify(events), false)
      .then(res => setSaveError(!res))
      .catch(() => setSaveError(true));
  }, [events, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set("calendar-todos", JSON.stringify(todos), false)
      .then(res => setSaveError(!res))
      .catch(() => setSaveError(true));
  }, [todos, loaded]);

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
    setForm({ id: null, date: dateStr, endDate: dateStr, continuous: false, time: "09:00", title: "", type: "meeting" });
    setFormOpen(true);
  }
  function openEventForEdit(ev) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setPreviewDate(null);
    setPreviewRect(null);
    const hasRange = !!ev.endDate && ev.endDate !== ev.date;
    setForm({ id: ev.id, date: ev.date, endDate: ev.endDate || ev.date, continuous: hasRange, time: ev.time, title: ev.title, type: ev.type });
    setFormOpen(true);
  }
  function submitEvent(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const finalEndDate = form.continuous && form.endDate && form.endDate >= form.date ? form.endDate : form.date;
    const payload = { id: form.id, date: form.date, endDate: finalEndDate, time: form.time, title: form.title, type: form.type };
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
    setTodos(prev => [...prev, { id: "t" + Date.now(), text: newTodo.trim(), done: false, date: todayStr() }]);
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
  function handlePreviewEnter() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }
  function handlePreviewLeave() {
    setPreviewDate(null);
    setPreviewRect(null);
  }

  const todayEvents = useMemo(() => {
    const t = todayStr();
    return events.filter(ev => ev.date === t).sort((a, b) => a.time.localeCompare(b.time));
  }, [events]);

  const upcomingGrouped = useMemo(() => {
    const t = todayStr();
    const future = events.filter(ev => ev.date > t).sort((a, b) =>
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
  }, [events]);

  const multiDayEvents = useMemo(() => events.filter(ev => ev.endDate && ev.endDate !== ev.date), [events]);

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
    for (const ev of events) {
      if (ev.endDate && ev.endDate !== ev.date) continue; // 연속 일정은 별도 막대로 표시
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    for (const k in map) map[k].sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [events]);

  // 특정 날짜에 표시할 전체 일정(단일일 + 그 날짜를 포함하는 연속 일정)
  function eventsOnDate(dateStr) {
    const single = eventsByDate[dateStr] || [];
    const multi = multiDayEvents.filter(ev => dateStr >= ev.date && dateStr <= ev.endDate);
    return [...multi, ...single];
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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 sm:mb-6">
          <div>
            <h1 className="text-base font-semibold" style={{ color: "#111827" }}>일정 관리</h1>
            <p className="text-xs mt-1 text-gray-500">회의, 중요 일정, 할 일을 한 곳에서 관리하세요</p>
            {saveError && (
              <p className="text-xs mt-1" style={{ color: "#EF4444" }}>저장에 실패했습니다. 방금 한 변경사항이 유지되지 않을 수 있어요.</p>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
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
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Upload size={14} /> 가져오기
            </button>
            <button
              onClick={exportData}
              title="현재 일정/할 일을 파일로 저장"
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Download size={14} /> 내보내기
            </button>
            <button
              onClick={() => openFormForDate(todayStr())}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 flex-1 sm:flex-none"
              style={{ backgroundColor: ACCENT }}
            >
              <Plus size={16} /> 일정 추가
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 sm:gap-6">
          {/* Calendar */}
          <div className="col-span-3 rounded-xl p-3 sm:p-5" style={{ backgroundColor: SURFACE }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <CalendarDays size={18} style={{ color: ACCENT }} />
                <span className="text-sm font-semibold" style={{ color: "#111827" }}>{monthLabel}</span>
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

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className="text-center text-xs font-medium py-1"
                  style={{ color: i === 0 ? "#EF4444" : i === 6 ? ACCENT : "#6B7280" }}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" style={{ position: "relative" }}>
              {grid.map((day, idx) => {
                const col = idx % 7;
                const row = Math.floor(idx / 7);
                if (day === null) return <div key={idx} className="min-h-24 sm:min-h-28 lg:min-h-36 rounded-lg" style={{ gridColumn: col + 1, gridRow: row + 1 }} />;
                const dateStr = fmtDate(viewYear, viewMonth, day);
                const isToday = dateStr === todayStr();
                const dayEvents = eventsByDate[dateStr] || [];
                const dayTodos = todosByDate[dateStr] || [];
                const coveredByMultiDay = multiDayEvents.some(ev => dateStr >= ev.date && dateStr <= ev.endDate);
                const hasContent = eventsOnDate(dateStr).length > 0 || dayTodos.length > 0;
                const shownEvents = dayEvents.slice(0, 3);
                const todoSlots = Math.max(0, 4 - shownEvents.length);
                const shownTodos = dayTodos.slice(0, todoSlots);
                const extra = (dayEvents.length - shownEvents.length) + (dayTodos.length - shownTodos.length);
                const weekday = idx % 7;
                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFormForDate(dateStr)}
                    onKeyDown={(e) => { if (e.key === "Enter") openFormForDate(dateStr); }}
                    onMouseEnter={(e) => handleCellEnter(e, dateStr, hasContent)}
                    onMouseLeave={handleCellLeave}
                    className="min-h-24 sm:min-h-28 lg:min-h-36 rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-1 border border-transparent hover:border-gray-200 transition-colors cursor-pointer"
                    style={{ backgroundColor: isToday ? SURFACE_ALT : "transparent", gridColumn: col + 1, gridRow: row + 1 }}
                  >
                    <span
                      className="text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full"
                      style={{
                        color: isToday ? "#FFFFFF" : weekday === 0 ? "#EF4444" : weekday === 6 ? ACCENT : "#111827",
                        backgroundColor: isToday ? ACCENT : "transparent",
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
                  <span className="opacity-70">{seg.ev.time}</span>
                  <span className="truncate">{seg.ev.title}</span>
                </button>
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
          <div className="col-span-1 flex flex-col gap-4 sm:gap-6">
            <div className="rounded-xl p-4 sm:p-5" style={{ backgroundColor: SURFACE }}>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={16} style={{ color: ACCENT }} />
                <span className="text-sm font-semibold" style={{ color: "#111827" }}>오늘 일정</span>
              </div>
              {todayEvents.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">오늘 등록된 일정이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {todayEvents.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between gap-2 group">
                      <div className="flex items-center gap-2 min-w-0">
                        {React.createElement(styleFor(ev.type).icon, { size: 14, style: { color: styleFor(ev.type).dot, flexShrink: 0 } })}
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "#111827" }}>{ev.title}</p>
                          <p className="text-xs text-gray-400">
                            {ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate} · ${ev.time}` : ev.time}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => openEventForEdit(ev)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteEvent(ev.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl p-4 sm:p-5" style={{ backgroundColor: SURFACE }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListTodo size={16} style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold" style={{ color: "#111827" }}>오늘 할 일</span>
                </div>
                {todayTodos.length > 0 && (
                  <span className="text-xs text-gray-400">{doneCount}/{todayTodos.length} 완료</span>
                )}
              </div>
              <div className="flex gap-2 mb-3">
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
              {todayTodos.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">오늘 할 일이 없습니다. 완료하지 못한 할 일은 다음날로 자동 이월됩니다.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {todayTodos.map(t => (
                    <div key={t.id} className="flex items-center gap-2 group px-1 py-1 rounded-lg hover:bg-gray-50">
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

            <div className="rounded-xl p-4 sm:p-5 flex-1" style={{ backgroundColor: SURFACE }}>
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
                      <div className="text-xs font-semibold text-gray-400 mb-1.5">
                        {gi > 0 && group.year !== upcomingGrouped[0].year ? `${group.year}년 ${group.month}월` : `${group.month}월`}
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.events.map(ev => (
                          <div key={ev.id} className="flex items-center justify-between gap-2 group">
                            <div className="flex items-center gap-2 min-w-0">
                              {React.createElement(styleFor(ev.type).icon, { size: 14, style: { color: styleFor(ev.type).dot, flexShrink: 0 } })}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: "#111827" }}>{ev.title}</p>
                                <p className="text-xs text-gray-400">
                                  {ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate} · ${ev.time}` : `${ev.date} · ${ev.time}`}
                                </p>
                              </div>
                            </div>
                            <button onClick={() => openEventForEdit(ev)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteEvent(ev.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0">
                              <Trash2 size={13} />
                            </button>
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
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold" style={{ color: "#111827" }}>
                {previewDate.slice(5).replace("-", "월 ")}일
              </span>
              {previewDate === todayStr() && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}>오늘</span>
              )}
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
                  <div key={td.id} className="flex items-start gap-2">
                    <span
                      className="w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0"
                      style={{ marginTop: 2, borderColor: "#9CA3AF", backgroundColor: td.done ? "#9CA3AF" : "transparent" }}
                    >
                      {td.done && <Check size={8} color="#FFFFFF" strokeWidth={3} />}
                    </span>
                    <p className={`text-xs ${td.done ? "line-through text-gray-400" : "text-gray-700"}`}>{td.text}</p>
                  </div>
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
            <div className="grid grid-cols-2 gap-2 mb-5">
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
