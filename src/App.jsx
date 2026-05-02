import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { supabase } from "./lib/supabase";
import { db } from "./lib/offlineDb";
import useExamSecurity from "./hooks/useExamSecurity";
import { ThemeContext } from "./context/ThemeContext";
import * as XLSX from "xlsx";

// ─── STORAGE HELPERS (Supabase Integration) ──────────────────────────────────
const TABLES = {
  studentLogs: "student_logs",
  quizResults: "quiz_results",
  typingResults: "typing_results",
  codeResults: "code_results",
  questions: "questions",
  typingTexts: "typing_texts",
  buggyCode: "buggy_codes",
  teachers: "teachers",
  quizSettings: "quiz_settings",
};

async function supabaseGet(table) {
  try {
    // Try to get from local Dexie first
    const localData = await db.table(table).toArray();
    
    // If we are online, try to refresh from Supabase
    if (navigator.onLine) {
      const { data, error } = await supabase.from(table).select("*");
      if (!error && data) {
        // Sync remote to local (overwrite configuration tables, merge results)
        await db.table(table).clear();
        await db.table(table).bulkAdd(data.map(item => ({ ...item, synced: 1 })));
        return data;
      }
    }
    return localData;
  } catch (err) {
    console.error(`Error in supabaseGet for ${table}:`, err);
    return null;
  }
}

async function supabaseInsert(table, row) {
  try {
    const isOnline = navigator.onLine;
    const localRow = { ...row, synced: isOnline ? 1 : 0 };
    const id = await db.table(table).add(localRow);
    
    if (isOnline) {
      const { data, error } = await supabase.from(table).insert([row]).select();
      if (error) {
        // If supabase failed but we're "online", mark as unsynced
        await db.table(table).update(id, { synced: 0 });
      } else {
        return data;
      }
    }
    return [{ ...localRow, id }];
  } catch (err) {
    console.error(`Error in supabaseInsert for ${table}:`, err);
    return null;
  }
}

async function supabaseUpdate(table, id, row) {
  try {
    const isOnline = navigator.onLine;
    await db.table(table).update(id, { ...row, synced: isOnline ? 1 : 0 });
    
    if (isOnline) {
      const { data, error } = await supabase.from(table).update(row).eq("id", id).select();
      return data;
    }
  } catch (err) {
    console.error(`Error in supabaseUpdate for ${table}:`, err);
  }
}

async function supabaseDelete(table, id) {
  try {
    await db.table(table).delete(id);
    if (navigator.onLine) {
      await supabase.from(table).delete().eq("id", id);
    }
  } catch (err) {
    console.error(`Error in supabaseDelete for ${table}:`, err);
  }
}

// ─── LEGACY STORAGE HELPERS (for backward compatibility if needed) ──────────────
const STORAGE_KEYS = {
  studentLogs: "itquiz_student_logs",
  quizResults: "itquiz_quiz_results",
  typingResults: "itquiz_typing_results",
  codeResults: "itquiz_code_results",
  questions: "itquiz_questions",
  typingTexts: "itquiz_typing_texts",
  buggyCode: "itquiz_buggy_codes",
  teachers: "itquiz_teachers",
  activeTeacher: "itquiz_active_teacher",
};

function storageGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
function storageSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

async function logStudentLogin(user) {
  const row = { 
    name: user.name, 
    email: user.email, 
    // Save testType inside department field using a delimiter for immediate tracking
    department: `${user.department} :::${user.testType}`,
    login_time: new Date().toISOString() 
  };
  const data = await supabaseInsert(TABLES.studentLogs, row);
  return data ? data[0].id : null;
}

async function logStudentLogout(logId) {
  if (!logId) return;
  await supabaseUpdate(TABLES.studentLogs, logId, { logout_time: new Date().toISOString() });
}

async function saveResult(type, data) {
  const table = type === "quiz" ? TABLES.quizResults : type === "typing" ? TABLES.typingResults : TABLES.codeResults;
  const student_data = { name: data.name, email: data.email, department: data.department };
  
  const row = {
    student_data,
    level: data.level,
    timestamp: new Date().toISOString()
  };

  if (type === "quiz") {
    row.score = data.score;
    row.total = data.totalQuestions;
    row.percentage = data.percentage;
    row.answers = data.answers || [];
  } else if (type === "typing") {
    row.wpm = data.wpm;
    row.accuracy = data.accuracy || data.percentage;
    row.time_used = data.timeUsed;
  } else if (type === "code") {
    row.score = data.percentage;
  }

  await supabaseInsert(table, row);
}


