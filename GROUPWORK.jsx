import { useState, useEffect, useCallback, useRef } from "react";

// ─── Tiny crypto helpers ───────────────────────────────────────────────
const hashPassword = async (pw) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

// ─── DB layer (localStorage) ───────────────────────────────────────────
const DB = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  users: () => DB.get("qas_users", []),
  saveUsers: (u) => DB.set("qas_users", u),
  questions: () => DB.get("qas_questions", SEED_QUESTIONS),
  saveQuestions: (q) => DB.set("qas_questions", q),
  sessions: () => DB.get("qas_sessions", []),
  saveSessions: (s) => DB.set("qas_sessions", s),
  results: () => DB.get("qas_results", []),
  saveResults: (r) => DB.set("qas_results", r),
};

// ─── Seed questions ────────────────────────────────────────────────────
const SEED_QUESTIONS = [
  { id: "q1", text: "What is the time complexity of binary search?", type: "mcq", subject: "Computer Science", difficulty: "Medium", options: ["O(n)", "O(log n)", "O(n²)", "O(1)"], correct: "O(log n)", explanation: "Binary search halves the search space each step." },
  { id: "q2", text: "Python is a compiled language.", type: "truefalse", subject: "Computer Science", difficulty: "Easy", options: ["True", "False"], correct: "False", explanation: "Python is an interpreted language." },
  { id: "q3", text: "What keyword is used to define a function in JavaScript?", type: "short", subject: "Computer Science", difficulty: "Easy", correct: "function", explanation: "The `function` keyword declares a function." },
  { id: "q4", text: "Which data structure operates on LIFO principle?", type: "mcq", subject: "Computer Science", difficulty: "Easy", options: ["Queue", "Stack", "Linked List", "Tree"], correct: "Stack", explanation: "Stack = Last In First Out." },
  { id: "q5", text: "The mitochondria is the powerhouse of the cell.", type: "truefalse", subject: "Biology", difficulty: "Easy", options: ["True", "False"], correct: "True", explanation: "Mitochondria produce ATP through cellular respiration." },
  { id: "q6", text: "What is the powerhouse of the cell?", type: "short", subject: "Biology", difficulty: "Easy", correct: "mitochondria", explanation: "Mitochondria generate most of the cell's supply of ATP." },
  { id: "q7", text: "Which planet is known as the Red Planet?", type: "mcq", subject: "Science", difficulty: "Easy", options: ["Venus", "Jupiter", "Mars", "Saturn"], correct: "Mars", explanation: "Mars appears red due to iron oxide on its surface." },
  { id: "q8", text: "The speed of light is approximately 3×10⁸ m/s.", type: "truefalse", subject: "Physics", difficulty: "Medium", options: ["True", "False"], correct: "True", explanation: "Speed of light ≈ 299,792,458 m/s ≈ 3×10⁸ m/s." },
  { id: "q9", text: "What is the chemical formula of water?", type: "short", subject: "Chemistry", difficulty: "Easy", correct: "H2O", explanation: "Water = two hydrogen atoms bonded to one oxygen atom." },
  { id: "q10", text: "SQL stands for?", type: "mcq", subject: "Computer Science", difficulty: "Easy", options: ["Structured Query Language", "Simple Query Logic", "Sequential Query Layer", "Standard Query Link"], correct: "Structured Query Language", explanation: "SQL = Structured Query Language, used for databases." },
  { id: "q11", text: "What is the Big O notation for insertion sort worst case?", type: "mcq", subject: "Computer Science", difficulty: "Hard", options: ["O(n)", "O(n log n)", "O(n²)", "O(log n)"], correct: "O(n²)", explanation: "Insertion sort has O(n²) worst case when array is reversed." },
  { id: "q12", text: "DNA stands for Deoxyribonucleic Acid.", type: "truefalse", subject: "Biology", difficulty: "Easy", options: ["True", "False"], correct: "True", explanation: "DNA = Deoxyribonucleic Acid, the genetic material." },
];

// ─── Seed admin ────────────────────────────────────────────────────────
const ensureAdmin = async () => {
  const users = DB.users();
  if (!users.find(u => u.role === "admin")) {
    const hash = await hashPassword("admin123");
    DB.saveUsers([...users, { id: "admin", fullName: "System Admin", email: "admin@qas.io", username: "admin", passwordHash: hash, role: "admin", createdAt: new Date().toISOString(), loginHistory: [], testHistory: [] }]);
  }
};

// ─── Score helpers ─────────────────────────────────────────────────────
const getLevel = (pct) => {
  if (pct >= 85) return { label: "Excellent", color: "#059669", bg: "#d1fae5" };
  if (pct >= 65) return { label: "Good", color: "#0284c7", bg: "#e0f2fe" };
  if (pct >= 45) return { label: "Average", color: "#d97706", bg: "#fef3c7" };
  return { label: "Poor", color: "#dc2626", bg: "#fee2e2" };
};

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// ─── Chart component (tiny inline bars) ───────────────────────────────
const MiniBar = ({ pct, color = "#6366f1" }) => (
  <div style={{ background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
    <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
  </div>
);

// ─── Sparkline ─────────────────────────────────────────────────────────
const Sparkline = ({ data, color = "#6366f1" }) => {
  if (!data.length) return null;
  const max = Math.max(...data, 100);
  const w = 120, h = 36;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => <circle key={i} cx={(i / (data.length - 1 || 1)) * w} cy={h - (v / max) * h} r="3" fill={color} />)}
    </svg>
  );
};