// ─── HELPERS ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function formatTime(s) { return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`; }
function calcGrade(pct) {
  if (pct >= 90) return { grade: "A", color: "#22c55e", label: "Excellent! 🏆" };
  if (pct >= 80) return { grade: "B", color: "#3b82f6", label: "Great Job! 🌟" };
  if (pct >= 70) return { grade: "C", color: "#f59e0b", label: "Good Work! 👍" };
  if (pct >= 60) return { grade: "D", color: "#f97316", label: "Keep Going! 💪" };
  if (pct >= 50) return { grade: "E", color: "#8b5cf6", label: "Could Be Better! 📖" };
  return { grade: "F", color: "#ef4444", label: "Try Again! 📚" };
}
// ─── PROFESSIONAL EXCEL EXPORT ───────────────────────────────────────────────
function exportToExcel({ studentLogs, quizResults, typingResults, codeResults }) {
  const wb = XLSX.utils.book_new();
  const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-GB") : "—";
  const gradeLabel = (g) => ({ A: "Excellent", B: "Very Good", C: "Good", D: "Pass", F: "Fail" }[g] || g || "—");
  const levelLabel = (l) => ({ easy: "Easy", normal: "Normal", professional: "Professional" }[l] || l || "—");

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const totalTests = quizResults.length + typingResults.length + codeResults.length;
  const avgScore = totalTests
    ? Math.round([...quizResults, ...typingResults, ...codeResults]
        .reduce((s, r) => s + (r.percentage ?? r.score ?? r.accuracy ?? 0), 0) / totalTests)
    : 0;

  const summaryData = [
    ["📊 IT Quiz Pro — Report Summary"],
    ["Generated", fmt(new Date().toISOString())],
    [""],
    ["Metric", "Value"],
    ["Total Students (Unique)", new Set(studentLogs.map(l => l.email)).size],
    ["Active Sessions", studentLogs.filter(l => !l.logout_time).length],
    ["Total Tests Taken", totalTests],
    ["Quiz Tests", quizResults.length],
    ["Typing Tests", typingResults.length],
    ["Code Tests", codeResults.length],
    ["Average Score", avgScore + "%"],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "📊 Summary");

  // ── Sheet 2: Student Logs ────────────────────────────────────────────────
  const logsHeaders = ["#", "Student Name", "Email", "Department", "Test Type", "Login Time", "Logout Time", "Duration"];
  const logsRows = studentLogs.map((l, i) => {
    const dept = l.department || "";
    const parts = dept.split(":::");
    const dep = parts[0]?.trim() || "—";
    const testType = parts[1]?.trim() || l.testType || "—";
    const typeLabel = { quiz: "Multiple Choice", typing: "Typing Test", code: "Code Test" }[testType] || testType;
    const duration = (l.login_time && l.logout_time)
      ? `${Math.round((new Date(l.logout_time) - new Date(l.login_time)) / 60000)} min`
      : l.logout_time ? "—" : "Still Active";
    return [i + 1, l.name || "—", l.email || "—", dep, typeLabel, fmt(l.login_time), fmt(l.logout_time), duration];
  });
  const wsLogs = XLSX.utils.aoa_to_sheet([logsHeaders, ...logsRows]);
  wsLogs["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsLogs, "👥 Student Logs");

  // ── Sheet 3: Quiz Results ────────────────────────────────────────────────
  const quizHeaders = ["#", "Student Name", "Email", "Level", "Score", "Correct", "Total Q", "Grade", "Date"];
  const quizRows = quizResults.map((r, i) => [
    i + 1,
    r.student_data?.name || "—",
    r.student_data?.email || "—",
    levelLabel(r.level),
    (r.percentage ?? 0) + "%",
    r.score ?? "—",
    r.total ?? "—",
    gradeLabel(calcGrade(r.percentage ?? 0).grade),
    fmt(r.timestamp)
  ]);
  const wsQuiz = XLSX.utils.aoa_to_sheet([quizHeaders, ...quizRows]);
  wsQuiz["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsQuiz, "📝 Quiz Results");

  // ── Sheet 4: Typing Results ──────────────────────────────────────────────
  const typingHeaders = ["#", "Student Name", "Email", "Level", "WPM", "Accuracy", "Time Used", "Grade", "Date"];
  const typingRows = typingResults.map((r, i) => [
    i + 1,
    r.student_data?.name || "—",
    r.student_data?.email || "—",
    levelLabel(r.level),
    r.wpm ?? "—",
    (r.accuracy ?? 0) + "%",
    r.time_used ? r.time_used + "s" : "—",
    gradeLabel(calcGrade(r.accuracy ?? 0).grade),
    fmt(r.timestamp)
  ]);
  const wsTyping = XLSX.utils.aoa_to_sheet([typingHeaders, ...typingRows]);
  wsTyping["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsTyping, "⌨️ Typing Results");

  // ── Sheet 5: Code Results ────────────────────────────────────────────────
  const codeHeaders = ["#", "Student Name", "Email", "Level", "Score", "Grade", "Date"];
  const codeRows = codeResults.map((r, i) => [
    i + 1,
    r.student_data?.name || "—",
    r.student_data?.email || "—",
    levelLabel(r.level),
    (r.score ?? 0) + "%",
    gradeLabel(calcGrade(r.score ?? 0).grade),
    fmt(r.timestamp)
  ]);
  const wsCode = XLSX.utils.aoa_to_sheet([codeHeaders, ...codeRows]);
  wsCode["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsCode, "💻 Code Results");

  // ── Download ─────────────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `IT_Quiz_Report_${date}.xlsx`);
}



// ─── PARTICLE BG ──────────────────────────────────────────────────────────────
function ParticlesBg({ isDarkMode }) {
  const canvasRef = useRef(null);
  const mouse = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    
    const handleMouseMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const particles = Array.from({ length: 240 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      o: Math.random() * 0.5 + 0.1,
      ox: 0,
      oy: 0
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        // Interaction
        const dx = mouse.current.x - p.x;
        const dy = mouse.current.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 200;
        
        if (dist < maxDist) {
          const force = (maxDist - dist) / maxDist;
          // Always attract (approach) the mouse
          p.ox += (dx / dist) * force * 0.8;
          p.oy += (dy / dist) * force * 0.8;
        }

        // Friction for interaction
        p.ox *= 0.95;
        p.oy *= 0.95;

        p.x += p.vx + p.ox;
        p.y += p.vy + p.oy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${p.o})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />;
}

// ─── TEACHER LOGIN ─────────────────────────────────────────────────────────────
function TeacherLogin({ onLogin, onBack }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    try {
      console.log("Attempting teacher login for:", form.username.trim());
      const teachers = await supabaseGet(TABLES.teachers);
      console.log("Teachers found in DB:", teachers?.length || 0);
      
      const teacher = teachers?.find(t => 
        t.username.trim().toLowerCase() === form.username.trim().toLowerCase() && 
        t.password.trim() === form.password.trim()
      );
      
      if (teacher) {
        console.log("Login successful!");
        onLogin(teacher);
      } else {
        console.error("Login failed: Username or password mismatch");
        setError("Invalid username or password");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Connection error. Please try again.");
    }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <button onClick={onBack} style={{ 
          marginBottom: "1.5rem", 
          background: "var(--bg-card)", 
          border: "1px solid var(--border-color)", 
          color: "var(--text-primary)", 
          padding: "0.6rem 1.2rem", 
          borderRadius: "0.875rem", 
          cursor: "pointer",
          fontWeight: 600,
          transition: "all 0.3s ease",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem"
        }}
        onMouseOver={e => { e.currentTarget.style.transform = "translateX(-5px)"; e.currentTarget.style.background = "var(--text-accent)10"; }}
        onMouseOut={e => { e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.background = "var(--bg-card)"; }}
        >← Back to Home</button>
        <div style={{ background: "var(--bg-card)", border: "2px solid var(--border-color)", borderRadius: "1.5rem", padding: "2.5rem", backdropFilter: "blur(20px)" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🎓</div>
            <h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--warning-color)" }}>Teacher Login</h2>
            <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>Access the Teacher Dashboard</p>
          </div>
          {error && <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#fca5a5", padding: "0.75rem 1rem", borderRadius: "0.75rem", marginBottom: "1rem", fontSize: "0.88rem" }}>⚠ {error}</div>}
          {[{ key: "username", label: "👤 Username", type: "text", ph: "Enter username" }, { key: "password", label: "🔒 Password", type: "password", ph: "Enter password" }].map(f => (
            <div key={f.key} style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", color: "var(--text-accent)", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.5rem" }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} placeholder={f.ph} onChange={e => { setForm(p => ({ ...p, [f.key]: e.target.value })); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                style={{ 
                  width: "100%", 
                  padding: "0.875rem 1.125rem", 
                  borderRadius: "0.875rem", 
                  border: "2px solid var(--border-color)", 
                  background: "var(--input-bg)", 
                  color: "var(--text-primary)", 
                  fontSize: "1rem", 
                  outline: "none", 
                  boxSizing: "border-box",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-accent)";
                  e.currentTarget.style.boxShadow = "0 4px 15px rgba(139,92,246,0.15)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseOut={(e) => {
                  if (document.activeElement !== e.currentTarget) {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--text-accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139,92,246,0.3)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-color)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              />
            </div>
          ))}
          <button onClick={handleSubmit} style={{ 
            width: "100%", 
            padding: "1.25rem", 
            borderRadius: "1.25rem", 
            background: "linear-gradient(135deg,#7c3aed,#db2777)", 
            color: "white", 
            fontWeight: 800, 
            border: "none", 
            cursor: "pointer", 
            fontSize: "1.1rem",
            boxShadow: "0 10px 25px rgba(124,58,237,0.3)",
            transition: "all 0.3s ease"
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-3px)";
            e.currentTarget.style.boxShadow = "0 15px 35px rgba(124,58,237,0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 10px 25px rgba(124,58,237,0.3)";
          }}
          >
            🔐 Login to Dashboard
          </button>

        </div>
      </div>
    </div>
  );
}

// ─── TEACHER DASHBOARD ────────────────────────────────────────────────────────
function TeacherDashboard({ teacher, onLogout, quizLimits, setQuizLimits, lockedLevels, setLockedLevels }) {
  const [tab, setTab] = useState("overview");
  const [questions, setQuestions] = useState([]);
  const [typingTexts, setTypingTexts] = useState([]);
  const [buggyCode, setBuggyCode] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [typingResults, setTypingResults] = useState([]);
  const [codeResults, setCodeResults] = useState([]);
  const [studentLogs, setStudentLogs] = useState([]);
  const [showAddQ, setShowAddQ] = useState(false);
  const [showAddT, setShowAddT] = useState(false);
  const [showAddC, setShowAddC] = useState(false);
  const [showAddTeacher, setShowAddTeacher] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [newQ, setNewQ] = useState({ question: "", option1: "", option2: "", option3: "", option4: "", correct_answer: "", type: "multichoice", level: "easy", category: "Hardware", hint: "" });
  const [newT, setNewT] = useState({ text: "", level: "easy", time_limit: 60 });
  const [newC, setNewC] = useState({ level: "easy", description: "", buggy_code: "", correct_code: "", time_limit: 120 });
  const [newTeacher, setNewTeacher] = useState({ username: "", password: "", name: "", email: "" });
  const [filterLevel, setFilterLevel] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [toast, setToast] = useState(null);
  const [tempLimits, setTempLimits] = useState({ 
    easy: Math.floor(quizLimits.easy / 60), 
    normal: Math.floor(quizLimits.normal / 60), 
    professional: Math.floor(quizLimits.professional / 60) 
  });

  useEffect(() => {
    setTempLimits({ 
      easy: Math.floor(quizLimits.easy / 60), 
      normal: Math.floor(quizLimits.normal / 60), 
      professional: Math.floor(quizLimits.professional / 60) 
    });
  }, [quizLimits]);

  const reload = useCallback(async () => {
    showToast("Refreshing data...", "info");
    try {
      const [qs, ts, cs, tchs, qRes, tRes, cRes, logs] = await Promise.all([
        supabase.from(TABLES.questions).select("*").order("id", { ascending: false }),
        supabase.from(TABLES.typingTexts).select("*").order("id", { ascending: false }),
        supabase.from(TABLES.buggyCode).select("*").order("id", { ascending: false }),
        supabase.from(TABLES.teachers).select("*").order("id", { ascending: false }),
        supabase.from(TABLES.quizResults).select("*").order("timestamp", { ascending: false }),
        supabase.from(TABLES.typingResults).select("*").order("timestamp", { ascending: false }),
        supabase.from(TABLES.codeResults).select("*").order("timestamp", { ascending: false }),
        supabase.from(TABLES.studentLogs).select("*").order("login_time", { ascending: false })
      ]);

      if (qs.error || ts.error || cs.error || tchs.error || qRes.error || tRes.error || cRes.error || logs.error) {
        throw new Error("One or more tables failed to load");
      }

      setQuestions(qs.data || []);
      setTypingTexts(ts.data || []);
      setBuggyCode(cs.data || []);
      setTeachers(tchs.data || []);
      setQuizResults(qRes.data || []);
      setTypingResults(tRes.data || []);
      setCodeResults(cRes.data || []);
      setStudentLogs(logs.data || []);
      
      showToast("Data updated successfully!");
    } catch (err) {
      console.error("Reload error:", err);
      showToast("Failed to refresh data. Please check your connection.", "error");
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const addQuestion = async () => {
    if (!newQ.question || !newQ.correct_answer) return;
    await supabaseInsert(TABLES.questions, newQ);
    setShowAddQ(false); setNewQ({ question: "", option1: "", option2: "", option3: "", option4: "", correct_answer: "", type: "multichoice", level: "easy", category: "Hardware", hint: "" });
    reload(); showToast("Question added successfully!");
  };
  const deleteQuestion = async (id) => { await supabaseDelete(TABLES.questions, id); reload(); showToast("Question deleted."); };
  const saveEditQuestion = async () => {
    await supabaseUpdate(TABLES.questions, editItem.id, editItem);
    setEditItem(null); reload(); showToast("Question updated!");
  };

  const addTypingText = async () => {
    if (!newT.text) return;
    await supabaseInsert(TABLES.typingTexts, newT);
    setShowAddT(false); setNewT({ text: "", level: "easy", time_limit: 60 });
    reload(); showToast("Typing text added!");
  };
  const saveEditTypingText = async () => {
    await supabaseUpdate(TABLES.typingTexts, editItem.id, editItem);
    setEditItem(null); reload(); showToast("Typing text updated!");
  };
  const deleteTypingText = async (id) => { await supabaseDelete(TABLES.typingTexts, id); reload(); showToast("Typing text deleted."); };

  const addBuggyCode = async () => {
    if (!newC.buggy_code || !newC.correct_code) return;
    await supabaseInsert(TABLES.buggyCode, newC);
    setShowAddC(false); setNewC({ level: "easy", description: "", buggy_code: "", correct_code: "", time_limit: 120 });
    reload(); showToast("Code challenge added!");
  };
  const deleteBuggyCode = async (id) => { await supabaseDelete(TABLES.buggyCode, id); reload(); showToast("Code challenge deleted."); };
  const saveEditBuggyCode = async () => {
    await supabaseUpdate(TABLES.buggyCode, editItem.id, editItem);
    setEditItem(null); reload(); showToast("Code challenge updated!");
  };

  const addTeacher = async () => {
    if (!newTeacher.username || !newTeacher.password) return;
    try {
      console.log("Adding teacher:", newTeacher.username);
      const { data, error } = await supabase.from(TABLES.teachers).insert([newTeacher]).select();
      
      if (error) throw error;
      
      setShowAddTeacher(false); 
      setNewTeacher({ username: "", password: "", name: "", email: "" });
      reload(); 
      showToast("Teacher account created successfully!");
    } catch (err) {
      console.error("Error adding teacher:", err);
      showToast(`Error: ${err.message || "Could not save teacher"}`, "error");
    }
  };
  const deleteTeacher = async (id) => { 
    const t = teachers.find(t => t.id === id);
    if (t?.username === teacher.username) { showToast("Cannot delete your own account!", "error"); return; } 
    await supabaseDelete(TABLES.teachers, id); 
    reload(); showToast("Teacher deleted."); 
  };

  const resetStats = async () => {
    if (!window.confirm("Are you sure you want to clear ALL results and logs?")) return;
    await Promise.all([
      supabase.from(TABLES.studentLogs).delete().neq("id", -1),
      supabase.from(TABLES.quizResults).delete().neq("id", -1),
      supabase.from(TABLES.typingResults).delete().neq("id", -1),
      supabase.from(TABLES.codeResults).delete().neq("id", -1)
    ]);
    reload(); showToast("All statistics reset!");
  };

  const deleteStudentLogs = async () => {
    if (!window.confirm("Are you sure you want to clear ALL student logs? This cannot be undone.")) return;
    const { error } = await supabase.from(TABLES.studentLogs).delete().neq("id", -1);
    if (error) { showToast("Error clearing logs", "error"); }
    else { reload(); showToast("Student logs cleared!"); }
  };

  const handleExportAll = () => {
    if (!studentLogs.length && !allResults.length) { showToast("No data to export!", "error"); return; }
    exportToExcel({ studentLogs, quizResults, typingResults, codeResults });
    showToast("Excel report generated successfully!", "success");
  };

  const allResults = [
    ...quizResults.map(r => ({ ...r, testType: "quiz" })),
    ...typingResults.map(r => ({ ...r, testType: "typing" })),
    ...codeResults.map(r => ({ ...r, testType: "code" })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

   const totalStudents = new Set(studentLogs.map(l => l.email)).size;
   const activeStudents = studentLogs.filter(l => !l.logout_time).length;
   const avgScore = allResults.length ? Math.round(allResults.reduce((s, r) => s + (r.percentage || r.score || 0), 0) / allResults.length) : 0;

  const TABS = [
    { id: "overview", icon: "📊", label: "Overview" },
    { id: "students", icon: "👥", label: "Students" },
    { id: "questions", icon: "❓", label: "Questions" },
    { id: "settings", icon: "⚙️", label: "Quiz Settings" },
    { id: "typing", icon: "⌨️", label: "Typing Texts" },
    { id: "code", icon: "💻", label: "Code Challenges" },
    { id: "teachers", icon: "🎓", label: "Teachers" },
  ];

  // ─── CUSTOM SELECT COMPONENT ─────────────────────────────────────────────
  const CustomSelect = ({ value, onChange, options, label }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        {label && <label style={S.label}>{label}</label>}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ 
            ...S.select, 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between",
            background: isOpen ? "var(--bg-card)" : "var(--input-bg)",
            borderColor: isOpen ? "#8b5cf6" : "var(--border-color)",
            boxShadow: isOpen ? "0 0 0 4px rgba(139, 92, 246, 0.15)" : "none",
            transform: isOpen ? "translateY(-1px)" : "none"
          }}
          className="teacher-select"
        >
          <span style={{ textTransform: "capitalize" }}>{value || "Select..."}</span>
        </div>

        {isOpen && (
          <div style={{ 
            position: "absolute", 
            top: "calc(100% + 0.5rem)", 
            left: 0, 
            right: 0, 
            background: "var(--bg-card)", 
            border: "2px solid var(--text-accent)", 
            borderRadius: "1.25rem", 
            padding: "0.6rem", 
            zIndex: 9999999, 
            boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
            backdropFilter: "blur(30px)",
            animation: "fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            overflow: "hidden"
          }}>
            {/* Floating Highlight Effect */}
            <div style={{
              position: "absolute",
              left: "0.6rem",
              right: "0.6rem",
              height: "3.2rem", // Approximate height of one item
              background: "rgba(139, 92, 246, 0.15)",
              borderRadius: "0.9rem",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              zIndex: 0,
              opacity: 0,
              pointerEvents: "none",
              display: "block"
            }} id="hover-box"></div>

            {options.map((o, idx) => (
              <div 
                key={o} 
                onClick={() => { onChange({ target: { value: o } }); setIsOpen(false); }}
                style={{ 
                  padding: "0.85rem 1.2rem", 
                  borderRadius: "0.9rem", 
                  cursor: "pointer", 
                  color: value === o ? "var(--text-accent)" : "var(--text-primary)", 
                  background: value === o ? "rgba(139, 92, 246, 0.1)" : "transparent",
                  fontWeight: value === o ? 800 : 600,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  textTransform: "capitalize",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  position: "relative",
                  zIndex: 1
                }}
                onMouseOver={e => {
                  const box = e.currentTarget.parentElement.querySelector("#hover-box");
                  if (box) {
                    box.style.opacity = 1;
                    box.style.top = (idx * 3.2 + 0.6) + "rem"; // idx * height + padding
                  }
                  e.currentTarget.style.paddingLeft = "1.5rem";
                }}
                onMouseOut={e => {
                  const box = e.currentTarget.parentElement.querySelector("#hover-box");
                  // Keep it visible if needed, or hide on container out
                  e.currentTarget.style.paddingLeft = "1.2rem";
                }}
              >
                {value === o && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--text-accent)" }}></span>}
                {o}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };


  const S = { 
    card: { 
      background: "var(--bg-card)", 
      border: "1px solid var(--border-color)", 
      borderRadius: "1rem", 
      padding: "1.25rem", 
      backdropFilter: "blur(20px)",
      position: "relative",
      overflow: "visible"
    }, 
    label: { 
      display: "block", 
      color: "var(--text-accent)", 
      fontSize: "1.05rem", 
      fontWeight: 700, 
      marginBottom: "0.6rem" 
    }, 
    input: { 
      width: "100%", 
      padding: "0.875rem 1.125rem", 
      borderRadius: "0.875rem", 
      border: "2px solid var(--border-color)", 
      background: "var(--input-bg)", 
      color: "var(--text-primary)", 
      fontSize: "1.05rem", 
      fontWeight: 500,
      outline: "none", 
      boxSizing: "border-box",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
    }, 
    select: {
      width: "100%", 
      padding: "0.875rem 1.125rem", 
      borderRadius: "0.875rem", 
      border: "2px solid var(--border-color)", 
      background: "var(--input-bg)", 
      color: "var(--text-primary)", 
      fontSize: "1.05rem", 
      fontWeight: 500,
      outline: "none", 
      boxSizing: "border-box",
      cursor: "pointer",
      appearance: "none",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238b5cf6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
      backgroundPosition: "calc(100% - 1.25rem) center",
      backgroundSize: "1.2rem",
      backgroundRepeat: "no-repeat",
      boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
    }, 
    btn: (col = "#8b5cf6") => ({ 
      padding: "0.75rem 1.5rem", 
      borderRadius: "0.875rem", 
      background: col + "20", 
      border: `1px solid ${col}60`, 
      color: col, 
      cursor: "pointer", 
      fontSize: "1.05rem", 
      fontWeight: 700 
    }), 
    badge: (col) => ({ 
      background: col + "20", 
      color: col, 
      padding: "5px 12px", 
      borderRadius: "999px", 
      fontSize: "0.9rem", 
      fontWeight: 700 
    }) 
  };

  const filteredQs = questions.filter(q => (filterLevel === "all" || q.level === filterLevel) && (q.question.toLowerCase().includes(searchQ.toLowerCase()) || q.category?.toLowerCase().includes(searchQ.toLowerCase())));

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      {toast && <div style={{ 
        position: "fixed", 
        top: "1.25rem", 
        left: "50%", 
        transform: "translateX(-50%)", 
        background: toast.type === "error" ? "rgba(239,68,68,0.97)" : "rgba(34,197,94,0.97)", 
        color: "white", 
        padding: "0.6rem 1.5rem", 
        borderRadius: "999px", 
        fontWeight: 700, 
        fontSize: "0.88rem", 
        zIndex: 9999, 
        boxShadow: "0 8px 25px rgba(0,0,0,0.35)",
        backdropFilter: "blur(10px)",
        whiteSpace: "nowrap"
      }}>{toast.type === "error" ? "❌" : "✅"} {toast.msg}</div>}

      {/* Top Nav */}
      <div style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border-color)", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.5rem" }}>💡</span>
          <span style={{ fontWeight: 900, fontSize: "1.1rem", background: "linear-gradient(135deg,var(--text-accent),#f9a8d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>IT Quiz Pro</span>
          <span style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700 }}>TEACHER</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "1.05rem", fontWeight: 600 }}>Welcome, <span style={{ color: "var(--text-accent)", fontWeight: 800 }}>{teacher.name}</span></span>
          <button onClick={onLogout} style={{ 
            background: "linear-gradient(135deg, #ef4444, #b91c1c)", 
            color: "white", 
            padding: "0.6rem 1.5rem", 
            borderRadius: "0.875rem", 
            border: "none",
            cursor: "pointer", 
            fontSize: "1rem", 
            fontWeight: 800,
            boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem"
          }}>🚪 Logout</button>
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 60px)" }}>
        {/* Sidebar */}
        <div style={{ width: "240px", background: "var(--bg-card)", borderRight: "1px solid var(--border-color)", padding: "1.5rem 0.75rem", flexShrink: 0, backdropFilter: "blur(10px)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "1rem", 
              width: "100%", 
              padding: "1rem 1.25rem", 
              borderRadius: "1rem", 
              border: "none", 
              background: tab === t.id ? "var(--text-accent)20" : "transparent", 
              color: tab === t.id ? "var(--text-accent)" : "var(--text-primary)", 
              cursor: "pointer", 
              fontSize: "1.1rem", 
              fontWeight: tab === t.id ? 800 : 600, 
              textAlign: "left", 
              marginBottom: "0.6rem", 
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              opacity: tab === t.id ? 1 : 0.7
            }}>
              <span style={{ fontSize: "1.25rem" }}>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Main */}
        <div style={{ flex: 1, padding: "1.5rem", overflowY: "auto" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>📊 Dashboard Overview</h2>
                <button onClick={reload} style={{ ...S.btn("#8b5cf6"), padding: "0.5rem 1rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>🔄 Refresh Data</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                {[
                  { label: "Active Now", value: activeStudents, icon: "🟢", color: "#22c55e" },
                  { label: "Total Students", value: totalStudents, icon: "👥", color: "#8b5cf6" },
                  { label: "Tests Taken", value: allResults.length, icon: "📝", color: "#06b6d4" },
                  { label: "Avg Score", value: avgScore + "%", icon: "🎯", color: "#f59e0b" },
                  { label: "Questions", value: questions.length, icon: "❓", color: "#ec4899" },
                ].map((s, i) => (
                  <div key={i} style={{ ...S.card, textAlign: "center", padding: "1.5rem" }}>
                    <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>{s.icon}</div>
                    <div style={{ fontSize: "2.2rem", fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "1rem", fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h3 style={{ color: "var(--text-accent)", fontWeight: 700, fontSize: "1rem" }}>📋 Recent Results</h3>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button onClick={handleExportAll} style={{ ...S.btn("#22c55e"), padding: "0.5rem 1.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 800 }}>📥 Export</button>
                    <button onClick={resetStats} style={{ ...S.btn("#ef4444"), padding: "0.5rem 1rem", fontSize: "0.8rem" }}>🗑 Reset All</button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                    <thead><tr>{["Timestamp", "Student", "Email", "Type", "Level", "Score", "Grade"].map(h => <th key={h} style={{ color: "var(--text-secondary)", padding: "0.75rem 1rem", textAlign: "left", borderBottom: "2px solid var(--border-color)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {allResults.slice(0, 20).map((r, i) => {
                        const sVal = r.percentage ?? r.accuracy ?? r.score ?? 0;
                        const { grade, color } = calcGrade(sVal);
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                            <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>{new Date(r.timestamp).toLocaleString()}</td>
                            <td style={{ padding: "0.75rem 1rem", color: "var(--text-primary)", fontWeight: 600 }}>{r.student_data?.name || r.name || r.studentName || "—"}</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>{r.student_data?.email || r.email || "—"}</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}><span style={S.badge(r.testType?.toLowerCase() === "quiz" ? "#818cf8" : r.testType?.toLowerCase() === "typing" ? "#06b6d4" : "#10b981")}>{r.testType}</span></td>
                            <td style={{ padding: "0.5rem 0.75rem" }}><span style={S.badge("#f59e0b")}>{r.level || "—"}</span></td>
                            <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-primary)", fontWeight: 700 }}>{Math.round(sVal)}%</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}><span style={S.badge(color)}>{grade}</span></td>
                          </tr>
                        );
                      })}
                      {!allResults.length && <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#475569" }}>No results yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STUDENTS */}
          {tab === "students" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>👥 Student Logs ({studentLogs.length})</h2>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button onClick={reload} style={{ ...S.btn("#8b5cf6"), padding: "0.6rem 1.25rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>🔄 Refresh</button>
                  <button onClick={handleExportAll} style={{ ...S.btn("#10b981"), padding: "0.6rem 1.25rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>📊 Export</button>
                  <button onClick={deleteStudentLogs} style={{ ...S.btn("#ef4444"), padding: "0.6rem 1.25rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>🗑 Clear Logs</button>
                </div>
              </div>
              <div style={S.card}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
                    <thead><tr>{["Name", "Email", "Department", "Test Type", "Login", "Logout"].map(h => <th key={h} style={{ color: "var(--text-secondary)", padding: "0.75rem 1rem", textAlign: "left", borderBottom: "2px solid var(--border-color)", fontWeight: 700 }}>{h}</th>)}</tr></thead>
                    <tbody>
                        {studentLogs.map((l, i) => {
                          // Parse stealthy workaround "Dept :::type"
                          const parts = l.department?.split(" :::");
                          const cleanDept = parts?.[0] || l.department;
                          const loginType = parts?.[1];

                          // Fallback to results lookup if not in log (for older entries)
                          const studentResults = allResults.filter(r => (r.student_data?.email || r.email) === l.email);
                          const match = studentResults.find(r => new Date(r.timestamp) >= new Date(l.login_time));
                          const type = loginType || match?.testType || "—";

                          return (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                              <td style={{ padding: "0.75rem 1rem", color: "var(--text-primary)", fontWeight: 600 }}>{l.name}</td>
                              <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>{l.email}</td>
                              <td style={{ padding: "0.75rem 1rem", color: "var(--text-secondary)" }}>{cleanDept}</td>
                              <td style={{ padding: "0.5rem 0.75rem" }}>
                                <span style={{
                                  padding: "0.25rem 0.5rem",
                                  borderRadius: "0.375rem",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  background: type.toLowerCase() === "quiz" ? "#8b5cf620" : type.toLowerCase() === "typing" ? "#06b6d420" : type.toLowerCase() === "code" ? "#10b98120" : "transparent",
                                  color: type.toLowerCase() === "quiz" ? "#a78bfa" : type.toLowerCase() === "typing" ? "#67e8f9" : type.toLowerCase() === "code" ? "#34d399" : "var(--text-secondary)",
                                  textTransform: "capitalize"
                                }}>
                                  {type}
                                </span>
                              </td>
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>{l.login_time ? new Date(l.login_time).toLocaleString() : '—'}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>
                            {l.logout_time ? (
                              <span style={{ color: "var(--text-secondary)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#64748b" }}></span> Inactive
                              </span>
                            ) : (
                              <span style={{ color: "#22c55e", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }}></span> Active
                              </span>
                            )}
                            </td>
                          </tr>
                        );
                      })}
                      {!studentLogs.length && <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#475569" }}>No student logs yet</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* QUESTIONS */}
          {tab === "questions" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>❓ Questions ({filteredQs.length})</h2>
                <button onClick={() => setShowAddQ(true)} style={{ ...S.btn("#8b5cf6"), padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}>+ Add Question</button>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 Search questions..." style={{ ...S.input, maxWidth: "280px" }} />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {["all", "easy", "normal", "professional"].map(l => <button key={l} onClick={() => setFilterLevel(l)} style={{ ...S.btn(l === "easy" ? "#22c55e" : l === "normal" ? "#f59e0b" : l === "professional" ? "#ef4444" : "#8b5cf6"), ...(filterLevel === l ? { fontWeight: 800 } : {}) }}>{l}</button>)}
                </div>
              </div>

              {showAddQ && (
                <div style={{ ...S.card, marginBottom: "1.25rem", border: "2px solid rgba(139,92,246,0.5)", zIndex: 100 }}>
                  <h3 style={{ color: "var(--text-accent)", fontWeight: 700, marginBottom: "1rem" }}>➕ Add New Question</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    {[
                      ["question", "Question *", "text"],
                      ["option1", "Option 1 *", "text"],
                      ["option2", "Option 2 *", "text"],
                      ["option3", "Option 3", "text"],
                      ["option4", "Option 4", "text"],
                      ["correct_answer", "Correct Answer *", "text"],
                      ["hint", "Hint", "text"]
                    ].filter(([k]) => {
                      if (newQ.type === "truefalse" && (k === "option3" || k === "option4")) return false;
                      return true;
                    }).map(([k, l, t]) => (
                      <div key={k} style={k === "question" ? { gridColumn: "1 / -1" } : {}}>
                        <label style={S.label}>{l}</label>
                        <input className="teacher-input" type={t} value={newQ[k]} onChange={e => setNewQ(p => ({ ...p, [k]: e.target.value }))} style={S.input} />
                      </div>
                    ))}
                    {[["type", "Type", ["multichoice", "truefalse"]], ["level", "Level", ["easy", "normal", "professional"]], ["category", "Category", ["Hardware", "Software", "IT Technology", "Processes"]]].map(([k, l, opts]) => (
                      <CustomSelect
                        key={k}
                        label={l}
                        value={newQ[k]}
                        options={opts}
                        onChange={e => setNewQ(p => ({ ...p, [k]: e.target.value }))}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                    <button onClick={addQuestion} style={{ ...S.btn("#22c55e"), padding: "0.6rem 1.5rem" }}>✅ Save</button>
                    <button onClick={() => setShowAddQ(false)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.6rem 1.5rem" }}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {filteredQs.map((q, i) => (
                  <div key={q.id} style={{ ...S.card, zIndex: editItem?.id === q.id ? 90 : 1 }}>
                    {editItem?.id === q.id ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                          {[
                            ["question", "Question"],
                            ["option1", "Option 1"],
                            ["option2", "Option 2"],
                            ["option3", "Option 3"],
                            ["option4", "Option 4"],
                            ["correct_answer", "Correct Answer"],
                            ["hint", "Hint"]
                          ].filter(([k]) => {
                            if (editItem.type === "truefalse" && (k === "option3" || k === "option4")) return false;
                            return true;
                          }).map(([k, l]) => (
                            <div key={k} style={k === "question" ? { gridColumn: "1 / -1" } : {}}>
                              <label style={S.label}>{l}</label>
                              <input className="teacher-input" value={editItem[k] || ""} onChange={e => setEditItem(p => ({ ...p, [k]: e.target.value }))} style={S.input} />
                            </div>
                          ))}
                          {[["type", "Type", ["multichoice", "truefalse"]], ["level", "Level", ["easy", "normal", "professional"]], ["category", "Category", ["Hardware", "Software", "IT Technology", "Processes"]]].map(([k, l, opts]) => (
                            <CustomSelect
                              key={k}
                              label={l}
                              value={editItem[k]}
                              options={opts}
                              onChange={e => setEditItem(p => ({ ...p, [k]: e.target.value }))}
                            />
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                          <button onClick={saveEditQuestion} style={{ ...S.btn("#22c55e"), padding: "0.5rem 1.25rem" }}>✅ Save</button>
                          <button onClick={() => setEditItem(null)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.5rem 1.25rem" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                            <span style={S.badge("#8b5cf6")}>#{q.id}</span>
                            <span style={S.badge(q.level === "easy" ? "#22c55e" : q.level === "normal" ? "#f59e0b" : "#ef4444")}>{q.level}</span>
                            <span style={S.badge("#06b6d4")}>{q.category}</span>
                            <span style={S.badge("var(--text-secondary)")}>{q.type}</span>
                          </div>
                          <p style={{ color: "var(--text-primary)", fontSize: "1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>{q.question}</p>
                          <p style={{ color: "#22c55e", fontSize: "0.9rem", margin: 0 }}>✓ {q.correct_answer}</p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <button onClick={() => deleteQuestion(q.id)} style={{ ...S.btn("#ef4444"), padding: "0.5rem" }} title="Delete">🗑</button>
                          <button onClick={() => setEditItem({ ...q })} style={{ ...S.btn("#8b5cf6"), padding: "0.5rem" }} title="Edit">🖋</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {!filteredQs.length && <div style={{ color: "#475569", textAlign: "center", padding: "2rem" }}>No questions found</div>}
              </div>
            </div>
          )}

          {/* TYPING TEXTS */}
          {tab === "typing" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>⌨️ Typing Texts ({typingTexts.length})</h2>
                <button onClick={() => setShowAddT(true)} style={{ ...S.btn("#06b6d4"), padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}>+ Add Text</button>
              </div>
              {showAddT && (
                <div style={{ ...S.card, marginBottom: "1.25rem", border: "2px solid rgba(6,182,212,0.4)", zIndex: 100 }}>
                  <h3 style={{ color: "#67e8f9", fontWeight: 700, marginBottom: "1rem" }}>➕ Add Typing Text</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={S.label}>Text *</label>
                      <textarea value={newT.text} onChange={e => setNewT(p => ({ ...p, text: e.target.value }))} style={{ ...S.input, height: "80px", resize: "vertical" }} />
                    </div>
                    <div>
                      <CustomSelect
                        label="Level"
                        value={newT.level}
                        options={["easy", "normal", "professional"]}
                        onChange={e => setNewT(p => ({ ...p, level: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={S.label}>Time Limit (seconds)</label>
                      <input type="number" value={newT.time_limit} onChange={e => setNewT(p => ({ ...p, time_limit: parseInt(e.target.value) }))} style={S.input} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                    <button onClick={addTypingText} style={{ ...S.btn("#22c55e"), padding: "0.6rem 1.5rem" }}>✅ Save</button>
                    <button onClick={() => setShowAddT(false)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.6rem 1.5rem" }}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {typingTexts.map(t => (
                  <div key={t.id} style={{ ...S.card, zIndex: editItem?.id === t.id ? 90 : 1 }}>
                    {editItem?.id === t.id ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={S.label}>Text *</label>
                            <textarea value={editItem.text} onChange={e => setEditItem(p => ({ ...p, text: e.target.value }))} style={{ ...S.input, height: "100px" }} />
                          </div>
                          <div>
                            <CustomSelect
                              label="Level"
                              value={editItem.level}
                              options={["easy", "normal", "professional"]}
                              onChange={e => setEditItem(p => ({ ...p, level: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label style={S.label}>Time Limit (sec)</label>
                            <input type="number" value={editItem.time_limit} onChange={e => setEditItem(p => ({ ...p, time_limit: parseInt(e.target.value) }))} style={S.input} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                          <button onClick={saveEditTypingText} style={{ ...S.btn("#22c55e"), padding: "0.5rem 1.25rem" }}>✅ Save</button>
                          <button onClick={() => setEditItem(null)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.5rem 1.25rem" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <span style={S.badge("#06b6d4")}>{t.level}</span>
                            <span style={S.badge("var(--text-secondary)")}>⏱ {t.time_limit}s</span>
                          </div>
                          <p style={{ color: "var(--text-primary)", fontSize: "1.05rem", fontFamily: "monospace", margin: 0, lineHeight: 1.6, fontWeight: 500 }}>{t.text.slice(0, 120)}{t.text.length > 120 ? "..." : ""}</p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <button onClick={() => deleteTypingText(t.id)} style={{ ...S.btn("#ef4444"), padding: "0.5rem" }} title="Delete">🗑</button>
                          <button onClick={() => setEditItem({ ...t })} style={{ ...S.btn("#8b5cf6"), padding: "0.5rem" }} title="Edit">🖋</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CODE CHALLENGES */}
          {tab === "code" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>💻 Code Challenges ({buggyCode.length})</h2>
                <button onClick={() => setShowAddC(true)} style={{ ...S.btn("#10b981"), padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}>+ Add Challenge</button>
              </div>
              {showAddC && (
                <div style={{ ...S.card, marginBottom: "1.25rem", border: "2px solid rgba(16,185,129,0.4)", zIndex: 100 }}>
                  <h3 style={{ color: "#6ee7b7", fontWeight: 700, marginBottom: "1rem" }}>➕ Add Code Challenge</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <CustomSelect
                        label="Level"
                        value={newC.level}
                        options={["easy", "normal", "professional"]}
                        onChange={e => setNewC(p => ({ ...p, level: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={S.label}>Time Limit (sec)</label>
                      <input type="number" value={newC.time_limit} onChange={e => setNewC(p => ({ ...p, time_limit: parseInt(e.target.value) }))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>Description</label>
                      <input value={newC.description} onChange={e => setNewC(p => ({ ...p, description: e.target.value }))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>Buggy Code *</label>
                      <textarea value={newC.buggy_code} onChange={e => setNewC(p => ({ ...p, buggy_code: e.target.value }))} style={{ ...S.input, height: "100px", resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }} />
                    </div>
                    <div>
                      <label style={S.label}>Correct Code *</label>
                      <textarea value={newC.correct_code} onChange={e => setNewC(p => ({ ...p, correct_code: e.target.value }))} style={{ ...S.input, height: "100px", resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                    <button onClick={addBuggyCode} style={{ ...S.btn("#22c55e"), padding: "0.6rem 1.5rem" }}>✅ Save</button>
                    <button onClick={() => setShowAddC(false)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.6rem 1.5rem" }}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {buggyCode.map(c => (
                  <div key={c.id} style={{ ...S.card, zIndex: editItem?.id === c.id ? 90 : 1 }}>
                    {editItem?.id === c.id ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={S.label}>Description</label>
                            <input value={editItem.description} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))} style={S.input} />
                          </div>
                          <div>
                            <CustomSelect
                              label="Level"
                              value={editItem.level}
                              options={["easy", "normal", "professional"]}
                              onChange={e => setEditItem(p => ({ ...p, level: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label style={S.label}>Time Limit (sec)</label>
                            <input type="number" value={editItem.time_limit} onChange={e => setEditItem(p => ({ ...p, time_limit: parseInt(e.target.value) }))} style={S.input} />
                          </div>
                          <div>
                            <label style={S.label}>Buggy Code</label>
                            <textarea value={editItem.buggy_code} onChange={e => setEditItem(p => ({ ...p, buggy_code: e.target.value }))} style={{ ...S.input, height: "100px", fontFamily: "monospace" }} />
                          </div>
                          <div>
                            <label style={S.label}>Correct Code</label>
                            <textarea value={editItem.correct_code} onChange={e => setEditItem(p => ({ ...p, correct_code: e.target.value }))} style={{ ...S.input, height: "100px", fontFamily: "monospace" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                          <button onClick={saveEditBuggyCode} style={{ ...S.btn("#22c55e"), padding: "0.5rem 1.25rem" }}>✅ Save</button>
                          <button onClick={() => setEditItem(null)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.5rem 1.25rem" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                            <span style={S.badge("#10b981")}>{c.level}</span>
                            <span style={S.badge("#06b6d4")}>⏱ {c.time_limit || 120}s</span>
                          </div>
                          <p style={{ color: "#10b981", fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.5rem" }}>{c.description}</p>
                          <pre style={{ color: "var(--error-color)", fontFamily: "monospace", fontSize: "1rem", background: "rgba(239,68,68,0.08)", border: "1px solid var(--error-color)", borderRadius: "0.75rem", padding: "1rem", margin: 0, overflowX: "auto", fontWeight: 500 }}>{c.buggy_code}</pre>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <button onClick={() => deleteBuggyCode(c.id)} style={{ ...S.btn("#ef4444"), padding: "0.5rem" }} title="Delete">🗑</button>
                          <button onClick={() => setEditItem({ ...c })} style={{ ...S.btn("#8b5cf6"), padding: "0.5rem" }} title="Edit">🖋</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TEACHERS */}
          {tab === "teachers" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>🎓 Teacher Accounts ({teachers.length})</h2>
                <button onClick={() => setShowAddTeacher(true)} style={{ ...S.btn("#fbbf24"), padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}>+ Add Teacher</button>
              </div>
              {showAddTeacher && (
                <div style={{ ...S.card, marginBottom: "1.25rem", border: "2px solid rgba(251,191,36,0.4)" }}>
                  <h3 style={{ color: "#fbbf24", fontWeight: 700, marginBottom: "1rem" }}>➕ Add Teacher Account</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    {[["username", "Username *"], ["password", "Password *"], ["name", "Full Name"], ["email", "Email"]].map(([k, l]) => (
                      <div key={k}>
                        <label style={S.label}>{l}</label>
                        <input type={k === "password" ? "password" : "text"} value={newTeacher[k]} onChange={e => setNewTeacher(p => ({ ...p, [k]: e.target.value }))} style={S.input} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                    <button onClick={addTeacher} style={{ ...S.btn("#22c55e"), padding: "0.6rem 1.5rem" }}>✅ Save</button>
                    <button onClick={() => setShowAddTeacher(false)} style={{ ...S.btn("var(--text-secondary)"), padding: "0.6rem 1.5rem" }}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {teachers.map((t, i) => (
                  <div key={i} style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(139,92,246,0.3)", border: "2px solid rgba(139,92,246,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "var(--text-accent)", fontSize: "1rem" }}>{(t.name || t.username)[0].toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: "0.95rem" }}>{t.name || t.username}</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>{t.email} · @{t.username}</div>
                      </div>
                      {t.username === teacher.username && <span style={S.badge("#fbbf24")}>You</span>}
                      {t.username !== teacher.username && <button onClick={() => deleteTeacher(t.id)} style={S.btn("#ef4444")}>🗑</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QUIZ SETTINGS */}
          {tab === "settings" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
                <h2 style={{ color: "var(--text-primary)", fontWeight: 900, fontSize: "1.4rem" }}>⚙️ Quiz Settings</h2>
              </div>
              <div style={S.card}>
                <h3 style={{ color: "var(--text-accent)", fontWeight: 700, marginBottom: "1.25rem" }}>⏱ Global Time Limits (Minutes)</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "2rem" }}>
                  Set the time limit for each quiz level. These changes will apply to all students immediately.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
                  {[
                    { key: "easy", label: "Easy Level", color: "#22c55e" },
                    { key: "normal", label: "Normal Level", color: "#f59e0b" },
                    { key: "professional", label: "Professional Level", color: "#ef4444" }
                  ].map(lvl => (
                    <div key={lvl.key}>
                      <label style={{ ...S.label, color: lvl.color }}>{lvl.label}</label>
                      <div style={{ position: "relative" }}>
                        <input 
                          type="number" 
                          value={tempLimits[lvl.key]} 
                          onChange={e => setTempLimits(p => ({ ...p, [lvl.key]: parseInt(e.target.value) || 0 }))}
                          style={{ ...S.input, paddingRight: "3.5rem" }} 
                        />
                        <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", fontWeight: 700, fontSize: "0.85rem" }}>MIN</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={async (e) => {
                    const btn = e.currentTarget;
                    const originalText = "💾 Save Changes";
                    btn.disabled = true;
                    btn.innerText = "⏳ Saving...";
                    try {
                      const newLimits = { ...quizLimits };
                      for (const level of ["easy", "normal", "professional"]) {
                        const timeLimit = tempLimits[level] * 60;
                        const { data: existing, error: selectError } = await supabase.from(TABLES.quizSettings).select("id").eq("level", level).maybeSingle();
                        
                        if (existing) {
                          const { error: upError } = await supabase.from(TABLES.quizSettings).update({ time_limit: timeLimit }).eq("id", existing.id);
                          if (upError) throw upError;
                        } else {
                          const { error: inError } = await supabase.from(TABLES.quizSettings).insert({ level, time_limit: timeLimit });
                          if (inError) throw inError;
                        }
                        newLimits[level] = timeLimit;
                      }
                      setQuizLimits(newLimits);
                      showToast("Quiz settings saved successfully!");
                    } catch (err) {
                      console.error("Save error:", err);
                      showToast(`Error: ${err.message || "Failed to save"}`, "error");
                    } finally {
                      btn.disabled = false;
                      btn.innerText = originalText;
                    }
                  }} 
                  style={{ ...S.btn("#10b981"), width: "100%", padding: "1rem", fontSize: "1.1rem" }}
                >💾 Save Changes</button>
              </div>

              {/* Level Access Control */}
              <div style={{ ...S.card, marginTop: "1.5rem", border: "2px solid rgba(239,68,68,0.2)" }}>
                <h3 style={{ color: "#ef4444", fontWeight: 700, marginBottom: "0.5rem" }}>🔒 Level Access Control</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "1.5rem" }}>
                  Lock a level to prevent students from accessing it. Locked levels will appear disabled on the student screen.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {[
                    { key: "easy", label: "Easy Level", color: "#22c55e", icon: "📝" },
                    { key: "normal", label: "Normal Level", color: "#f59e0b", icon: "📚" },
                    { key: "professional", label: "Professional Level", color: "#ef4444", icon: "⚛️" }
                  ].map(lvl => {
                    const isLocked = lockedLevels[lvl.key];
                    return (
                      <div key={lvl.key} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "1rem 1.25rem",
                        borderRadius: "1rem",
                        background: isLocked ? "rgba(239,68,68,0.08)" : `${lvl.color}08`,
                        border: `2px solid ${isLocked ? "rgba(239,68,68,0.3)" : `${lvl.color}30`}`,
                        transition: "all 0.3s ease"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{ fontSize: "1.5rem" }}>{lvl.icon}</span>
                          <div>
                            <div style={{ color: isLocked ? "#ef4444" : lvl.color, fontWeight: 800, fontSize: "1rem" }}>{lvl.label}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                              {isLocked ? "🔒 Locked – Students cannot access" : "🔓 Open – Students can access"}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const newLocked = !isLocked;
                            try {
                              const { data: existing } = await supabase.from(TABLES.quizSettings).select("id").eq("level", lvl.key).maybeSingle();
                              if (existing) {
                                await supabase.from(TABLES.quizSettings).update({ is_locked: newLocked }).eq("id", existing.id);
                              } else {
                                await supabase.from(TABLES.quizSettings).insert({ level: lvl.key, time_limit: quizLimits[lvl.key], is_locked: newLocked });
                              }
                              setLockedLevels(prev => ({ ...prev, [lvl.key]: newLocked }));
                              showToast(newLocked ? `${lvl.label} locked successfully!` : `${lvl.label} unlocked!`, newLocked ? "error" : "success");
                            } catch (err) {
                              showToast(`Error: ${err.message}`, "error");
                            }
                          }}
                          style={{
                            padding: "0.6rem 1.4rem",
                            borderRadius: "0.875rem",
                            background: isLocked ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                            border: `2px solid ${isLocked ? "#22c55e" : "#ef4444"}`,
                            color: isLocked ? "#22c55e" : "#ef4444",
                            fontWeight: 800,
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            transition: "all 0.3s ease"
                          }}
                          onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
                          onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                        >
                          {isLocked ? "🔓 Unlock" : "🔒 Lock"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QUIZ DATA (from storage) ──────────────────────────────────────────────────
const LEVEL_CONFIG = {
  easy: { label: "Easy", questions: 0, timeLimit: 20 * 60, features: ["skip", "hint"], color: "#22c55e", glow: "rgba(34,197,94,0.4)", icon: "📝" },
  normal: { label: "Normal", questions: 0, timeLimit: 30 * 60, features: ["skip"], color: "#f59e0b", glow: "rgba(245,158,11,0.4)", icon: "📚" },
  professional: { label: "Professional", questions: 0, timeLimit: 40 * 60, features: [], color: "#ef4444", glow: "rgba(239,68,68,0.4)", icon: "⚛️" },
};

// ─── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onTeacher }) {
  const [form, setForm] = useState({ email: "", name: "", department: "" });
  const [errors, setErrors] = useState({});
  const { isDarkMode, toggleTheme } = useContext(ThemeContext);
  
  const validate = () => {
    const e = {};
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email";
    if (form.name.trim().length < 2) e.name = "Name is required";
    if (form.department.trim().length < 2) e.department = "Department is required";
    setErrors(e); return Object.keys(e).length === 0;
  };
  const handleSubmit = (t) => { if (!validate()) return; onLogin({ ...form, testType: t }); };
  const tests = [
    { id: "quiz", label: "Student Quiz", icon: "🎓", desc: "Multiple choice & T/F questions", color: "#8b5cf6" },
    { id: "typing", label: "Typing Test", icon: "⌨️", desc: "Test your typing speed & accuracy", color: "#06b6d4" },
    { id: "code", label: "Code Test", icon: "💻", desc: "Debug and fix code challenges", color: "#10b981" },
  ];
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "600px" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#db2777)", boxShadow: "0 0 30px rgba(124,58,237,0.4)", marginBottom: "0.75rem", fontSize: 28 }}>💡</div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 900, background: "linear-gradient(135deg,var(--text-accent),#f9a8d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>IT Quiz Pro</h1>
          <button onClick={onTeacher} style={{ 
            marginTop: "0.75rem", 
            background: "rgba(251,191,36,0.1)", 
            border: "1px solid rgba(251,191,36,0.4)", 
            color: "var(--text-accent)", 
            padding: "0.4rem 1.25rem", 
            borderRadius: "999px", 
            cursor: "pointer", 
            fontSize: "0.85rem", 
            fontWeight: 800,
            transition: "all 0.3s ease"
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "rgba(251,191,36,0.2)"}
          onMouseOut={(e) => e.currentTarget.style.background = "rgba(251,191,36,0.1)"}
          >🎓 Teacher Login</button>
        </div>
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "1.5rem", padding: "1.5rem", backdropFilter: "blur(20px)" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", color: "var(--text-accent)", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>📧 Email Address</label>
            <input type="email" value={form.email} placeholder="your@email.com" onChange={e => setForm(p => ({ ...p, email: e.target.value }))} 
              style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.75rem", border: errors.email ? "2px solid var(--error-color)" : "2px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: "0.95rem", outline: "none", boxSizing: "border-box", transition: "all 0.3s ease" }}
              onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
              onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
            />
            {errors.email && <p style={{ color: "var(--error-color)", fontSize: "0.75rem", marginTop: "0.3rem", fontWeight: 600 }}>⚠ {errors.email}</p>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            {[{ key: "name", label: "👤 Name", ph: "Full Name" }, { key: "department", label: "🏢 Dept", ph: "Your Dept" }].map(f => (
              <div key={f.key}>
                <label style={{ display: "block", color: "var(--text-accent)", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem" }}>{f.label}</label>
                <input type="text" value={form[f.key]} placeholder={f.ph} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} 
                  style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.75rem", border: errors[f.key] ? "2px solid var(--error-color)" : "2px solid var(--border-color)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: "0.95rem", outline: "none", boxSizing: "border-box", transition: "all 0.3s ease" }}
                  onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
                  onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
                />
                {errors[f.key] && <p style={{ color: "var(--error-color)", fontSize: "0.75rem", marginTop: "0.3rem", fontWeight: 600 }}>⚠ {errors[f.key]}</p>}
              </div>
            ))}
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", textAlign: "center", marginBottom: "1rem" }}>Choose Test Type & Start</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            {tests.map(t => (
              <button key={t.id} onClick={() => handleSubmit(t.id)} style={{ 
                display: "flex", 
                flexDirection: "column",
                alignItems: "center", 
                justifyContent: "center",
                gap: "0.5rem", 
                padding: "1rem 0.5rem", 
                borderRadius: "1rem", 
                border: `2px solid ${t.color}30`, 
                background: "transparent", 
                color: "var(--text-primary)", 
                cursor: "pointer", 
                transition: "all 0.3s ease",
                textAlign: "center"
              }} 
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-5px)";
                e.currentTarget.style.background = `${t.color}10`;
                e.currentTarget.style.borderColor = t.color;
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = `${t.color}30`;
              }}>
                <span style={{ fontSize: "1.5rem" }}>{t.icon}</span>
                <div style={{ fontWeight: 800, color: t.color, fontSize: "0.85rem" }}>{t.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LEVEL SELECT ──────────────────────────────────────────────────────────────
function LevelSelect({ user, onSelect, onBack, quizLimits, refreshSettings, lockedLevels }) {
  useEffect(() => {
    if (refreshSettings) refreshSettings();
  }, []);
  const levels = ["easy", "normal", "professional"].map(key => {
    const timeLimit = quizLimits[key] !== undefined ? quizLimits[key] : LEVEL_CONFIG[key].timeLimit;
    const cfg = { ...LEVEL_CONFIG[key], timeLimit };
    const isLocked = lockedLevels && lockedLevels[key];
    return [key, cfg, isLocked];
  });
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <button onClick={onBack} style={{ 
        position: "absolute", 
        top: "1.5rem", 
        left: "1.5rem", 
        background: "var(--bg-card)", 
        border: "1px solid var(--border-color)", 
        color: "var(--text-primary)", 
        padding: "0.6rem 1.2rem", 
        borderRadius: "0.875rem", 
        cursor: "pointer",
        fontWeight: 600,
        transition: "all 0.3s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem"
      }}
      onMouseOver={e => { e.currentTarget.style.transform = "translateX(-5px)"; e.currentTarget.style.background = "var(--text-accent)10"; }}
      onMouseOut={e => { e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.background = "var(--bg-card)"; }}
      >← Back</button>
      <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: "1.2rem", fontWeight: 500, marginBottom: "0.75rem" }}>Welcome, <span style={{ color: "var(--text-accent)", fontWeight: 800 }}>{user.name}</span></div>
        <h2 style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--text-primary)", letterSpacing: "-1px" }}>Select Your Challenge</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem", maxWidth: "1000px", width: "100%" }}>
        {levels.map(([key, cfg, isLocked]) => (
          <div 
            key={key} 
            onClick={() => !isLocked && onSelect(key)} 
            style={{ 
              background: isLocked ? "var(--bg-card)" : "var(--bg-card)", 
              border: isLocked ? "1px solid rgba(100,116,139,0.3)" : `1px solid ${cfg.color}40`, 
              borderRadius: "2rem", 
              padding: "2.5rem", 
              cursor: isLocked ? "not-allowed" : "pointer", 
              backdropFilter: "blur(20px)",
              transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
              opacity: isLocked ? 0.55 : 1,
              filter: isLocked ? "grayscale(60%)" : "none"
            }}
            onMouseOver={e => {
              if (isLocked) return;
              e.currentTarget.style.transform = "translateY(-15px) scale(1.02)";
              e.currentTarget.style.borderColor = cfg.color;
              e.currentTarget.style.boxShadow = `0 20px 40px ${cfg.color}25`;
              const icon = e.currentTarget.querySelector('.level-icon');
              if (icon) icon.style.transform = "scale(1.3) rotate(10deg)";
            }}
            onMouseOut={e => {
              if (isLocked) return;
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.borderColor = `${cfg.color}40`;
              e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.05)";
              const icon = e.currentTarget.querySelector('.level-icon');
              if (icon) icon.style.transform = "scale(1) rotate(0deg)";
            }}
          >
            {/* Lock Overlay Badge */}
            {isLocked && (
              <div style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.5)",
                borderRadius: "999px",
                padding: "4px 12px",
                color: "#ef4444",
                fontWeight: 800,
                fontSize: "0.78rem",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}>🔒 Locked</div>
            )}
            <div className="level-icon" style={{ fontSize: "3.5rem", marginBottom: "1.5rem", transition: "all 0.4s ease" }}>
              {isLocked ? "🔒" : cfg.icon}
            </div>
            <h3 style={{ fontSize: "1.6rem", fontWeight: 900, color: isLocked ? "var(--text-secondary)" : cfg.color, marginBottom: "0.75rem" }}>{cfg.label}</h3>
            <div style={{ color: "var(--text-primary)", fontSize: "1rem", fontWeight: 700, marginBottom: "1.5rem", background: isLocked ? "rgba(100,116,139,0.1)" : `${cfg.color}15`, padding: "6px 15px", borderRadius: "999px", display: "inline-block" }}>
              {isLocked ? "Not Available" : `⏱ ${Math.floor(cfg.timeLimit / 60)} Minutes`}
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "2rem" }}>
              {isLocked ? "This level has been locked by your teacher." :
               key === 'easy' ? "Basic test for beginners, includes hints and question skipping." : 
               key === 'normal' ? "Intermediate challenge, now includes the skip feature." : 
               "Expert-level challenge, no hints or skips allowed. Focus!"}
            </p>
            <button disabled={isLocked} style={{ 
              width: "100%", 
              padding: "1rem", 
              borderRadius: "1.25rem", 
              background: isLocked ? "rgba(100,116,139,0.15)" : `linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, 
              color: isLocked ? "var(--text-secondary)" : "white", 
              fontWeight: 800, 
              border: isLocked ? "2px solid rgba(100,116,139,0.3)" : "none", 
              cursor: isLocked ? "not-allowed" : "pointer",
              fontSize: "1rem",
              boxShadow: isLocked ? "none" : `0 8px 20px ${cfg.color}40`
            }}>
              {isLocked ? "🔒 Locked by Teacher" : "Start Now →"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuizScreen({ user, level, onFinish, onBack, quizLimits }) {
  const timeLimit = quizLimits[level] !== undefined ? quizLimits[level] : LEVEL_CONFIG[level].timeLimit;
  const cfg = { ...LEVEL_CONFIG[level], timeLimit };
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [selected, setSelected] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(level);
  const [numQuestions, setNumQuestions] = useState(cfg.questions);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  
  // تطبيق الأمان أثناء الاختبار
  useExamSecurity(true);

  useEffect(() => {
    const fetchQs = async () => {
      const qs = await supabaseGet(TABLES.questions);
      if (!qs) {
        setLoading(false);
        return;
      }
      const cfg = LEVEL_CONFIG[level];
      
      let filtered;
      if (level === "adaptive") {
        filtered = qs;
        const numQs = Math.min(10, qs.length);
        setNumQuestions(numQs);
      } else {
        filtered = qs.filter(q => q.level === level);
        if (!filtered.length) filtered = qs;
        // Use all available questions for the selected level
        const numQs = filtered.length;
        setNumQuestions(numQs);
      }

      setQuestions(shuffle(filtered).slice(0, filtered.length).map(q => {
        const opts = [q.option1, q.option2, q.option3, q.option4].filter(o => o && o !== "nan" && o.trim());
        return { ...q, options: shuffle(opts) };
      }));
      setLoading(false);
    };
    fetchQs();
  }, [level]);
  const q = questions[idx];
  const timePct = (timeLeft / cfg.timeLimit) * 100;
  const timerColor = timePct > 50 ? cfg.color : timePct > 20 ? "#f59e0b" : "#ef4444";
  const displayCfg = level === "adaptive" ? LEVEL_CONFIG[currentLevel] : cfg;

  const timeLeftRef = useRef(timeLeft);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  const finishQuiz = useCallback((ans = answers) => { 
    clearInterval(timerRef.current); 
    const timeUsed = cfg.timeLimit - timeLeftRef.current + (timeLeftRef.current === 0 ? 1 : 0);
    onFinish({ questions, answers: ans, level, user, timeUsed }); 
  }, [questions, answers, level, user, onFinish, cfg.timeLimit]);

  const finishRef = useRef(finishQuiz);
  useEffect(() => { finishRef.current = finishQuiz; }, [finishQuiz]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          finishRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSelect = (opt) => {
    const isCorrect = opt === q.correct_answer;
    const newAnswers = [...answers, { question: q, selected: opt, isCorrect }];
    setAnswers(newAnswers);
    const newAnsweredCount = answeredCount + 1;
    setAnsweredCount(newAnsweredCount);
    if (level === "adaptive") {
      // Adjust level
      let newLevel = currentLevel;
      if (isCorrect) {
        if (currentLevel === "easy") newLevel = "normal";
        else if (currentLevel === "normal") newLevel = "professional";
      } else {
        if (currentLevel === "professional") newLevel = "normal";
        else if (currentLevel === "normal") newLevel = "easy";
      }
      setCurrentLevel(newLevel);
    }
    if (newAnsweredCount >= numQuestions) {
      finishQuiz(newAnswers);
      return;
    }
    setIdx(i => i + 1);
    setSelected(null);
    setShowHint(false);
  };
  const handleSkip = () => {
    const newAnswers = [...answers, { question: q, selected: null, isCorrect: false }];
    setAnswers(newAnswers);
    const newAnsweredCount = answeredCount + 1;
    setAnsweredCount(newAnsweredCount);
    
    if (newAnsweredCount >= numQuestions || idx + 1 >= questions.length) {
      finishQuiz(newAnswers);
      return;
    }
    setIdx(i => i + 1);
    setSelected(null);
    setShowHint(false);
  };

  if (!q) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>No questions available for this level.</div>;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "700px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <span style={{ color: "var(--text-secondary)" }}>Q{idx + 1}/{questions.length}</span>
        <span style={{ color: timerColor, fontWeight: 700, fontSize: "1.1rem" }}>⏱ {formatTime(timeLeft)}</span>
      </div>
      <div style={{ width: "100%", maxWidth: "700px", height: 6, background: "rgba(0,0,0,0.1)", borderRadius: 9999, marginBottom: "1.5rem", overflow: "hidden", border: "1px solid var(--border-color)" }}>
        <div style={{ height: "100%", width: `${timePct}%`, background: timerColor, borderRadius: 9999, transition: "width 1s linear", boxShadow: `0 0 10px ${timerColor}40` }} />
      </div>
      <div style={{ width: "100%", maxWidth: "700px", background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <span style={{ background: "rgba(139,92,246,0.2)", color: "var(--text-accent)", fontSize: "0.78rem", padding: "3px 10px", borderRadius: "999px" }}>{q.category}</span>
        </div>
        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: "1.75rem" }}>{q.question}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => handleSelect(opt)} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1.25rem", borderRadius: "1rem", cursor: "pointer", textAlign: "left", border: "2px solid rgba(255,255,255,0.1)", background: "rgba(30,41,59,0.7)", color: "#cbd5e1" }}>
              <span style={{ minWidth: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.08)", color: "white", fontSize: "0.8rem", fontWeight: 700 }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span style={{ fontSize: "0.95rem" }}>{opt}</span>
            </button>
          ))}
        </div>
        {showHint && q.hint && <div style={{ background: "rgba(139,92,246,0.15)", border: "1px solid var(--text-accent)", borderRadius: "0.75rem", padding: "0.75rem 1rem", marginBottom: "1rem" }}><span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600 }}>💡 {q.hint}</span></div>}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {cfg.features.includes("hint") && <button onClick={() => setShowHint(s => !s)} style={{ padding: "0.85rem 1.25rem", borderRadius: "0.875rem", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24", cursor: "pointer" }}>💡</button>}
          {cfg.features.includes("skip") && <button onClick={handleSkip} style={{ padding: "0.85rem 1.25rem", borderRadius: "0.875rem", background: "rgba(100,116,139,0.15)", border: "1px solid rgba(100,116,139,0.3)", color: "var(--text-secondary)", cursor: "pointer" }}>Skip ⏭</button>}
        </div>
      </div>
    </div>
  );
}

// ─── QUIZ RESULTS ──────────────────────────────────────────────────────────────
function ResultsScreen({ data, onRetry, onHome }) {
  const { questions, answers, level, user } = data;
  const correct = answers.filter(a => a.isCorrect).length;
  const total = answers.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { grade, color, label } = calcGrade(pct);
  const cfg = LEVEL_CONFIG[level];

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1.5rem", position: "relative", zIndex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "1.5rem", padding: "2.5rem", marginBottom: "1.5rem", textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color, marginBottom: "0.5rem" }}>{pct}%</div>
          <div style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{label}</div>
          <div style={{ display: "inline-block", background: `${color}20`, border: `2px solid ${color}`, color, padding: "4px 20px", borderRadius: "999px", fontWeight: 800, fontSize: "1.4rem" }}>{grade}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginTop: "2rem" }}>
            {[{ label: "Correct", value: correct, col: "#22c55e" }, { label: "Total", value: total, col: cfg.color }, { label: "Level", value: cfg.label, col: "var(--text-accent)" }].map((s, i) => (
              <div key={i} style={{ background: `${s.col}10`, border: `1px solid ${s.col}30`, borderRadius: "1rem", padding: "1rem" }}>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: s.col }}>{s.value}</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "1.5rem", padding: "1.75rem", marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-accent)", fontWeight: 700, marginBottom: "1.25rem" }}>📋 Answer Review</h3>
          <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem", paddingRight: "0.5rem" }}>
            {answers.map((a, i) => (
              <div key={i} style={{ 
                padding: "1rem 1.5rem", 
                borderRadius: "1.25rem", 
                border: `1px solid ${a.isCorrect ? "#22c55e40" : "#ef444440"}`, 
                background: a.isCorrect ? "#22c55e08" : "#ef444408",
                position: "relative"
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontWeight: 700 }}>{i + 1}.</span>
                  <span style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{a.question.question}</span>
                  <span style={{ fontSize: "1.1rem" }}>{a.isCorrect ? "✅" : "❌"}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", marginLeft: "1.75rem", fontSize: "0.8rem" }}>
                  {a.selected && !a.isCorrect && (
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>
                      Yours: {a.selected}
                    </div>
                  )}
                  {!a.selected && !a.isCorrect && (
                    <div style={{ color: "#ef4444", fontWeight: 600, fontStyle: "italic" }}>
                      Skipped
                    </div>
                  )}
                  <div style={{ color: "#22c55e", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span>✓ Correct: {a.question.correct_answer}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button onClick={onRetry} style={{ flex: 1, padding: "1rem", borderRadius: "1rem", background: `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`, color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}>🔄 Try Again</button>
          <button onClick={onHome} style={{ 
            flex: 1, 
            padding: "1rem", 
            borderRadius: "1rem", 
            background: "var(--bg-card)", 
            color: "var(--text-primary)", 
            fontWeight: 700, 
            border: "1px solid var(--border-color)", 
            cursor: "pointer",
            transition: "all 0.3s ease"
          }}
          onMouseOver={e => e.currentTarget.style.background = "var(--text-accent)10"}
          onMouseOut={e => e.currentTarget.style.background = "var(--bg-card)"}
          >🏠 Home</button>
        </div>
      </div>
    </div>
  );
}

// ─── TYPING TEST ───────────────────────────────────────────────────────────────
function TypingTest({ user, onFinish, onBack }) {
  const { isDarkMode } = useContext(ThemeContext);
  const [levelKey, setLevelKey] = useState("easy");
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [allTexts, setAllTexts] = useState([]);
  const [textObj, setTextObj] = useState({ text: "Loading...", time_limit: 60 });
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(60);
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const inputValRef = useRef(input);
  const timeLeftRef = useRef(timeLeft);
  
  // تطبيق الأمان أثناء الاختبار
  useExamSecurity(true);

  useEffect(() => { inputValRef.current = input; }, [input]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  useEffect(() => {
    const fetchTexts = async () => {
      setLoading(true);
      const data = await supabaseGet(TABLES.typingTexts);
      setAllTexts(data || []);
      
      // Support both 'professional' and legacy 'difficult' keys
      const searchKey = levelKey === "professional" ? ["professional", "difficult"] : [levelKey];
      const filtered = data?.filter(t => searchKey.includes(t.level)) || [];
      
      const selected = filtered[Math.floor(Math.random() * filtered.length)] || { text: "The quick brown fox jumps over the lazy dog.", time_limit: 60 };
      setTextObj(selected);
      setTimeLeft(selected.time_limit);
      setLoading(false);
    };
    fetchTexts();
  }, [levelKey]);

  const text = textObj.text;

  const submitTest = useCallback(() => {
    clearInterval(timerRef.current);
    const currentInput = inputValRef.current;
    const currentTimeLeft = timeLeftRef.current;
    
    const correct = currentInput.split("").filter((c, i) => c === text[i]).length;
    const incorrect = currentInput.split("").filter((c, i) => c !== text[i] && i < currentInput.length).length;
    const missed = text.length - currentInput.length;
    const totalChars = text.length;
    const score = totalChars > 0 ? Math.round((correct / totalChars) * 100) : 0;
    const words = currentInput.trim().split(/\s+/).filter(Boolean).length;
    const elapsed = textObj.time_limit - currentTimeLeft + 1;
    const wpm = Math.round((words / Math.max(elapsed, 1)) * 60);
    const accuracy = currentInput.length > 0 ? Math.round((correct / currentInput.length) * 100) : 0;
    
    onFinish({ 
      type: "typing", 
      correct, 
      incorrect, 
      missed,
      totalChars,
      score, 
      wpm, 
      accuracy,
      level: levelKey, 
      time: elapsed,
      timeLimit: textObj.time_limit,
      timeUsed: elapsed,
      timeLeft: currentTimeLeft
    });
  }, [text, textObj.time_limit, levelKey, onFinish]);

  const submitTestRef = useRef(submitTest);
  useEffect(() => { submitTestRef.current = submitTest; }, [submitTest]);

  useEffect(() => {
    if (!started) return;
    timerRef.current = setInterval(() => setTimeLeft(t => { 
      if (t <= 1) { 
        clearInterval(timerRef.current); 
        submitTestRef.current(); 
        return 0; 
      } 
      return t - 1; 
    }), 1000);
    return () => clearInterval(timerRef.current);
  }, [started]);

  const timePct = (timeLeft / textObj.time_limit) * 100;
  const timerColor = timePct > 50 ? "#22c55e" : timePct > 20 ? "#f59e0b" : "#ef4444";
  const levels = [...new Set(allTexts.map(t => t.level))];
  if (!levels.length) levels.push("easy", "normal", "difficult");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <button onClick={onBack} style={{ 
        position: "absolute", 
        top: "1.5rem", 
        left: "1.5rem", 
        background: "var(--bg-card)", 
        border: "1px solid var(--border-color)", 
        color: "var(--text-primary)", 
        padding: "0.6rem 1.2rem", 
        borderRadius: "0.875rem", 
        cursor: "pointer",
        fontWeight: 600,
        transition: "all 0.3s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem"
      }}
      onMouseOver={e => { e.currentTarget.style.transform = "translateX(-5px)"; e.currentTarget.style.background = "var(--text-accent)10"; }}
      onMouseOut={e => { e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.background = "var(--bg-card)"; }}
      >← Back</button>
      <div style={{ width: "100%", maxWidth: "680px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}><div style={{ fontSize: "2.5rem" }}>⌨️</div><h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text-primary)" }}>Typing Speed Test</h2></div>
        <div style={{ background: "var(--bg-card)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)" }}>
          {!started ? (
            <>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {["easy", "normal", "professional"].map(l => {
                  const cfg = LEVEL_CONFIG[l] || { color: "#64748b" };
                  const active = levelKey === l;
                  return (
                    <button 
                      key={l} 
                      onClick={() => setLevelKey(l)} 
                      style={{ 
                        flex: 1, 
                        padding: "1rem", 
                        borderRadius: "1rem", 
                        border: active ? `2px solid ${cfg.color}` : "2px solid var(--border-color)", 
                        background: active ? `${cfg.color}15` : "var(--bg-card)", 
                        color: active ? cfg.color : "var(--text-primary)", 
                        cursor: "pointer", 
                        fontWeight: 900, 
                        textTransform: "capitalize",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        fontSize: "1rem",
                        textAlign: "center"
                      }}
                      onMouseOver={e => {
                        if (!active) {
                          e.currentTarget.style.borderColor = cfg.color;
                          e.currentTarget.style.transform = "translateY(-3px)";
                          e.currentTarget.style.background = `${cfg.color}08`;
                        }
                      }}
                      onMouseOut={e => {
                        if (!active) {
                          e.currentTarget.style.borderColor = "var(--border-color)";
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.background = "var(--bg-card)";
                        }
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.5rem" }}>
                <p style={{ color: "var(--text-primary)", fontFamily: "monospace", lineHeight: 1.7, fontSize: "1rem", margin: 0, opacity: 0.8 }}>{text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", color: "var(--text-accent)", fontWeight: 800, fontSize: "1.1rem" }}>
                  <span>⏱ Time Limit:</span>
                  <span style={{ background: "var(--text-accent)20", padding: "4px 12px", borderRadius: "999px" }}>{textObj.time_limit} Seconds</span>
                </div>
              </div>
              <button onClick={() => { setStarted(true); setInput(""); setTimeLeft(textObj.time_limit); setTimeout(() => inputRef.current?.focus(), 100); }} style={{ width: "100%", padding: "1.25rem", borderRadius: "1.25rem", background: "linear-gradient(135deg,#06b6d4,#0284c7)", color: "white", fontWeight: 800, border: "none", cursor: "pointer", fontSize: "1.1rem", boxShadow: "0 10px 20px rgba(6,182,212,0.3)" }}>🚀 Start Typing Now</button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Type the text below</span>
                <span style={{ color: timerColor, fontWeight: 800, fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  ⏱ {formatTime(timeLeft)}
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(0,0,0,0.1)", borderRadius: 9999, marginBottom: "1.5rem", overflow: "hidden", border: "1px solid var(--border-color)" }}>
                <div style={{ height: "100%", width: `${timePct}%`, background: timerColor, borderRadius: 9999, transition: "width 1s linear", boxShadow: `0 0 10px ${timerColor}40` }} />
              </div>
              
              <div style={{ 
                background: "var(--bg-card)", 
                border: "2px solid var(--border-color)",
                borderRadius: "1.5rem", 
                padding: "2rem", 
                marginBottom: "1.5rem", 
                fontFamily: "'Fira Code', monospace", 
                fontSize: "1.25rem", 
                lineHeight: 2, 
                letterSpacing: "0.05em",
                userSelect: "none", 
                boxShadow: "inset 0 2px 15px rgba(0,0,0,0.05)",
                position: "relative",
                overflow: "hidden"
              }}
                onContextMenu={e => e.preventDefault()}
              >
                {text.split("").map((char, i) => { 
                  const typed = input[i]; 
                  let color = isDarkMode ? "var(--text-secondary)" : "var(--text-primary)";
                  let opacity = isDarkMode ? 0.4 : 0.8;
                  let bg = "transparent";
                  let borderBottom = "none";
                  
                  if (typed !== undefined) {
                    opacity = 1;
                    if (typed === char) {
                      color = "#10b981"; // Emerald Green
                    } else {
                      color = "#ef4444"; // Vivid Red
                      bg = "rgba(239,68,68,0.15)";
                      borderBottom = "2px solid #ef4444";
                    }
                  } else if (i === input.length) {
                    bg = "var(--text-accent)25"; // Cursor highlight
                    borderBottom = "2px solid var(--text-accent)";
                    opacity = 1;
                  }
                  
                  return (
                    <span key={i} style={{ 
                      color, 
                      background: bg, 
                      opacity,
                      borderBottom,
                      borderRadius: typed !== undefined && typed !== char ? "4px" : "0",
                      transition: "all 0.1s ease",
                      padding: "1px 0"
                    }}>
                      {char}
                    </span>
                  ); 
                })}
              </div>

              <textarea 
                ref={inputRef} 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="Start typing the text above..." 
                onCopy={e => e.preventDefault()}
                onPaste={e => e.preventDefault()}
                onCut={e => e.preventDefault()}
                onContextMenu={e => e.preventDefault()}
                style={{ 
                  width: "100%", 
                  padding: "1.25rem", 
                  borderRadius: "1.25rem", 
                  background: "var(--bg-card)", 
                  border: "2px solid var(--border-color)", 
                  color: "var(--text-primary)", 
                  fontFamily: "'Outfit', sans-serif", 
                  fontSize: "1.1rem", 
                  fontWeight: 500,
                  resize: "none", 
                  outline: "none", 
                  height: "120px", 
                  boxSizing: "border-box",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
                }}
                onFocus={e => {
                  e.target.style.borderColor = "var(--text-accent)";
                  e.target.style.boxShadow = "0 8px 24px var(--text-accent)15";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "var(--border-color)";
                  e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                }}
              />
              <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}>
                <button onClick={submitTest} style={{ 
                  padding: "1rem 4rem", 
                  borderRadius: "1.25rem", 
                  background: "linear-gradient(135deg,#10b981,#059669)", 
                  color: "white", 
                  fontWeight: 800, 
                  fontSize: "1.1rem",
                  border: "none", 
                  cursor: "pointer",
                  boxShadow: "0 10px 25px rgba(16,185,129,0.3)",
                  transition: "all 0.3s ease"
                }}
                onMouseOver={e => e.currentTarget.style.transform = "translateY(-3px) scale(1.02)"}
                onMouseOut={e => e.currentTarget.style.transform = "translateY(0) scale(1)"}
                >✅ Finish & Submit</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingResults({ data, onRetry, onHome }) {
  const { correct, incorrect, missed, totalChars, score, wpm, accuracy, level, timeLimit, timeUsed, timeLeft } = data;
  const { grade, color, label } = calcGrade(score);
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.easy;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "650px" }}>
        <div style={{ 
          background: "var(--bg-card)", 
          border: `2px solid ${cfg.color}40`, 
          borderRadius: "2rem", 
          padding: "3rem", 
          backdropFilter: "blur(20px)", 
          textAlign: "center",
          boxShadow: `0 20px 50px ${cfg.color}15`
        }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>{cfg.icon}</div>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color: cfg.color, marginBottom: "0.25rem" }}>{score}%</div>
          <div style={{ color: "var(--text-secondary)", fontSize: "1.1rem", fontWeight: 600, marginBottom: "2rem" }}>{label}</div>
          
          {/* Main Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.25rem", marginBottom: "2rem" }}>
            {[
              { label: "WPM", value: wpm, col: "#f59e0b", icon: "⌨️" }, 
              { label: "Accuracy", value: `${accuracy}%`, col: "#22c55e", icon: "🎯" }, 
              { label: "Level", value: cfg.label, col: cfg.color, icon: "📊" }
            ].map((s, i) => (
              <div key={i} style={{ background: `${s.col}10`, border: `1px solid ${s.col}30`, borderRadius: "1.25rem", padding: "1.25rem" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, color: s.col }}>{s.value}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 700, marginTop: "0.25rem" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Detailed Stats */}
          <div style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "1.25rem", padding: "1.5rem", marginBottom: "2rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              {[
                { label: "Correct", value: correct, col: "#22c55e" },
                { label: "Incorrect", value: incorrect, col: "#ef4444" },
                { label: "Time Used", value: `${timeUsed}s`, col: "var(--text-accent)" }
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: s.col }}>{s.value}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.25rem" }}>
            <button onClick={onRetry} style={{ 
              flex: 1, 
              padding: "1.1rem", 
              borderRadius: "1.25rem", 
              background: `linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, 
              color: "white", 
              fontWeight: 800, 
              border: "none", 
              cursor: "pointer",
              boxShadow: `0 10px 20px ${cfg.color}30`,
              fontSize: "1.1rem"
            }}>🔄 Try Again</button>
            <button onClick={onHome} style={{ 
              flex: 1, 
              padding: "1.1rem", 
              borderRadius: "1.25rem", 
              background: "var(--bg-card)", 
              color: "var(--text-primary)", 
              fontWeight: 800, 
              border: "2px solid var(--border-color)", 
              cursor: "pointer",
              fontSize: "1.1rem"
            }}>🏠 Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CODE TEST ─────────────────────────────────────────────────────────────────
function CodeTest({ user, onFinish, onBack }) {
  const [levelKey, setLevelKey] = useState("easy");
  const [answer, setAnswer] = useState("");
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelTimes, setLevelTimes] = useState({ easy: 120, normal: 120, professional: 120 });
  const [startedLevels, setStartedLevels] = useState({});
  
  // تطبيق الأمان أثناء الاختبار
  useExamSecurity(true);

  useEffect(() => {
    const fetchCodes = async () => {
      const cs = await supabaseGet(TABLES.buggyCode);
      setCodes(cs || []);
      const times = { easy: 120, normal: 120, professional: 120 };
      (cs || []).forEach(c => { if (c.time_limit) times[c.level] = c.time_limit; });
      setLevelTimes(times);
      setLoading(false);
    };
    fetchCodes();
  }, []);

  const code = codes.find(c => c.level === levelKey || (levelKey === "professional" && c.level === "difficult")) || (codes.length ? codes[0] : null);
  const timeLeft = levelTimes[levelKey] || 120;
  const isTimerStarted = startedLevels[levelKey] || false;

  useEffect(() => {
    const timer = setInterval(() => {
      setLevelTimes(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(startedLevels).forEach(lvl => {
          if (startedLevels[lvl] && next[lvl] > 0) {
            next[lvl] -= 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [startedLevels]);

  // Check if any level reached zero and trigger submit if it's the current level
  useEffect(() => {
    if (startedLevels[levelKey] && levelTimes[levelKey] <= 0) {
      handleSubmit();
    }
  }, [levelTimes, levelKey, startedLevels]);

  const calcSimilarity = (user, target) => {
    // دالة لتنظيف الكود من المسافات، التعليقات، والأسطر الفارغة لضمان عدالة التصحيح
    const normalize = s => s.replace(/\s+/g, "").replace(/\/\/.*$|\/\*[\s\S]*?\*\/|#.*$/gm, "").toLowerCase();
    
    const nu = normalize(user);
    const nt = normalize(target);
    
    if (!nu) return 0;
    
    // الحالة 1: تطابق كامل (بعد التنظيف)
    if (nu === nt) return 100;
    
    // الحالة 2: الطالب كتب فقط الجزء الصحيح (إذا كان الجزء المكتوب أكثر من 4 أحرف وموجود في الكود الصحيح)
    if (nu.length >= 4 && nt.includes(nu)) return 100;
    
    // الحالة 3: الطالب كتب الكود الصحيح مع إضافات بسيطة
    if (nt.length >= 4 && nu.includes(nt)) return 100;

    // الحالة 4: حساب نسبة التشابه كخيار احتياطي (Fuzzy Match)
    let matches = 0;
    const minLen = Math.min(nu.length, nt.length);
    const maxLen = Math.max(nu.length, nt.length);
    
    for (let i = 0; i < minLen; i++) {
      if (nu[i] === nt[i]) matches++;
    }
    
    const baseScore = Math.round((matches / maxLen) * 100);
    // إذا كان الكود يحتوي على كلمات مفتاحية صحيحة نزيد الدرجة قليلاً
    const bonus = (nu.includes("return") && nt.includes("return")) ? 5 : 0;
    
    return Math.min(100, baseScore + bonus);
  };

  const handleSubmit = () => {
    if (!code) return;
    const pct = calcSimilarity(answer, code.correct_code);
    const { grade } = calcGrade(pct);
    onFinish({ type: "code", percentage: pct, grade, level: levelKey, student: answer, correct: code.correct_code });
  };

  const levels = ["easy", "normal", "professional"];

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <button onClick={onBack} style={{ 
            position: "absolute",
            left: 0,
            background: "var(--bg-card)", 
            border: "1px solid var(--border-color)", 
            color: "var(--text-primary)", 
            padding: "0.6rem 1.2rem", 
            borderRadius: "0.875rem", 
            cursor: "pointer",
            fontWeight: 600,
            transition: "all 0.3s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem"
          }}
          onMouseOver={e => { e.currentTarget.style.transform = "translateX(-5px)"; e.currentTarget.style.background = "var(--text-accent)10"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.background = "var(--bg-card)"; }}
          >← Back</button>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--text-primary)", margin: "0 auto" }}>💻 Code Debugging Test</h2>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            {[
              { key: "easy", label: "Easy", color: "#10b981" },
              { key: "normal", label: "Normal", color: "#f59e0b" },
              { key: "professional", label: "Professional", color: "#ef4444" }
            ].map(l => (
              <button key={l.key} onClick={() => { setLevelKey(l.key); setAnswer(""); }} style={{ 
                padding: "0.75rem 1.5rem", 
                borderRadius: "1rem", 
                border: levelKey === l.key ? `2px solid ${l.color}` : "2px solid var(--border-color)", 
                background: levelKey === l.key ? `${l.color}20` : "var(--bg-card)", 
                color: levelKey === l.key ? l.color : "var(--text-secondary)", 
                cursor: "pointer", 
                fontWeight: 700,
                fontSize: "1rem",
                transition: "all 0.3s ease"
              }}>{l.label}</button>
            ))}
          </div>

            <div style={{ 
              position: "fixed",
              top: "5rem",
              right: "2rem",
              zIndex: 1000,
              padding: "0.75rem 1.75rem", 
              borderRadius: "1.25rem", 
              background: !isTimerStarted ? "rgba(148,163,184,0.15)" : (timeLeft < 10 ? "rgba(239,68,68,0.25)" : "var(--bg-card)"), 
              border: `3px solid ${!isTimerStarted ? "var(--border-color)" : (timeLeft < 10 ? "#ef4444" : "var(--text-accent)")}`,
              color: !isTimerStarted ? "var(--text-secondary)" : (timeLeft < 10 ? "#fca5a5" : "var(--text-accent)"),
              fontWeight: 900,
              fontSize: "1.4rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              boxShadow: isTimerStarted ? (timeLeft < 10 ? "0 0 25px rgba(239,68,68,0.4)" : "0 10px 30px rgba(0,0,0,0.3)") : "none",
              backdropFilter: "blur(15px)",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              animation: isTimerStarted && timeLeft < 10 ? "pulse 1s infinite" : "none"
            }}>
              {isTimerStarted ? `⏱ ${timeLeft}s` : "⏱ Focus to Start"}
            </div>
          </div>
          {code && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)", boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
              <p style={{ color: "var(--text-accent)", fontSize: "1rem", fontWeight: 700, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.2rem" }}>📋</span> {code.description}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                <div>
                  <div style={{ color: "#fca5a5", fontSize: "0.85rem", fontWeight: 800, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>⚠️ Buggy Code</div>
                  <div style={{ background: "#0f172a", borderRadius: "1rem", padding: "1.5rem", border: "2px solid rgba(239,68,68,0.3)", boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)" }}>
                    <pre style={{ color: "#f8fafc", fontFamily: "'Fira Code', monospace", fontSize: "0.95rem", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{code.buggy_code}</pre>
                  </div>
                </div>
                <div>
                  <div style={{ color: "#6ee7b7", fontSize: "0.85rem", fontWeight: 800, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>✏️ Your Correction</div>
                  <textarea 
                    value={answer} 
                    onFocus={() => setStartedLevels(p => ({ ...p, [levelKey]: true }))}
                    onChange={e => setAnswer(e.target.value)} 
                    placeholder="Click here to start typing your solution..." 
                    style={{ 
                      width: "100%", 
                      height: "220px", 
                      background: "var(--input-bg)", 
                      border: `2px solid ${isTimerStarted ? (levelKey === "easy" ? "#10b981" : levelKey === "normal" ? "#f59e0b" : "#ef4444") : "var(--border-color)"}`, 
                      borderRadius: "1.25rem", 
                      padding: "1.5rem", 
                      color: "var(--text-primary)", 
                      fontFamily: "'Fira Code', monospace", 
                      fontSize: "1rem", 
                      lineHeight: 1.7, 
                      resize: "none", 
                      outline: "none", 
                      boxSizing: "border-box",
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: isTimerStarted ? `0 0 20px ${levelKey === "easy" ? "#10b98120" : levelKey === "normal" ? "#f59e0b20" : "#ef444420"}` : "none",
                      backdropFilter: "blur(10px)"
                    }} 
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: "2rem" }}>
                <button onClick={handleSubmit} disabled={!answer.trim()} style={{ 
                  padding: "1rem 3.5rem", 
                  borderRadius: "1.25rem", 
                  background: answer.trim() ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(148,163,184,0.1)", 
                  color: answer.trim() ? "white" : "var(--text-secondary)", 
                  fontWeight: 800, 
                  fontSize: "1.1rem",
                  border: "none", 
                  cursor: answer.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: answer.trim() ? "0 10px 25px rgba(16,185,129,0.3)" : "none",
                  transform: answer.trim() ? "scale(1)" : "scale(0.98)"
                }}
                onMouseOver={e => answer.trim() && (e.currentTarget.style.transform = "translateY(-3px) scale(1.05)")}
                onMouseOut={e => answer.trim() && (e.currentTarget.style.transform = "translateY(0) scale(1)")}
                >🚀 Submit Solution</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function CodeResults({ data, onRetry, onHome }) {
  const { percentage, grade, level, student, correct } = data;
  const { color, label } = calcGrade(percentage);
  
  return (
    <div style={{ minHeight: "100vh", padding: "3rem 1.5rem", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 1, overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: "800px" }}>
        {/* Main Stats Card */}
        <div style={{ 
          background: "var(--bg-card)", 
          border: `2px solid ${color}40`, 
          borderRadius: "2.5rem", 
          padding: "3rem 2rem", 
          backdropFilter: "blur(25px)", 
          textAlign: "center", 
          marginBottom: "2rem",
          boxShadow: `0 25px 60px ${color}15`,
          position: "relative",
          overflow: "hidden"
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "6px", background: color }} />
          
          <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--text-primary)", marginBottom: "2rem" }}>Results Summary</div>

          {/* Stats Grid - Percentage, Grade and Level */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1.25rem", maxWidth: "600px", margin: "0 auto" }}>
            {[
              { label: "Percentage Score", value: `${percentage}%`, col: color, icon: "🎯" },
              { label: "Final Grade", value: grade, col: color, icon: "🎓" }, 
              { label: "Level", value: level.charAt(0).toUpperCase() + level.slice(1), col: "var(--text-accent)", icon: "📈" }
            ].map((s, i) => (
              <div key={i} style={{ background: `${s.col}10`, border: `1px solid ${s.col}30`, borderRadius: "1.5rem", padding: "1.25rem" }}>
                <div style={{ fontSize: "1.8rem", fontWeight: 900, color: s.col }}>{s.value}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 700, marginTop: "0.5rem" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Code Comparison Section */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
          {[
            { title: "Your Submission", code: student, accent: "#3b82f6", icon: "👤" },
            { title: "Expected Solution", code: correct, accent: "#10b981", icon: "✅" }
          ].map((item, i) => (
            <div key={i} style={{ 
              background: "var(--bg-card)", 
              border: "1px solid var(--border-color)", 
              borderRadius: "1.5rem", 
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
                <span style={{ color: item.accent, fontWeight: 800, fontSize: "0.9rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.title}</span>
              </div>
              <div style={{ 
                background: "#0f172a", 
                borderRadius: "1rem", 
                padding: "1.5rem", 
                border: `1px solid ${item.accent}30`,
                flex: 1,
                boxShadow: "inset 0 2px 10px rgba(0,0,0,0.3)"
              }}>
                <pre style={{ 
                  color: "#e2e8f0", 
                  fontFamily: "'Fira Code', monospace", 
                  fontSize: "0.9rem", 
                  lineHeight: 1.7, 
                  margin: 0, 
                  whiteSpace: "pre-wrap", 
                  overflowX: "auto" 
                }}>{item.code}</pre>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Action Buttons */}
        <div style={{ display: "flex", gap: "1.25rem", justifyContent: "center", alignItems: "center", maxWidth: "500px", margin: "0 auto" }}>
          <button onClick={onHome} style={{ 
            flex: 1,
            padding: "1.1rem", 
            borderRadius: "1.25rem", 
            background: "var(--bg-card)", 
            color: "var(--text-primary)", 
            fontWeight: 800, 
            fontSize: "1.1rem",
            border: "2px solid var(--border-color)", 
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem"
          }}
          onMouseOver={e => { e.currentTarget.style.background = "var(--text-accent)10"; e.currentTarget.style.borderColor = "var(--text-accent)40"; }}
          onMouseOut={e => { e.currentTarget.style.background = "var(--bg-card)"; e.currentTarget.style.borderColor = "var(--border-color)"; }}
          >🏠 Home</button>

          <button onClick={onRetry} style={{ 
            flex: 1.5,
            padding: "1.1rem", 
            borderRadius: "1.25rem", 
            background: `linear-gradient(135deg, ${color}, ${color}cc)`, 
            color: "white", 
            fontWeight: 800, 
            fontSize: "1.1rem",
            border: "none", 
            cursor: "pointer",
            boxShadow: `0 10px 25px ${color}30`,
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem"
          }}
          onMouseOver={e => e.currentTarget.style.transform = "translateY(-3px)"}
          onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
          >🔄 Try Again</button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [teacher, setTeacher] = useState(() => storageGet(STORAGE_KEYS.activeTeacher));
  const [screen, setScreen] = useState(() => storageGet(STORAGE_KEYS.activeTeacher) ? "teacherDash" : "login");
  const [user, setUser] = useState(null);
  const [level, setLevel] = useState(null);
  const [results, setResults] = useState(null);
  const [quizLimits, setQuizLimits] = useState({
    easy: 20 * 60,
    normal: 30 * 60,
    professional: 40 * 60
  });
  const [lockedLevels, setLockedLevels] = useState({ easy: false, normal: false, professional: false });
  const { isDarkMode, toggleTheme } = useContext(ThemeContext);
  const logRef = useRef(null);
  const isSavingRef = useRef(false);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncAll = useCallback(async () => {
    if (!isOnline) return;
    console.log("Syncing data to online database...");
    const tablesToSync = Object.values(TABLES);
    for (const table of tablesToSync) {
      // Find unsynced
      const unsynced = await db.table(table).where("synced").equals(0).toArray();
      for (const item of unsynced) {
        const { id, synced, ...data } = item;
        try {
          const { error } = await supabase.from(table).insert([data]);
          if (!error) await db.table(table).update(id, { synced: 1 });
        } catch (err) { console.error(`Sync error for ${table}:`, err); }
      }
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) syncAll();
  }, [isOnline, syncAll]);

  const fetchQuizSettings = useCallback(async () => {
    console.log("Fetching quiz settings...");
    const data = await supabaseGet(TABLES.quizSettings);
    if (data && data.length) {
      console.log("Settings found in DB:", data);
      setQuizLimits(prev => {
        const next = { ...prev };
        data.forEach(s => {
          if (next[s.level] !== undefined) next[s.level] = s.time_limit;
        });
        return next;
      });
      setLockedLevels(prev => {
        const next = { ...prev };
        data.forEach(s => {
          if (s.is_locked !== undefined) next[s.level] = s.is_locked;
        });
        return next;
      });
    } else {
      console.log("No custom quiz settings found, using defaults.");
    }
  }, []);

  useEffect(() => {
    fetchQuizSettings();
  }, [fetchQuizSettings]);

  useEffect(() => {
    const checkInterruptedSession = async () => {
      const oldId = storageGet("itquiz_active_student_log_id");
      if (oldId) {
        await logStudentLogout(oldId);
        storageSet("itquiz_active_student_log_id", null);
      }
    };
    checkInterruptedSession();
  }, []);

  const handleLogin = async (u) => {
    // Clear teacher session if student logs in to prevent refresh issues
    storageSet(STORAGE_KEYS.activeTeacher, null);
    setTeacher(null);
    
    setUser(u);
    const logId = await logStudentLogin(u);
    logRef.current = logId;
    if (logId) storageSet("itquiz_active_student_log_id", logId);
    setScreen(u.testType === "quiz" ? "levelSelect" : u.testType === "typing" ? "typing" : "code");
  };
  const goHome = async () => {
    const logId = logRef.current || storageGet("itquiz_active_student_log_id");
    if (logId) { 
      await logStudentLogout(logId); 
      logRef.current = null; 
      storageSet("itquiz_active_student_log_id", null);
    }
    setScreen("login"); setUser(null); setLevel(null); setResults(null);
  };
  const handleQuizFinish = useCallback((data) => { 
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const correct = data.answers.filter(a => a.isCorrect).length;
    const total = data.answers.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const grade = calcGrade(percentage);
    
    if (user) {
      saveResult("quiz", { 
        name: user.name, 
        email: user.email, 
        department: user.department, 
        level: data.level, 
        percentage, 
        grade: grade.grade, 
        score: correct, 
        totalQuestions: total, 
        timeUsed: data.timeUsed || 0 
      }); 
    }
    setResults(data); 
    setScreen("quizResults"); 
    setTimeout(() => { isSavingRef.current = false; }, 2000);
  }, [user]);

  const handleTypingFinish = useCallback((data) => { 
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    if (user) {
      saveResult("typing", { 
        name: user.name, 
        email: user.email, 
        department: user.department, 
        level: data.level, 
        percentage: data.accuracy, 
        accuracy: data.accuracy,
        score: data.correct, 
        wpm: data.wpm, 
        timeUsed: data.timeUsed 
      }); 
    }
    setResults(data); 
    setScreen("typingResults"); 
    setTimeout(() => { isSavingRef.current = false; }, 2000);
  }, [user]);

  const handleCodeFinish = useCallback((data) => { 
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    if (user) {
      saveResult("code", { 
        name: user.name, 
        email: user.email, 
        department: user.department, 
        level: data.level, 
        percentage: data.percentage, 
        score: data.percentage, 
        grade: data.grade, 
        timeUsed: data.timeUsed || 0 
      }); 
    }
    setResults(data); 
    setScreen("codeResults"); 
    setTimeout(() => { isSavingRef.current = false; }, 2000);
  }, [user]);

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "var(--bg-primary)", 
      color: "var(--text-primary)", 
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      transition: "all 0.3s ease"
    }}>
      {/* Global Theme Toggle Button (Icon Only) - Only shown on Login Screen */}
      {/* Global Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          background: "var(--bg-card)",
          border: "2px solid var(--border-color)",
          color: "var(--text-accent)",
          cursor: "pointer",
          fontSize: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)"
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = "scale(1.1) rotate(15deg)";
          e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = "scale(1) rotate(0deg)";
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.15)";
        }}
      >
        {isDarkMode ? "☀️" : "🌙"}
      </button>

      {/* Connectivity Indicator */}
      <div style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        zIndex: 9999,
        padding: "0.5rem 1rem",
        borderRadius: "999px",
        background: isOnline ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
        border: `1px solid ${isOnline ? "#22c55e" : "#ef4444"}`,
        color: isOnline ? "#22c55e" : "#ef4444",
        fontSize: "0.85rem",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        backdropFilter: "blur(8px)"
      }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isOnline ? "#22c55e" : "#ef4444" }}></div>
        {isOnline ? "Online (Synced)" : "Offline (Local Mode)"}
      </div>

      <ParticlesBg isDarkMode={isDarkMode} />
      {screen === "login" && <LoginScreen onLogin={handleLogin} onTeacher={() => setScreen("teacherLogin")} />}
      {screen === "teacherLogin" && <TeacherLogin onLogin={t => { storageSet(STORAGE_KEYS.activeTeacher, t); setTeacher(t); setScreen("teacherDash"); }} onBack={() => setScreen("login")} />}
      {screen === "teacherDash" && teacher && <TeacherDashboard teacher={teacher} quizLimits={quizLimits} setQuizLimits={setQuizLimits} lockedLevels={lockedLevels} setLockedLevels={setLockedLevels} onLogout={() => { storageSet(STORAGE_KEYS.activeTeacher, null); setTeacher(null); setScreen("login"); }} />}
      {screen === "levelSelect" && <LevelSelect user={user} quizLimits={quizLimits} lockedLevels={lockedLevels} refreshSettings={fetchQuizSettings} onSelect={l => { setLevel(l); setScreen("quiz"); }} onBack={goHome} />}
      {screen === "quiz" && <QuizScreen user={user} level={level} quizLimits={quizLimits} onFinish={handleQuizFinish} onBack={() => setScreen("levelSelect")} />}
      {screen === "quizResults" && <ResultsScreen data={results} onRetry={() => { setResults(null); setScreen("levelSelect"); }} onHome={goHome} />}
      {screen === "typing" && <TypingTest user={user} onFinish={handleTypingFinish} onBack={goHome} />}
      {screen === "typingResults" && <TypingResults data={results} onRetry={() => { setResults(null); setScreen("typing"); }} onHome={goHome} />}
      {screen === "code" && <CodeTest user={user} onFinish={handleCodeFinish} onBack={goHome} />}
      {screen === "codeResults" && <CodeResults data={results} onRetry={() => { setResults(null); setScreen("code"); }} onHome={goHome} />}
    </div>
  );
}