// ─── Toast ─────────────────────────────────────────────────────────────
const Toast = ({ msg, type }) => {
  const colors = { success: "#059669", error: "#dc2626", info: "#0284c7" };
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: colors[type] || colors.info, color: "#fff", padding: "12px 20px", borderRadius: 10, fontWeight: 500, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", animation: "slideUp 0.3s ease" }}>
      {msg}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login"); // login | register | dashboard | admin | exam | result | history
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState(null);
  const [examState, setExamState] = useState(null);
  const [resultData, setResultData] = useState(null);

  useEffect(() => { ensureAdmin(); }, []);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const logout = () => { setUser(null); setPage("login"); setExamState(null); setResultData(null); };
  const goTo = (p) => setPage(p);

  const theme = {
    bg: dark ? "#0f1117" : "#f8fafc",
    card: dark ? "#1e2130" : "#ffffff",
    text: dark ? "#e2e8f0" : "#1e293b",
    muted: dark ? "#94a3b8" : "#64748b",
    border: dark ? "#2d3748" : "#e2e8f0",
    accent: "#6366f1",
    accentDark: "#4f46e5",
  };

  const css = {
    app: { minHeight: "100vh", background: theme.bg, color: theme.text, fontFamily: "'Sora', 'Segoe UI', sans-serif", transition: "background 0.3s, color 0.3s" },
    card: { background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "28px 32px" },
    input: { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${theme.border}`, background: dark ? "#252838" : "#f8fafc", color: theme.text, fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
    btn: { padding: "11px 24px", borderRadius: 10, border: "none", background: theme.accent, color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", transition: "background 0.2s, transform 0.1s" },
    btnOutline: { padding: "9px 20px", borderRadius: 10, border: `1.5px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 500, fontSize: 14, cursor: "pointer" },
    label: { fontSize: 13, fontWeight: 600, color: theme.muted, marginBottom: 6, display: "block", letterSpacing: "0.04em", textTransform: "uppercase" },
  };

  const renderPage = () => {
    switch (page) {
      case "login": return <LoginPage css={css} theme={theme} setUser={setUser} goTo={goTo} showToast={showToast} />;
      case "register": return <RegisterPage css={css} theme={theme} goTo={goTo} showToast={showToast} />;
      case "dashboard": return <UserDashboard css={css} theme={theme} user={user} goTo={goTo} setExamState={setExamState} showToast={showToast} dark={dark} />;
      case "admin": return <AdminDashboard css={css} theme={theme} user={user} goTo={goTo} showToast={showToast} dark={dark} />;
      case "exam": return <ExamEngine css={css} theme={theme} user={user} examState={examState} goTo={goTo} setResultData={setResultData} showToast={showToast} />;
      case "result": return <ResultPage css={css} theme={theme} user={user} resultData={resultData} goTo={goTo} />;
      case "history": return <HistoryPage css={css} theme={theme} user={user} goTo={goTo} dark={dark} />;
      default: return <LoginPage css={css} theme={theme} setUser={setUser} goTo={goTo} showToast={showToast} />;
    }
  };

  return (
    <div style={css.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.97); }
        input:focus { border-color: #6366f1 !important; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 3px; }
      `}</style>

      {/* Nav */}
      {user && (
        <nav style={{ background: dark ? "#1a1d2e" : "#fff", borderBottom: `1px solid ${theme.border}`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>Q</div>
            <span style={{ fontWeight: 700, fontSize: 17, color: theme.text }}>AssessIQ</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button style={css.btnOutline} onClick={() => goTo(user.role === "admin" ? "admin" : "dashboard")}>Dashboard</button>
            {user.role !== "admin" && <button style={css.btnOutline} onClick={() => goTo("history")}>History</button>}
            <button style={{ ...css.btnOutline, fontSize: 18 }} onClick={() => setDark(d => !d)}>{dark ? "☀️" : "🌙"}</button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14 }}>{user.fullName[0]}</div>
              <span style={{ fontSize: 14, color: theme.muted }}>{user.fullName.split(" ")[0]}</span>
            </div>
            <button style={{ ...css.btnOutline, color: "#dc2626", borderColor: "#fee2e2" }} onClick={logout}>Logout</button>
          </div>
        </nav>
      )}

      <div style={{ animation: "fadeIn 0.3s ease" }}>
        {renderPage()}
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════
function LoginPage({ css, theme, setUser, goTo, showToast }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!form.username || !form.password) return showToast("Fill in all fields", "error");
    setLoading(true);
    const hash = await hashPassword(form.password);
    const users = DB.users();
    const found = users.find(u => (u.username === form.username || u.email === form.username) && u.passwordHash === hash);
    setLoading(false);
    if (!found) return showToast("Invalid credentials", "error");
    const updated = users.map(u => u.id === found.id ? { ...u, loginHistory: [...(u.loginHistory || []), new Date().toISOString()] } : u);
    DB.saveUsers(updated);
    setUser(found);
    goTo(found.role === "admin" ? "admin" : "dashboard");
    showToast(`Welcome back, ${found.fullName.split(" ")[0]}!`, "success");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 28, margin: "0 auto 16px" }}>Q</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: theme.text }}>AssessIQ</h1>
          <p style={{ color: theme.muted, marginTop: 6 }}>Sign in to your account</p>
        </div>
        <div style={css.card}>
          <div style={{ marginBottom: 20 }}>
            <label style={css.label}>Username or Email</label>
            <input style={css.input} placeholder="admin" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} onKeyDown={e => e.key === "Enter" && login()} />
          </div>
          <div style={{ marginBottom: 28 }}>
            <label style={css.label}>Password</label>
            <input type="password" style={css.input} placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && login()} />
          </div>
          <button style={{ ...css.btn, width: "100%", opacity: loading ? 0.7 : 1 }} onClick={login} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: theme.muted }}>
            No account?{" "}
            <span style={{ color: theme.accent, cursor: "pointer", fontWeight: 600 }} onClick={() => goTo("register")}>Create one</span>
          </p>
        </div>
        <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: theme.card, border: `1px solid ${theme.border}` }}>
          <p style={{ fontSize: 13, color: theme.muted, textAlign: "center" }}>
            <strong>Demo admin:</strong> username <code>admin</code> / password <code>admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// REGISTER PAGE
// ═══════════════════════════════════════════════════════════════════════
function RegisterPage({ css, theme, goTo, showToast }) {
  const [form, setForm] = useState({ fullName: "", email: "", username: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!form.fullName || !form.email || !form.username || !form.password) return showToast("Fill in all fields", "error");
    if (form.password !== form.confirm) return showToast("Passwords don't match", "error");
    if (form.password.length < 6) return showToast("Password must be at least 6 characters", "error");
    const users = DB.users();
    if (users.find(u => u.username === form.username)) return showToast("Username taken", "error");
    if (users.find(u => u.email === form.email)) return showToast("Email already registered", "error");
    setLoading(true);
    const hash = await hashPassword(form.password);
    const newUser = { id: `u_${Date.now()}`, fullName: form.fullName, email: form.email, username: form.username, passwordHash: hash, role: "user", createdAt: new Date().toISOString(), loginHistory: [], testHistory: [] };
    DB.saveUsers([...users, newUser]);
    setLoading(false);
    showToast("Account created! Please sign in.", "success");
    goTo("login");
  };

  const F = (key, label, type = "text", placeholder = "") => (
    <div style={{ marginBottom: 16 }}>
      <label style={css.label}>{label}</label>
      <input type={type} style={css.input} placeholder={placeholder} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: theme.text }}>Create account</h1>
          <p style={{ color: theme.muted, marginTop: 6 }}>Join AssessIQ today</p>
        </div>
        <div style={css.card}>
          {F("fullName", "Full Name", "text", "Jane Doe")}
          {F("email", "Email", "email", "jane@example.com")}
          {F("username", "Username", "text", "janedoe")}
          {F("password", "Password", "password", "At least 6 characters")}
          {F("confirm", "Confirm Password", "password", "Repeat password")}
          <button style={{ ...css.btn, width: "100%", marginTop: 8, opacity: loading ? 0.7 : 1 }} onClick={register} disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
          <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: theme.muted }}>
            Already have an account?{" "}
            <span style={{ color: theme.accent, cursor: "pointer", fontWeight: 600 }} onClick={() => goTo("login")}>Sign in</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// USER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function UserDashboard({ css, theme, user, goTo, setExamState, showToast, dark }) {
  const results = DB.results().filter(r => r.userId === user.id);
  const scores = results.map(r => r.percentage);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const best = scores.length ? Math.max(...scores) : 0;
  const subjects = [...new Set(DB.questions().map(q => q.subject))];

  const startExam = (subject = null, count = 10) => {
    const qs = DB.questions().filter(q => subject ? q.subject === subject : true);
    if (qs.length < 3) return showToast("Not enough questions", "error");
    const selected = shuffle(qs).slice(0, Math.min(count, qs.length));
    const sessionId = `s_${Date.now()}`;
    const session = { id: sessionId, userId: user.id, startedAt: new Date().toISOString(), subject: subject || "Mixed", questions: selected };
    DB.saveSessions([...DB.sessions(), session]);
    setExamState(session);
    goTo("exam");
  };

  const StatCard = ({ label, value, sub, color = theme.accent }) => (
    <div style={{ ...css.card, padding: "20px 24px" }}>
      <p style={{ fontSize: 13, color: theme.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 700, color, marginTop: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 13, color: theme.muted, marginTop: 2 }}>{sub}</p>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: theme.text }}>Welcome back, {user.fullName.split(" ")[0]} 👋</h1>
        <p style={{ color: theme.muted, marginTop: 4 }}>Ready for your next assessment?</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="Tests taken" value={results.length} sub="all time" />
        <StatCard label="Average score" value={`${avg}%`} sub="across all tests" color={avg >= 65 ? "#059669" : "#d97706"} />
        <StatCard label="Best score" value={`${best}%`} sub="personal record" color="#6366f1" />
        <StatCard label="Questions seen" value={results.reduce((a, r) => a + r.total, 0)} sub="total answered" />
      </div>

      {/* Score trend */}
      {scores.length >= 2 && (
        <div style={{ ...css.card, marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Score trend</h2>
            <Sparkline data={scores.slice(-8)} color={theme.accent} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {scores.slice(-8).map((s, i) => {
              const lv = getLevel(s);
              return (
                <div key={i} style={{ padding: "6px 14px", borderRadius: 20, background: lv.bg, color: lv.color, fontSize: 13, fontWeight: 600 }}>
                  {s}%
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Start exam */}
      <div style={{ ...css.card, marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text, marginBottom: 20 }}>Start a new assessment</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          <button onClick={() => startExam(null, 10)} style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${theme.accent}`, background: "transparent", color: theme.accent, cursor: "pointer", fontWeight: 700, fontSize: 15, display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
            <span style={{ fontSize: 22 }}>🔀</span>
            <span>Mixed exam</span>
            <span style={{ fontSize: 12, color: theme.muted, fontWeight: 400 }}>10 random questions</span>
          </button>
          {subjects.map(s => (
            <button key={s} onClick={() => startExam(s)} style={{ padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${theme.border}`, background: theme.card, color: theme.text, cursor: "pointer", fontWeight: 600, fontSize: 14, display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
              <span style={{ fontSize: 20 }}>📚</span>
              <span>{s}</span>
              <span style={{ fontSize: 12, color: theme.muted, fontWeight: 400 }}>
                {DB.questions().filter(q => q.subject === s).length} questions
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent tests */}
      {results.length > 0 && (
        <div style={css.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Recent tests</h2>
            <button style={css.btnOutline} onClick={() => goTo("history")}>View all</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.slice(-5).reverse().map(r => {
              const lv = getLevel(r.percentage);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: dark ? "#252838" : "#f8fafc", border: `1px solid ${theme.border}` }}>
                  <div>
                    <p style={{ fontWeight: 600, color: theme.text, fontSize: 15 }}>{r.subject}</p>
                    <p style={{ fontSize: 13, color: theme.muted }}>{new Date(r.completedAt).toLocaleDateString()}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: theme.muted }}>{r.correct}/{r.total}</span>
                    <span style={{ padding: "4px 12px", borderRadius: 20, background: lv.bg, color: lv.color, fontWeight: 700, fontSize: 14 }}>{r.percentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EXAM ENGINE
// ═══════════════════════════════════════════════════════════════════════
function ExamEngine({ css, theme, user, examState, goTo, setResultData, showToast }) {
  const { questions, subject, id: sessionId } = examState;
  const PAGE_SIZE = 3;
  const [answers, setAnswers] = useState({});
  const [page, setPage] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef();

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const totalPages = Math.ceil(questions.length / PAGE_SIZE);
  const pageQs = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const answered = Object.keys(answers).length;
  const pct = Math.round((answered / questions.length) * 100);
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const answer = (qid, val) => setAnswers(a => ({ ...a, [qid]: val }));

  const submit = () => {
    if (answered < questions.length) {
      const unanswered = questions.length - answered;
      if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
    }
    clearInterval(timerRef.current);
    const correct = questions.filter(q => {
      const a = answers[q.id] || "";
      return a.trim().toLowerCase() === q.correct.trim().toLowerCase();
    }).length;
    const percentage = Math.round((correct / questions.length) * 100);
    const result = {
      id: `r_${Date.now()}`,
      sessionId,
      userId: user.id,
      subject,
      questions: questions.map(q => ({ ...q, userAnswer: answers[q.id] || "" })),
      correct,
      total: questions.length,
      percentage,
      timeTaken: elapsed,
      completedAt: new Date().toISOString(),
    };
    DB.saveResults([...DB.results(), result]);
    setResultData(result);
    goTo("result");
    showToast("Assessment submitted!", "success");
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ ...css.card, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{subject} Assessment</h2>
          <p style={{ fontSize: 13, color: theme.muted }}>Page {page + 1} of {totalPages}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Answered</p>
            <p style={{ fontWeight: 700, color: theme.accent }}>{answered}/{questions.length}</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Time</p>
            <p style={{ fontWeight: 700, color: theme.text, fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 24 }}>
        <MiniBar pct={pct} color={theme.accent} />
        <p style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>{pct}% complete</p>
      </div>

      {/* Question cards */}
      {pageQs.map((q, qi) => (
        <QuestionCard key={q.id} q={q} index={page * PAGE_SIZE + qi} theme={theme} css={css} value={answers[q.id]} onAnswer={v => answer(q.id, v)} />
      ))}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <button style={css.btnOutline} onClick={() => setPage(p => p - 1)} disabled={page === 0}>← Previous</button>
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${i === page ? theme.accent : theme.border}`, background: i === page ? theme.accent : "transparent", color: i === page ? "#fff" : theme.text, fontWeight: 600, cursor: "pointer", fontSize: 14 }}>{i + 1}</button>
          ))}
        </div>
        {page < totalPages - 1
          ? <button style={css.btn} onClick={() => setPage(p => p + 1)}>Next →</button>
          : <button style={{ ...css.btn, background: "#059669" }} onClick={submit}>Submit exam ✓</button>
        }
      </div>
    </div>
  );
}

function QuestionCard({ q, index, theme, css, value, onAnswer }) {
  const isShort = q.type === "short";
  const answered = value !== undefined && value !== "";
  return (
    <div style={{ ...css.card, marginBottom: 20, borderLeft: `4px solid ${answered ? "#059669" : "#e2e8f0"}`, transition: "border-color 0.3s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: "#6366f120", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: theme.accent, fontSize: 14 }}>{index + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#f1f5f9", color: theme.muted, fontWeight: 600 }}>{q.subject}</span>
            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: q.difficulty === "Hard" ? "#fee2e2" : q.difficulty === "Medium" ? "#fef3c7" : "#d1fae5", color: q.difficulty === "Hard" ? "#dc2626" : q.difficulty === "Medium" ? "#d97706" : "#059669", fontWeight: 600 }}>{q.difficulty}</span>
            <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "#ede9fe", color: "#7c3aed", fontWeight: 600 }}>{q.type === "mcq" ? "MCQ" : q.type === "truefalse" ? "True/False" : "Short Answer"}</span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 500, color: theme.text, lineHeight: 1.5 }}>{q.text}</p>
        </div>
      </div>

      {isShort ? (
        <input style={{ ...css.input, marginTop: 4 }} placeholder="Type your answer…" value={value || ""} onChange={e => onAnswer(e.target.value)} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.options.map(opt => {
            const sel = value === opt;
            return (
              <div key={opt} onClick={() => onAnswer(opt)} style={{ padding: "12px 16px", borderRadius: 10, border: `2px solid ${sel ? theme.accent : theme.border}`, background: sel ? `${theme.accent}15` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.15s" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sel ? theme.accent : theme.border}`, background: sel ? theme.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <span style={{ color: theme.text, fontWeight: sel ? 600 : 400 }}>{opt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESULT PAGE
// ═══════════════════════════════════════════════════════════════════════
function ResultPage({ css, theme, user, resultData: r, goTo }) {
  const lv = getLevel(r.percentage);
  const [showDetails, setShowDetails] = useState(false);

  const exportCSV = () => {
    const rows = [["#", "Question", "Your Answer", "Correct Answer", "Result"]];
    r.questions.forEach((q, i) => {
      const ok = q.userAnswer.trim().toLowerCase() === q.correct.trim().toLowerCase();
      rows.push([i + 1, q.text, q.userAnswer || "(blank)", q.correct, ok ? "Correct" : "Incorrect"]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = `result_${r.subject}_${new Date().toLocaleDateString()}.csv`;
    a.click();
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      {/* Score hero */}
      <div style={{ ...css.card, textAlign: "center", marginBottom: 24, padding: "48px 32px" }}>
        <div style={{ width: 100, height: 100, borderRadius: "50%", background: `${lv.color}20`, border: `4px solid ${lv.color}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36 }}>
          {r.percentage >= 85 ? "🏆" : r.percentage >= 65 ? "😊" : r.percentage >= 45 ? "😐" : "😟"}
        </div>
        <div style={{ fontSize: 64, fontWeight: 800, color: lv.color, lineHeight: 1 }}>{r.percentage}%</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: lv.color, marginTop: 8 }}>{lv.label}</div>
        <div style={{ color: theme.muted, marginTop: 8, fontSize: 16 }}>
          {r.correct} correct out of {r.total} questions
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 28 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Subject</div>
            <div style={{ fontWeight: 700, color: theme.text, marginTop: 2 }}>{r.subject}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Time taken</div>
            <div style={{ fontWeight: 700, color: theme.text, marginTop: 2 }}>{Math.floor(r.timeTaken / 60)}m {r.timeTaken % 60}s</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</div>
            <div style={{ fontWeight: 700, color: theme.text, marginTop: 2 }}>{new Date(r.completedAt).toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ ...css.card, marginBottom: 24 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 12, color: theme.text }}>Performance breakdown</h3>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: theme.muted }}>Score</span>
            <span style={{ fontWeight: 700, color: lv.color }}>{r.percentage}%</span>
          </div>
          <MiniBar pct={r.percentage} color={lv.color} />
        </div>
        {[["Correct", r.correct, "#059669"], ["Incorrect", r.total - r.correct, "#dc2626"], ["Skipped", r.questions.filter(q => !q.userAnswer).length, "#94a3b8"]].map(([k, v, c]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
            <span style={{ fontSize: 14, color: theme.muted, flex: 1 }}>{k}</span>
            <span style={{ fontWeight: 700, color: theme.text }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button style={css.btn} onClick={() => goTo("dashboard")}>Back to dashboard</button>
        <button style={css.btnOutline} onClick={() => setShowDetails(d => !d)}>{showDetails ? "Hide" : "Show"} answer review</button>
        <button style={css.btnOutline} onClick={exportCSV}>Export CSV ↓</button>
      </div>

      {/* Detailed review */}
      {showDetails && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {r.questions.map((q, i) => {
            const ok = q.userAnswer.trim().toLowerCase() === q.correct.trim().toLowerCase();
            return (
              <div key={q.id} style={{ ...css.card, borderLeft: `4px solid ${ok ? "#059669" : "#dc2626"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p style={{ fontWeight: 600, color: theme.text, fontSize: 15, flex: 1 }}>{i + 1}. {q.text}</p>
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: ok ? "#d1fae5" : "#fee2e2", color: ok ? "#059669" : "#dc2626", fontWeight: 700, fontSize: 13, marginLeft: 12 }}>{ok ? "✓" : "✗"}</span>
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 13, color: theme.muted, minWidth: 110 }}>Your answer:</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: ok ? "#059669" : "#dc2626" }}>{q.userAnswer || "(no answer)"}</span>
                  </div>
                  {!ok && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 13, color: theme.muted, minWidth: 110 }}>Correct answer:</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#059669" }}>{q.correct}</span>
                    </div>
                  )}
                  {q.explanation && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#f1f5f9", fontSize: 13, color: theme.muted }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ═══════════════════════════════════════════════════════════════════════
function HistoryPage({ css, theme, user, goTo, dark }) {
  const results = DB.results().filter(r => r.userId === user.id).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const subjects = [...new Set(results.map(r => r.subject))];
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? results : results.filter(r => r.subject === filter);
  const scores = results.map(r => r.percentage);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.text }}>Test history</h1>
          <p style={{ color: theme.muted, marginTop: 4 }}>All your past assessments</p>
        </div>
        <button style={css.btnOutline} onClick={() => goTo("dashboard")}>← Dashboard</button>
      </div>

      {results.length === 0 ? (
        <div style={{ ...css.card, textAlign: "center", padding: "60px 24px" }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📋</p>
          <p style={{ color: theme.muted }}>No tests taken yet. Start your first assessment!</p>
          <button style={{ ...css.btn, marginTop: 16 }} onClick={() => goTo("dashboard")}>Take a test</button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
            {[["Total tests", results.length], ["Average score", `${avg}%`], ["Best score", `${Math.max(...scores)}%`], ["Subjects covered", subjects.length]].map(([k, v]) => (
              <div key={k} style={{ ...css.card, padding: "16px 20px" }}>
                <p style={{ fontSize: 12, color: theme.muted, fontWeight: 600, textTransform: "uppercase" }}>{k}</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: theme.accent, marginTop: 4 }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {["All", ...subjects].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: "6px 16px", borderRadius: 20, border: `1.5px solid ${filter === s ? theme.accent : theme.border}`, background: filter === s ? theme.accent : "transparent", color: filter === s ? "#fff" : theme.text, fontWeight: 500, cursor: "pointer", fontSize: 14 }}>{s}</button>
            ))}
          </div>

          {/* List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(r => {
              const lv = getLevel(r.percentage);
              return (
                <div key={r.id} style={{ ...css.card, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <p style={{ fontWeight: 700, color: theme.text, fontSize: 15 }}>{r.subject}</p>
                    <p style={{ fontSize: 13, color: theme.muted }}>{new Date(r.completedAt).toLocaleString()} · {r.total} questions · {Math.floor(r.timeTaken / 60)}m {r.timeTaken % 60}s</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 13, color: theme.muted }}>{r.correct}/{r.total} correct</p>
                      <div style={{ width: 100, marginTop: 4 }}>
                        <MiniBar pct={r.percentage} color={lv.color} />
                      </div>
                    </div>
                    <span style={{ padding: "6px 14px", borderRadius: 20, background: lv.bg, color: lv.color, fontWeight: 700, fontSize: 15 }}>{r.percentage}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function AdminDashboard({ css, theme, user, goTo, showToast, dark }) {
  const [tab, setTab] = useState("overview");
  const [questions, setQuestions] = useState(DB.questions());
  const [users, setUsers] = useState(DB.users());
  const [results, setResults] = useState(DB.results());
  const [editQ, setEditQ] = useState(null);
  const [newQ, setNewQ] = useState(null);

  const reload = () => { setQuestions(DB.questions()); setUsers(DB.users()); setResults(DB.results()); };

  const deleteQ = (id) => {
    if (!window.confirm("Delete this question?")) return;
    const qs = DB.questions().filter(q => q.id !== id);
    DB.saveQuestions(qs); reload(); showToast("Question deleted", "success");
  };

  const saveQ = (q) => {
    const qs = DB.questions();
    if (q.id && qs.find(x => x.id === q.id)) {
      DB.saveQuestions(qs.map(x => x.id === q.id ? q : x));
    } else {
      DB.saveQuestions([...qs, { ...q, id: `q${Date.now()}` }]);
    }
    reload(); setEditQ(null); setNewQ(null);
    showToast("Question saved!", "success");
  };

  const exportUsersCSV = () => {
    const rows = [["Username", "Full Name", "Email", "Tests taken", "Avg score", "Joined"]];
    users.filter(u => u.role !== "admin").forEach(u => {
      const ur = results.filter(r => r.userId === u.id);
      const avg = ur.length ? Math.round(ur.reduce((a, r) => a + r.percentage, 0) / ur.length) : 0;
      rows.push([u.username, u.fullName, u.email, ur.length, `${avg}%`, new Date(u.createdAt).toLocaleDateString()]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "users_export.csv"; a.click();
  };

  const tabs = [
    { id: "overview", label: "📊 Overview" },
    { id: "questions", label: "❓ Questions" },
    { id: "users", label: "👥 Users" },
    { id: "results", label: "📋 Results" },
  ];

  const allScores = results.map(r => r.percentage);
  const avgScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const nonAdmins = users.filter(u => u.role !== "admin");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.text }}>Admin Dashboard</h1>
        <p style={{ color: theme.muted, marginTop: 4 }}>Manage questions, users, and analytics</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${theme.border}`, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", borderRadius: "8px 8px 0 0", border: "none", background: tab === t.id ? theme.accent : "transparent", color: tab === t.id ? "#fff" : theme.muted, fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", fontSize: 14, whiteSpace: "nowrap" }}>{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
            {[
              ["Total users", nonAdmins.length, "#6366f1"],
              ["Total tests", results.length, "#059669"],
              ["Avg score", `${avgScore}%`, avgScore >= 65 ? "#059669" : "#d97706"],
              ["Questions", questions.length, "#0284c7"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ ...css.card, padding: "20px 24px" }}>
                <p style={{ fontSize: 12, color: theme.muted, fontWeight: 600, textTransform: "uppercase" }}>{k}</p>
                <p style={{ fontSize: 32, fontWeight: 800, color: c, marginTop: 4 }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Subject breakdown */}
          <div style={{ ...css.card, marginBottom: 24 }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, color: theme.text }}>Questions by subject</h3>
            {[...new Set(questions.map(q => q.subject))].map(s => {
              const cnt = questions.filter(q => q.subject === s).length;
              const pct = Math.round((cnt / questions.length) * 100);
              return (
                <div key={s} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: theme.text }}>{s}</span>
                    <span style={{ fontSize: 14, color: theme.muted }}>{cnt} ({pct}%)</span>
                  </div>
                  <MiniBar pct={pct} color={theme.accent} />
                </div>
              );
            })}
          </div>

          {/* Performance distribution */}
          <div style={css.card}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, color: theme.text }}>Performance distribution</h3>
            {[["Excellent (85-100%)", results.filter(r => r.percentage >= 85).length, "#059669"],
              ["Good (65-84%)", results.filter(r => r.percentage >= 65 && r.percentage < 85).length, "#0284c7"],
              ["Average (45-64%)", results.filter(r => r.percentage >= 45 && r.percentage < 65).length, "#d97706"],
              ["Poor (0-44%)", results.filter(r => r.percentage < 45).length, "#dc2626"]].map(([k, v, c]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, color: theme.text }}>{k}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: c }}>{v}</span>
                </div>
                <MiniBar pct={results.length ? Math.round((v / results.length) * 100) : 0} color={c} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Questions */}
      {tab === "questions" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <p style={{ color: theme.muted }}>{questions.length} questions total</p>
            <button style={css.btn} onClick={() => setNewQ({ type: "mcq", difficulty: "Easy", subject: "Computer Science", options: ["", "", "", ""], correct: "", text: "", explanation: "" })}>+ Add question</button>
          </div>

          {(editQ || newQ) && (
            <QuestionForm q={editQ || newQ} onSave={saveQ} onCancel={() => { setEditQ(null); setNewQ(null); }} css={css} theme={theme} />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {questions.map(q => (
              <div key={q.id} style={{ ...css.card, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#ede9fe", color: "#7c3aed", fontWeight: 600 }}>{q.subject}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#f1f5f9", color: theme.muted, fontWeight: 600 }}>{q.difficulty}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#e0f2fe", color: "#0284c7", fontWeight: 600 }}>{q.type}</span>
                  </div>
                  <p style={{ fontWeight: 500, color: theme.text, fontSize: 15 }}>{q.text}</p>
                  <p style={{ fontSize: 13, color: "#059669", marginTop: 4 }}>✓ {q.correct}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={css.btnOutline} onClick={() => setEditQ(q)}>Edit</button>
                  <button style={{ ...css.btnOutline, color: "#dc2626", borderColor: "#fee2e2" }} onClick={() => deleteQ(q.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <p style={{ color: theme.muted }}>{nonAdmins.length} registered users</p>
            <button style={css.btnOutline} onClick={exportUsersCSV}>Export CSV ↓</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {nonAdmins.map(u => {
              const ur = results.filter(r => r.userId === u.id);
              const avg = ur.length ? Math.round(ur.reduce((a, r) => a + r.percentage, 0) / ur.length) : null;
              return (
                <div key={u.id} style={{ ...css.card, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flexShrink: 0 }}>{u.fullName[0]}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ fontWeight: 700, color: theme.text }}>{u.fullName}</p>
                    <p style={{ fontSize: 13, color: theme.muted }}>@{u.username} · {u.email}</p>
                  </div>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase" }}>Tests</p>
                      <p style={{ fontWeight: 700, color: theme.text }}>{ur.length}</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase" }}>Avg</p>
                      <p style={{ fontWeight: 700, color: avg !== null ? (avg >= 65 ? "#059669" : "#d97706") : theme.muted }}>{avg !== null ? `${avg}%` : "—"}</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase" }}>Joined</p>
                      <p style={{ fontWeight: 600, color: theme.text, fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {nonAdmins.length === 0 && (
              <div style={{ ...css.card, textAlign: "center", padding: 40 }}>
                <p style={{ color: theme.muted }}>No users registered yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {tab === "results" && (
        <div>
          <p style={{ color: theme.muted, marginBottom: 20 }}>{results.length} total test submissions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).map(r => {
              const u = users.find(x => x.id === r.userId);
              const lv = getLevel(r.percentage);
              return (
                <div key={r.id} style={{ ...css.card, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <p style={{ fontWeight: 600, color: theme.text }}>{u ? u.fullName : "Unknown"} <span style={{ color: theme.muted, fontWeight: 400 }}>— {r.subject}</span></p>
                    <p style={{ fontSize: 13, color: theme.muted }}>{new Date(r.completedAt).toLocaleString()} · {r.total} questions</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 14, color: theme.muted }}>{r.correct}/{r.total}</span>
                    <span style={{ padding: "4px 12px", borderRadius: 20, background: lv.bg, color: lv.color, fontWeight: 700 }}>{r.percentage}%</span>
                  </div>
                </div>
              );
            })}
            {results.length === 0 && (
              <div style={{ ...css.card, textAlign: "center", padding: 40 }}>
                <p style={{ color: theme.muted }}>No test results yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Question form ─────────────────────────────────────────────────────
function QuestionForm({ q, onSave, onCancel, css, theme }) {
  const [form, setForm] = useState({ ...q, options: q.options || ["", "", "", ""] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setOpt = (i, v) => { const opts = [...form.options]; opts[i] = v; set("options", opts); };

  const subjects = ["Computer Science", "Biology", "Chemistry", "Physics", "Science", "Mathematics", "English", "History"];
  const difficulties = ["Easy", "Medium", "Hard"];
  const types = [{ v: "mcq", l: "Multiple Choice" }, { v: "truefalse", l: "True/False" }, { v: "short", l: "Short Answer" }];

  const save = () => {
    if (!form.text || !form.correct) return alert("Question text and correct answer are required.");
    if (form.type === "mcq" && form.options.some(o => !o)) return alert("Fill all 4 options for MCQ.");
    onSave(form);
  };

  return (
    <div style={{ ...css.card, marginBottom: 24, borderLeft: `4px solid ${theme.accent}` }}>
      <h3 style={{ fontWeight: 700, color: theme.text, marginBottom: 20 }}>{form.id ? "Edit question" : "New question"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={css.label}>Type</label>
          <select style={{ ...css.input }} value={form.type} onChange={e => { set("type", e.target.value); if (e.target.value === "truefalse") set("options", ["True", "False"]); else if (e.target.value === "mcq") set("options", ["", "", "", ""]); else set("options", []); }}>
            {types.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label style={css.label}>Subject</label>
          <select style={css.input} value={form.subject} onChange={e => set("subject", e.target.value)}>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={css.label}>Difficulty</label>
          <select style={css.input} value={form.difficulty} onChange={e => set("difficulty", e.target.value)}>
            {difficulties.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={css.label}>Question text</label>
        <textarea style={{ ...css.input, minHeight: 80, resize: "vertical" }} value={form.text} onChange={e => set("text", e.target.value)} placeholder="Enter the question…" />
      </div>
      {form.type === "mcq" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {form.options.map((o, i) => (
            <div key={i}>
              <label style={css.label}>Option {i + 1}</label>
              <input style={css.input} value={o} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
            </div>
          ))}
        </div>
      )}
      {form.type === "truefalse" && (
        <div style={{ marginBottom: 16, display: "flex", gap: 12 }}>
          {["True", "False"].map(v => (
            <button key={v} onClick={() => set("correct", v)} style={{ padding: "10px 24px", borderRadius: 10, border: `2px solid ${form.correct === v ? theme.accent : theme.border}`, background: form.correct === v ? `${theme.accent}15` : "transparent", color: form.correct === v ? theme.accent : theme.text, fontWeight: form.correct === v ? 700 : 400, cursor: "pointer" }}>{v}</button>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={css.label}>Correct answer</label>
          {form.type === "mcq" ? (
            <select style={css.input} value={form.correct} onChange={e => set("correct", e.target.value)}>
              <option value="">Select correct option</option>
              {form.options.filter(Boolean).map(o => <option key={o}>{o}</option>)}
            </select>
          ) : form.type !== "truefalse" ? (
            <input style={css.input} value={form.correct} onChange={e => set("correct", e.target.value)} placeholder="Exact correct answer" />
          ) : (
            <input style={css.input} value={form.correct} readOnly placeholder="Select True or False above" />
          )}
        </div>
        <div>
          <label style={css.label}>Explanation (optional)</label>
          <input style={css.input} value={form.explanation || ""} onChange={e => set("explanation", e.target.value)} placeholder="Why this is the correct answer" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button style={css.btn} onClick={save}>Save question</button>
        <button style={css.btnOutline} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
