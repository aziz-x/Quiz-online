import { useState, useEffect, useRef, useCallback } from "react";

// ─── DATA ──────────────────────────────────────────────────────────────────────
const QUESTIONS = {
  easy: [
    { id: 1, type: "multichoice", category: "Hardware", question: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Power Unit"], correct: "Central Processing Unit", hint: "The 'brain' of the computer." },
    { id: 2, type: "truefalse", category: "Software", question: "RAM is a type of permanent storage.", options: ["True", "False"], correct: "False", hint: "Think about what happens when you turn off your PC." },
    { id: 3, type: "multichoice", category: "IT Technology", question: "Which protocol is used for secure web browsing?", options: ["HTTP", "FTP", "HTTPS", "SMTP"], correct: "HTTPS", hint: "The 'S' stands for Secure." },
    { id: 4, type: "multichoice", category: "Hardware", question: "What component stores the operating system when the PC is off?", options: ["RAM", "CPU", "SSD/HDD", "GPU"], correct: "SSD/HDD", hint: "It's non-volatile storage." },
    { id: 5, type: "truefalse", category: "Software", question: "Python is a compiled programming language.", options: ["True", "False"], correct: "False", hint: "Python is interpreted, not compiled." },
    { id: 6, type: "multichoice", category: "IT Technology", question: "What does DNS stand for?", options: ["Data Network System", "Domain Name System", "Digital Node Service", "Dynamic Network Server"], correct: "Domain Name System", hint: "It translates domain names to IP addresses." },
    { id: 7, type: "multichoice", category: "Hardware", question: "What is the function of a GPU?", options: ["Process audio signals", "Render graphics and images", "Manage network traffic", "Control power supply"], correct: "Render graphics and images", hint: "Used heavily in gaming and AI." },
    { id: 8, type: "truefalse", category: "Software", question: "An operating system is a type of application software.", options: ["True", "False"], correct: "False", hint: "It's system software, not application software." },
    { id: 9, type: "multichoice", category: "Processes", question: "What is a firewall used for?", options: ["Speed up internet", "Block unauthorized network access", "Store backup files", "Compress data"], correct: "Block unauthorized network access", hint: "It's a security barrier." },
    { id: 10, type: "multichoice", category: "IT Technology", question: "Which of these is an example of cloud storage?", options: ["USB Flash Drive", "Google Drive", "SSD", "DVD"], correct: "Google Drive", hint: "Accessed via the internet." },
  ],
  normal: [
    { id: 11, type: "multichoice", category: "IT Technology", question: "What is the OSI model?", options: ["A network hardware standard", "A 7-layer framework for network communication", "An operating system interface", "An internet protocol"], correct: "A 7-layer framework for network communication", hint: "Layers from Physical to Application." },
    { id: 12, type: "multichoice", category: "Hardware", question: "What is the purpose of a subnet mask?", options: ["Encrypt network data", "Divide an IP address into network and host portions", "Assign IP addresses automatically", "Block malicious traffic"], correct: "Divide an IP address into network and host portions", hint: "Used alongside IP addresses in networking." },
    { id: 13, type: "multichoice", category: "Software", question: "Which data structure uses LIFO order?", options: ["Queue", "Stack", "Linked List", "Tree"], correct: "Stack", hint: "Last In, First Out." },
    { id: 14, type: "multichoice", category: "Processes", question: "What does AGILE methodology emphasize?", options: ["Strict documentation", "Iterative development and flexibility", "Waterfall planning", "Hardware optimization"], correct: "Iterative development and flexibility", hint: "Sprints and scrums are part of it." },
    { id: 15, type: "multichoice", category: "IT Technology", question: "What is the difference between TCP and UDP?", options: ["TCP is faster, UDP is reliable", "TCP is reliable with error checking, UDP is faster without guarantees", "They are identical protocols", "TCP is for video, UDP is for text"], correct: "TCP is reliable with error checking, UDP is faster without guarantees", hint: "Think streaming vs file transfers." },
    { id: 16, type: "multichoice", category: "Software", question: "What is SQL used for?", options: ["Styling web pages", "Managing relational databases", "Building mobile apps", "Network configuration"], correct: "Managing relational databases", hint: "SELECT * FROM..." },
    { id: 17, type: "multichoice", category: "Hardware", question: "What is the role of BIOS/UEFI?", options: ["Render graphics", "Initialize hardware during boot", "Store user files", "Manage network connections"], correct: "Initialize hardware during boot", hint: "It runs before the OS loads." },
    { id: 18, type: "multichoice", category: "Processes", question: "What is version control used for?", options: ["Monitor CPU temperature", "Track changes in code over time", "Encrypt databases", "Manage user accounts"], correct: "Track changes in code over time", hint: "Git is a popular example." },
    { id: 19, type: "multichoice", category: "IT Technology", question: "What is a VPN primarily used for?", options: ["Speed up downloads", "Create a secure encrypted tunnel over the internet", "Block ads", "Compress files"], correct: "Create a secure encrypted tunnel over the internet", hint: "Privacy and security over public networks." },
    { id: 20, type: "multichoice", category: "Software", question: "What is polymorphism in OOP?", options: ["Code duplication", "Ability of objects to take multiple forms", "Single inheritance only", "Static method binding"], correct: "Ability of objects to take multiple forms", hint: "One interface, multiple implementations." },
    { id: 21, type: "multichoice", category: "IT Technology", question: "What does API stand for?", options: ["Application Programming Interface", "Automated Process Integration", "Advanced Protocol Index", "Application Protocol Interpreter"], correct: "Application Programming Interface", hint: "Allows different software to communicate." },
    { id: 22, type: "multichoice", category: "Hardware", question: "What is RAID used for?", options: ["Anti-virus protection", "Redundant storage for reliability/performance", "Remote desktop access", "Real-time audio input device"], correct: "Redundant storage for reliability/performance", hint: "Multiple drives working together." },
    { id: 23, type: "multichoice", category: "Processes", question: "What is CI/CD in software development?", options: ["Code Inspection / Code Deployment", "Continuous Integration / Continuous Delivery", "Certified Infrastructure / Certified Design", "Client Interface / Client Dashboard"], correct: "Continuous Integration / Continuous Delivery", hint: "Automates build, test, and deployment pipelines." },
    { id: 24, type: "multichoice", category: "Software", question: "What is the time complexity of binary search?", options: ["O(n)", "O(n²)", "O(log n)", "O(1)"], correct: "O(log n)", hint: "It halves the search space each time." },
    { id: 25, type: "multichoice", category: "IT Technology", question: "What is a CDN?", options: ["Centralized Data Node", "Content Delivery Network", "Certified DNS Network", "Cloud Data Normalization"], correct: "Content Delivery Network", hint: "Distributes content from servers closer to users." },
  ],
  professional: [
    { id: 26, type: "multichoice", category: "IT Technology", question: "What is the CAP theorem?", options: ["CPU, Arithmetic, Protocol theorem", "Consistency, Availability, Partition tolerance — choose 2", "Cache, Abstraction, Persistence", "Control, Architecture, Performance"], correct: "Consistency, Availability, Partition tolerance — choose 2", hint: "Fundamental in distributed systems design." },
    { id: 27, type: "multichoice", category: "Software", question: "What is the difference between a process and a thread?", options: ["They are identical", "A process has its own memory space; threads share it within a process", "Threads are heavier than processes", "A process is a subset of a thread"], correct: "A process has its own memory space; threads share it within a process", hint: "Context switching cost differs significantly." },
    { id: 28, type: "multichoice", category: "Processes", question: "What does SOLID stand for in software engineering?", options: ["A security framework", "5 OOP design principles: Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion", "A database normalization method", "A network topology model"], correct: "5 OOP design principles: Single Responsibility, Open/Closed, Liskov, Interface Segregation, Dependency Inversion", hint: "Core principles for maintainable OOP code." },
    { id: 29, type: "multichoice", category: "IT Technology", question: "What is the difference between symmetric and asymmetric encryption?", options: ["Symmetric is slower", "Symmetric uses one key for encrypt/decrypt; asymmetric uses public/private key pairs", "Asymmetric is less secure", "They use the same algorithm"], correct: "Symmetric uses one key for encrypt/decrypt; asymmetric uses public/private key pairs", hint: "HTTPS uses asymmetric for key exchange, then symmetric." },
    { id: 30, type: "multichoice", category: "Hardware", question: "What is cache coherence in multi-core CPUs?", options: ["Keeping all CPU cores at the same clock speed", "Ensuring all cores have a consistent view of shared memory", "Synchronizing GPU and CPU caches", "A method to compress cache data"], correct: "Ensuring all cores have a consistent view of shared memory", hint: "MESI protocol is a common solution." },
    { id: 31, type: "multichoice", category: "Software", question: "What is eventual consistency?", options: ["Data is always consistent across all nodes instantly", "Given no new updates, all replicas will eventually converge to the same value", "Transactions always rollback on failure", "A SQL isolation level"], correct: "Given no new updates, all replicas will eventually converge to the same value", hint: "Common in NoSQL distributed databases." },
    { id: 32, type: "multichoice", category: "IT Technology", question: "What is a zero-day vulnerability?", options: ["A vulnerability fixed the same day it's found", "A flaw unknown to the vendor with no patch available", "A vulnerability in Day 0 of software release", "A network DDoS attack vector"], correct: "A flaw unknown to the vendor with no patch available", hint: "Attackers exploit it before vendors can respond." },
    { id: 33, type: "multichoice", category: "Processes", question: "What is chaos engineering?", options: ["Unstructured software development", "Deliberately introducing failures to test system resilience", "A microservices anti-pattern", "Random load testing"], correct: "Deliberately introducing failures to test system resilience", hint: "Netflix's Chaos Monkey is a famous example." },
    { id: 34, type: "multichoice", category: "Software", question: "What is the difference between horizontal and vertical scaling?", options: ["Horizontal = faster CPUs, Vertical = more servers", "Vertical = upgrade existing server, Horizontal = add more servers", "They are the same concept", "Horizontal is for databases only"], correct: "Vertical = upgrade existing server, Horizontal = add more servers", hint: "Horizontal scaling is preferred for cloud-native apps." },
    { id: 35, type: "multichoice", category: "IT Technology", question: "What is the role of a message queue in microservices?", options: ["Direct API call replacement", "Decouple services with asynchronous communication and buffering", "A database caching layer", "Load balancing requests"], correct: "Decouple services with asynchronous communication and buffering", hint: "Kafka and RabbitMQ are popular examples." },
    { id: 36, type: "multichoice", category: "Hardware", question: "What is NUMA architecture?", options: ["Non-Unified Memory Access — memory is divided among CPU nodes", "New Unified Memory Architecture", "Network Unified Mesh Array", "Normalized Universal Memory Addressing"], correct: "Non-Unified Memory Access — memory is divided among CPU nodes", hint: "Local memory access is faster than remote memory access." },
    { id: 37, type: "multichoice", category: "Processes", question: "What does 'infrastructure as code' (IaC) mean?", options: ["Writing code on physical servers", "Managing infrastructure via machine-readable configuration files", "Using code editors for hardware repair", "A CI/CD pipeline stage"], correct: "Managing infrastructure via machine-readable configuration files", hint: "Terraform and Ansible are popular IaC tools." },
    { id: 38, type: "multichoice", category: "Software", question: "What is a deadlock in operating systems?", options: ["CPU overheating", "Two or more processes waiting for each other's resources indefinitely", "Memory leak causing crash", "Infinite loop in user code"], correct: "Two or more processes waiting for each other's resources indefinitely", hint: "Requires Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait." },
    { id: 39, type: "multichoice", category: "IT Technology", question: "What is BGP in networking?", options: ["Basic Gateway Protocol", "Border Gateway Protocol — routes traffic between autonomous systems on the internet", "Binary Graph Processing", "Broadcast Gateway Path"], correct: "Border Gateway Protocol — routes traffic between autonomous systems on the internet", hint: "The routing protocol that makes the internet work." },
    { id: 40, type: "multichoice", category: "Processes", question: "What is the 'strangler fig' pattern in software?", options: ["A security attack pattern", "Gradually replace legacy systems by routing new functionality to new code", "A database migration strategy", "A microservices anti-pattern"], correct: "Gradually replace legacy systems by routing new functionality to new code", hint: "Named after a vine that slowly replaces a host tree." },
  ],
};

const LEVEL_CONFIG = {
  easy: { label: "Easy", questions: 10, timeLimit: 20 * 60, features: ["skip", "hint"], color: "#22c55e", glow: "rgba(34,197,94,0.4)", icon: "😊" },
  normal: { label: "Normal", questions: 15, timeLimit: 30 * 60, features: ["change_on_wrong"], color: "#f59e0b", glow: "rgba(245,158,11,0.4)", icon: "😐" },
  professional: { label: "Professional", questions: 20, timeLimit: 40 * 60, features: [], color: "#ef4444", glow: "rgba(239,68,68,0.4)", icon: "🔥" },
};

// ─── HELPERS ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function calcGrade(pct) {
  if (pct >= 90) return { grade: "A", color: "#22c55e", label: "Excellent! 🏆" };
  if (pct >= 80) return { grade: "B", color: "#3b82f6", label: "Great Job! 🌟" };
  if (pct >= 70) return { grade: "C", color: "#f59e0b", label: "Good Work! 👍" };
  if (pct >= 60) return { grade: "D", color: "#f97316", label: "Keep Going! 💪" };
  if (pct >= 50) return { grade: "E", color: "#8b5cf6", label: "Could Be Better! 📖" };
  return { grade: "F", color: "#ef4444", label: "Try Again! 📚" };
}

// ─── PARTICLE BACKGROUND ───────────────────────────────────────────────────────
function ParticlesBg() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      o: Math.random() * 0.5 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${p.o})`; ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }} />;
}

// ─── LOGIN SCREEN ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [form, setForm] = useState({ email: "", name: "", department: "" });
  const [errors, setErrors] = useState({});
  const [type, setType] = useState(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => { setTimeout(() => setAnimate(true), 100); }, []);

  const validate = () => {
    const e = {};
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = "Enter a valid email";
    if (form.name.trim().length < 2) e.name = "Name is required";
    if (form.department.trim().length < 2) e.department = "Department is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (t) => {
    if (!validate()) return;
    setType(t);
    setTimeout(() => onLogin({ ...form, testType: t }), 150);
  };

  const tests = [
    { id: "quiz", label: "Student Quiz", icon: "🎓", desc: "Multiple choice & T/F questions", color: "#8b5cf6" },
    { id: "typing", label: "Typing Test", icon: "⌨️", desc: "Test your typing speed & accuracy", color: "#06b6d4" },
    { id: "code", label: "Code Test", icon: "💻", desc: "Debug and fix code challenges", color: "#10b981" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "480px", opacity: animate ? 1 : 0, transform: animate ? "translateY(0)" : "translateY(30px)", transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#db2777)", boxShadow: "0 0 40px rgba(124,58,237,0.5)", marginBottom: "1rem", fontSize: 36 }}>💡</div>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 900, background: "linear-gradient(135deg,#c4b5fd,#f9a8d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-1px" }}>IT Quiz Pro</h1>
          <p style={{ color: "#94a3b8", marginTop: "0.5rem", fontSize: "0.95rem" }}>Test your knowledge across IT domains</p>
        </div>

        {/* Card */}
        <div style={{ background: "rgba(15,23,42,0.85)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}>
          {[
            { key: "email", label: "📧 Email", placeholder: "your@email.com", type: "email" },
            { key: "name", label: "👤 Full Name", placeholder: "Your full name", type: "text" },
            { key: "department", label: "🏢 Department", placeholder: "Your department", type: "text" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", color: "#c4b5fd", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem", letterSpacing: "0.5px" }}>{f.label}</label>
              <input type={f.type} value={form[f.key]} placeholder={f.placeholder}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.75rem", border: errors[f.key] ? "2px solid #ef4444" : "2px solid rgba(139,92,246,0.3)", background: "rgba(30,41,59,0.8)", color: "#e2e8f0", fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s", boxSizing: "border-box" }}
                onFocus={e => !errors[f.key] && (e.target.style.borderColor = "#8b5cf6")}
                onBlur={e => !errors[f.key] && (e.target.style.borderColor = "rgba(139,92,246,0.3)")}
              />
              {errors[f.key] && <p style={{ color: "#f87171", fontSize: "0.78rem", marginTop: "0.3rem" }}>⚠ {errors[f.key]}</p>}
            </div>
          ))}

          <p style={{ color: "#94a3b8", fontSize: "0.8rem", textAlign: "center", marginBottom: "1rem", marginTop: "0.5rem" }}>Choose your test type</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {tests.map(t => (
              <button key={t.id} onClick={() => handleSubmit(t.id)}
                style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem", borderRadius: "1rem", border: `2px solid ${t.color}40`, background: `${t.color}12`, color: "#e2e8f0", cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontSize: "0.95rem" }}
                onMouseEnter={e => { e.currentTarget.style.background = `${t.color}25`; e.currentTarget.style.borderColor = t.color; e.currentTarget.style.transform = "translateX(4px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${t.color}12`; e.currentTarget.style.borderColor = `${t.color}40`; e.currentTarget.style.transform = "translateX(0)"; }}>
                <span style={{ fontSize: "1.5rem" }}>{t.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, color: t.color }}>{t.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>{t.desc}</div>
                </div>
                <span style={{ marginLeft: "auto", color: t.color }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LEVEL SELECTION ───────────────────────────────────────────────────────────
function LevelSelect({ user, onSelect, onBack }) {
  const [hovered, setHovered] = useState(null);
  const levels = Object.entries(LEVEL_CONFIG);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <button onClick={onBack} style={{ position: "absolute", top: "1.5rem", left: "1.5rem", background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "0.5rem 1rem", borderRadius: "0.75rem", cursor: "pointer", fontSize: "0.9rem" }}>← Back</button>

      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: "0.5rem" }}>Welcome, <span style={{ color: "#c4b5fd", fontWeight: 700 }}>{user.name}</span></div>
        <h2 style={{ fontSize: "2rem", fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.5px" }}>Select Quiz Level</h2>
        <p style={{ color: "#64748b", marginTop: "0.5rem" }}>Choose your challenge difficulty</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", maxWidth: "900px", width: "100%" }}>
        {levels.map(([key, cfg]) => (
          <div key={key} onClick={() => onSelect(key)}
            onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)}
            style={{ background: "rgba(15,23,42,0.9)", border: `2px solid ${hovered === key ? cfg.color : cfg.color + "40"}`, borderRadius: "1.5rem", padding: "2rem", cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34,1.2,0.64,1)", transform: hovered === key ? "translateY(-6px) scale(1.02)" : "none", boxShadow: hovered === key ? `0 20px 40px ${cfg.glow}` : "0 4px 20px rgba(0,0,0,0.3)", backdropFilter: "blur(20px)" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{cfg.icon}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: cfg.color }}>{cfg.label}</h3>
              {key === "professional" && <span style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", color: "white", fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>PRO</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                `📝 ${cfg.questions} Questions`,
                `⏱ ${Math.floor(cfg.timeLimit / 60)} Minutes`,
                key === "easy" ? "💡 Hints & Skip Available" : key === "normal" ? "🔄 Changes on Wrong Answer" : "⚡ Continues on Wrong Answer",
              ].map((f, i) => (
                <div key={i} style={{ color: "#94a3b8", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>{f}</div>
              ))}
            </div>
            <button style={{ marginTop: "1.5rem", width: "100%", padding: "0.75rem", borderRadius: "0.75rem", background: `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`, color: "white", fontWeight: 700, border: "none", cursor: "pointer", fontSize: "0.95rem", boxShadow: `0 4px 15px ${cfg.glow}` }}>
              Start {cfg.label} Quiz →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── QUIZ ENGINE ───────────────────────────────────────────────────────────────
function QuizScreen({ user, level, onFinish, onBack }) {
  const cfg = LEVEL_CONFIG[level];
  const rawQs = QUESTIONS[level] || [];
  const [questions] = useState(() => shuffle(rawQs).slice(0, cfg.questions).map(q => ({ ...q, options: shuffle(q.options) })));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(cfg.timeLimit);
  const [showHint, setShowHint] = useState(false);
  const [skipped, setSkipped] = useState(new Set());
  const [shake, setShake] = useState(false);
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef(null);

  const q = questions[idx];
  const pct = ((idx) / questions.length) * 100;
  const timePct = (timeLeft / cfg.timeLimit) * 100;
  const timerColor = timePct > 50 ? cfg.color : timePct > 20 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); finishQuiz(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const finishQuiz = useCallback(() => {
    clearInterval(timerRef.current);
    onFinish({ questions, answers, level, user });
  }, [questions, answers, level, user, onFinish]);

  const handleSelect = (opt) => {
    if (confirmed) return;
    setSelected(opt);
  };

  const handleConfirm = () => {
    if (!selected) return;
    const isCorrect = selected === q.correct;
    const newAnswers = [...answers, { question: q, selected, isCorrect }];
    setAnswers(newAnswers);
    setConfirmed(true);

    if (!isCorrect) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } else {
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
    }

    setTimeout(() => {
      if (idx + 1 >= questions.length) { finishQuiz(); return; }
      if (level === "normal" && !isCorrect) {
        const shuffled = shuffle(q.options);
        questions[idx] = { ...q, options: shuffled };
        setSelected(null); setConfirmed(false); setShowHint(false);
      } else if (level === "professional" && !isCorrect) {
        setIdx(i => i + 1); setSelected(null); setConfirmed(false); setShowHint(false);
      } else {
        setIdx(i => i + 1); setSelected(null); setConfirmed(false); setShowHint(false);
      }
    }, 1200);
  };

  const handleSkip = () => {
    // ... (rest of the code remains the same)
    if (!cfg.features.includes("skip")) return;
    setSkipped(s => new Set([...s, idx]));
    const newAnswers = [...answers, { question: q, selected: null, isCorrect: false }];
    setAnswers(newAnswers);
    if (idx + 1 >= questions.length) { finishQuiz(); return; }
    setIdx(i => i + 1); setSelected(null); setConfirmed(false); setShowHint(false);
  };

  const optionState = (opt) => {
    if (!confirmed) return selected === opt ? "selected" : "idle";
    if (opt === q.correct) return "correct";
    if (opt === selected && !confirmed) return "selected";
    if (opt === selected) return "wrong";
    return "idle";
  };

  const optionStyles = {
    idle: { border: "2px solid rgba(255,255,255,0.1)", background: "rgba(30,41,59,0.7)", color: "#cbd5e1" },
    selected: { border: `2px solid ${cfg.color}`, background: `${cfg.color}20`, color: "#e2e8f0" },
    correct: { border: "2px solid #22c55e", background: "rgba(34,197,94,0.2)", color: "#86efac" },
    wrong: { border: "2px solid #ef4444", background: "rgba(239,68,68,0.2)", color: "#fca5a5" },
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", position: "relative", zIndex: 1 }}>
      {/* Top Bar */}
      <div style={{ width: "100%", maxWidth: "700px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}`, color: cfg.color, padding: "4px 12px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700 }}>{cfg.icon} {cfg.label}</span>
          <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Q{idx + 1}/{questions.length}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(15,23,42,0.8)", border: `1px solid ${timerColor}40`, borderRadius: "0.75rem", padding: "0.5rem 1rem" }}>
          <span style={{ fontSize: "1.1rem" }}>⏱</span>
          <span style={{ color: timerColor, fontWeight: 700, fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Progress */}
      <div style={{ width: "100%", maxWidth: "700px", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 9999, marginBottom: "1.5rem", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${cfg.color},${cfg.color}bb)`, borderRadius: 9999, transition: "width 0.5s ease" }} />
      </div>

      {/* Card */}
      <div style={{ width: "100%", maxWidth: "700px", background: "rgba(15,23,42,0.9)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)", animation: shake ? "shake 0.4s ease" : pulse ? "pulse 0.4s ease" : "none" }}>
        <style>{`
          @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
          @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.02)} }
        `}</style>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <span style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", fontSize: "0.78rem", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(139,92,246,0.3)" }}>🏷 {q.category}</span>
          <span style={{ background: "rgba(30,41,59,0.8)", color: "#64748b", fontSize: "0.78rem", padding: "3px 10px", borderRadius: "999px" }}>{q.type === "truefalse" ? "True/False" : "Multiple Choice"}</span>
        </div>

        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#e2e8f0", lineHeight: 1.5, marginBottom: "1.75rem" }}>{q.question}</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {q.options.map((opt, i) => {
            const state = optionState(opt);
            const s = optionStyles[state];
            return (
              <button key={i} onClick={() => handleSelect(opt)} disabled={confirmed}
                style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.9rem 1.25rem", borderRadius: "1rem", cursor: confirmed ? "default" : "pointer", textAlign: "left", transition: "all 0.2s", ...s }}
                onMouseEnter={e => !confirmed && state === "idle" && (e.currentTarget.style.background = "rgba(139,92,246,0.15)", e.currentTarget.style.borderColor = "rgba(139,92,246,0.5)")}
                onMouseLeave={e => !confirmed && state === "idle" && (e.currentTarget.style.background = "rgba(30,41,59,0.7)", e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}>
                <span style={{ minWidth: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: state === "correct" ? "#22c55e" : state === "wrong" ? "#ef4444" : state === "selected" ? cfg.color : "rgba(255,255,255,0.08)", color: "white", fontSize: "0.8rem", fontWeight: 700 }}>
                  {state === "correct" ? "✓" : state === "wrong" ? "✗" : String.fromCharCode(65 + i)}
                </span>
                <span style={{ fontSize: "0.95rem" }}>{opt}</span>
              </button>
            );
          })}
        </div>

        {showHint && cfg.features.includes("hint") && (
          <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "0.75rem", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
            <span style={{ color: "#fbbf24", fontSize: "0.88rem" }}>💡 Hint: {q.hint}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button onClick={handleConfirm} disabled={!selected || confirmed}
            style={{ flex: 1, padding: "0.85rem", borderRadius: "0.875rem", background: !selected || confirmed ? "rgba(30,41,59,0.5)" : `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`, color: !selected || confirmed ? "#64748b" : "white", fontWeight: 700, border: "none", cursor: !selected || confirmed ? "not-allowed" : "pointer", transition: "all 0.2s", fontSize: "0.95rem" }}>
            {confirmed ? "✓ Confirmed" : "Confirm Answer"}
          </button>
          {cfg.features.includes("hint") && (
            <button onClick={() => setShowHint(s => !s)} style={{ padding: "0.85rem 1.25rem", borderRadius: "0.875rem", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>💡</button>
          )}
          {cfg.features.includes("skip") && (
            <button onClick={handleSkip} style={{ padding: "0.85rem 1.25rem", borderRadius: "0.875rem", background: "rgba(100,116,139,0.15)", border: "1px solid rgba(100,116,139,0.3)", color: "#94a3b8", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>Skip ⏭</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── RESULTS SCREEN ────────────────────────────────────────────────────────────
function ResultsScreen({ data, onRetry, onHome }) {
  const { questions, answers, level, user } = data;
  const correct = answers.filter(a => a.isCorrect).length;
  const total = answers.length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const { grade, color, label } = calcGrade(pct);
  const cfg = LEVEL_CONFIG[level];
  const [visible, setVisible] = useState(false);
  useEffect(() => setTimeout(() => setVisible(true), 100), []);

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1.5rem", position: "relative", zIndex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(20px)", transition: "all 0.6s ease" }}>
        {/* Header Card */}
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "1.5rem", padding: "2.5rem", marginBottom: "1.5rem", textAlign: "center", backdropFilter: "blur(20px)" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>{pct >= 70 ? "🏆" : pct >= 50 ? "📚" : "💪"}</div>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color, marginBottom: "0.5rem" }}>{pct}%</div>
          <div style={{ fontSize: "1.1rem", color: "#94a3b8", marginBottom: "0.5rem" }}>{label}</div>
          <div style={{ display: "inline-block", background: `${color}20`, border: `2px solid ${color}`, color, padding: "4px 20px", borderRadius: "999px", fontWeight: 800, fontSize: "1.4rem" }}>{grade}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginTop: "2rem" }}>
            {[
              { label: "Correct", value: correct, icon: "✅", col: "#22c55e" },
              { label: "Total", value: total, icon: "📝", col: cfg.color },
              { label: "Level", value: cfg.label, icon: cfg.icon, col: "#c4b5fd" },
            ].map((s, i) => (
              <div key={i} style={{ background: `${s.col}10`, border: `1px solid ${s.col}30`, borderRadius: "1rem", padding: "1rem" }}>
                <div style={{ fontSize: "1.5rem" }}>{s.icon}</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 800, color: s.col, marginTop: "0.25rem" }}>{s.value}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Review */}
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "1.5rem", padding: "1.75rem", marginBottom: "1.5rem", backdropFilter: "blur(20px)" }}>
          <h3 style={{ color: "#c4b5fd", fontWeight: 700, marginBottom: "1.25rem", fontSize: "1.1rem" }}>📋 Question Review</h3>
          <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", paddingRight: "0.5rem" }}>
            {answers.map((a, i) => (
              <div key={i} style={{ padding: "1rem 1.25rem", borderRadius: "1rem", border: `2px solid ${a.isCorrect ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, background: a.isCorrect ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>Q{i + 1}</span>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#e2e8f0" }}>{a.question.question}</span>
                  <span style={{ marginLeft: "auto", fontSize: "1.1rem" }}>{a.isCorrect ? "✅" : "❌"}</span>
                </div>
                {!a.isCorrect && (
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                    <span style={{ color: "#fca5a5" }}>Your answer: {a.selected || "Skipped"}</span>
                    <span style={{ color: "#86efac", marginLeft: "1rem" }}>✓ {a.question.correct}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "1rem" }}>
          <button onClick={onRetry} style={{ flex: 1, padding: "1rem", borderRadius: "1rem", background: `linear-gradient(135deg,${cfg.color},${cfg.color}bb)`, color: "white", fontWeight: 700, border: "none", cursor: "pointer", fontSize: "1rem" }}>🔄 Try Again</button>
          <button onClick={onHome} style={{ flex: 1, padding: "1rem", borderRadius: "1rem", background: "rgba(30,41,59,0.8)", color: "#94a3b8", fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontSize: "1rem" }}>🏠 Home</button>
        </div>
      </div>
    </div>
  );
}

// ─── TYPING TEST ───────────────────────────────────────────────────────────────
const TYPING_TEXTS = {
  easy: "The quick brown fox jumps over the lazy dog. Programming is fun and interesting.",
  normal: "Cybersecurity requires constant vigilance. Each network packet must be inspected carefully to prevent unauthorized access and data breaches.",
  difficult: "Distributed systems require careful consideration of consistency, availability, and partition tolerance. The CAP theorem states that a distributed system cannot simultaneously guarantee all three properties, forcing engineers to make deliberate architectural trade-offs.",
};

function TypingTest({ user, onFinish, onBack }) {
  const [level, setLevel] = useState("easy");
  const [timeLimit, setTimeLimit] = useState(60);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [input, setInput] = useState("");
  const text = TYPING_TEXTS[level];
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const startTest = () => { setStarted(true); setInput(""); setTimeLeft(timeLimit); inputRef.current?.focus(); };

  useEffect(() => {
    if (!started) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); submitTest(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [started, timeLimit]);

  const submitTest = useCallback(() => {
    clearInterval(timerRef.current);
    const correct = input.split("").filter((c, i) => c === text[i]).length;
    const incorrect = input.length - correct;
    const totalChars = text.length;
    const score = totalChars > 0 ? Math.round((correct / totalChars) * 100) : 0;
    const words = input.trim().split(/\s+/).filter(Boolean).length;
    const elapsed = timeLimit - timeLeft + 1;
    const wpm = Math.round((words / elapsed) * 60);
    onFinish({ type: "typing", correct, incorrect, score, wpm, level, time: elapsed });
  }, [input, text, timeLimit, timeLeft, level, onFinish]);

  const timePct = (timeLeft / timeLimit) * 100;
  const timerColor = timePct > 50 ? "#22c55e" : timePct > 20 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <button onClick={onBack} style={{ position: "absolute", top: "1.5rem", left: "1.5rem", background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "0.5rem 1rem", borderRadius: "0.75rem", cursor: "pointer" }}>← Back</button>

      <div style={{ width: "100%", maxWidth: "680px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>⌨️</div>
          <h2 style={{ fontSize: "1.8rem", fontWeight: 900, color: "#e2e8f0" }}>Typing Speed Test</h2>
        </div>

        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)" }}>
          {!started ? (
            <>
              <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#94a3b8", fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>Difficulty</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {["easy", "normal", "difficult"].map(l => (
                      <button key={l} onClick={() => setLevel(l)} style={{ flex: 1, padding: "0.6rem", borderRadius: "0.75rem", border: level === l ? "2px solid #06b6d4" : "2px solid rgba(255,255,255,0.1)", background: level === l ? "rgba(6,182,212,0.2)" : "rgba(30,41,59,0.5)", color: level === l ? "#67e8f9" : "#64748b", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textTransform: "capitalize" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#94a3b8", fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>Duration</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {[30, 60, 120].map(t => (
                      <button key={t} onClick={() => setTimeLimit(t)} style={{ flex: 1, padding: "0.6rem", borderRadius: "0.75rem", border: timeLimit === t ? "2px solid #06b6d4" : "2px solid rgba(255,255,255,0.1)", background: timeLimit === t ? "rgba(6,182,212,0.2)" : "rgba(30,41,59,0.5)", color: timeLimit === t ? "#67e8f9" : "#64748b", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>{t}s</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ background: "rgba(30,41,59,0.8)", borderRadius: "1rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
                <p style={{ color: "#cbd5e1", fontFamily: "monospace", lineHeight: 1.7, fontSize: "0.95rem" }}>{text}</p>
              </div>
              <button onClick={startTest} style={{ width: "100%", padding: "1rem", borderRadius: "1rem", background: "linear-gradient(135deg,#06b6d4,#0284c7)", color: "white", fontWeight: 700, border: "none", cursor: "pointer", fontSize: "1rem" }}>🚀 Start Typing</button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.88rem" }}>Type the text below</span>
                <span style={{ color: timerColor, fontWeight: 700, fontSize: "1.2rem", fontVariantNumeric: "tabular-nums" }}>⏱ {formatTime(timeLeft)}</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 9999, marginBottom: "1.25rem", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${timePct}%`, background: timerColor, borderRadius: 9999, transition: "width 1s linear, background 0.3s" }} />
              </div>
              <div style={{ background: "rgba(30,41,59,0.8)", borderRadius: "1rem", padding: "1.25rem", marginBottom: "1rem", fontFamily: "monospace", fontSize: "1rem", lineHeight: 1.7 }}>
                {text.split("").map((char, i) => {
                  const typed = input[i];
                  const color = typed === undefined ? "#64748b" : typed === char ? "#86efac" : "#fca5a5";
                  const bg = typed !== undefined && typed !== char ? "rgba(239,68,68,0.2)" : "transparent";
                  return <span key={i} style={{ color, background: bg }}>{char}</span>;
                })}
              </div>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Start typing here..."
                style={{ width: "100%", padding: "1rem", borderRadius: "1rem", background: "rgba(30,41,59,0.9)", border: "2px solid rgba(6,182,212,0.4)", color: "#e2e8f0", fontFamily: "monospace", fontSize: "1rem", resize: "none", outline: "none", height: "100px", boxSizing: "border-box" }} />
              <button onClick={submitTest} style={{ marginTop: "1rem", width: "100%", padding: "0.875rem", borderRadius: "1rem", background: "linear-gradient(135deg,#22c55e,#15803d)", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}>✅ Submit</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TYPING RESULTS ────────────────────────────────────────────────────────────
function TypingResults({ data, onRetry, onHome }) {
  const { correct, incorrect, score, wpm, level } = data;
  const { grade, color, label } = calcGrade(score);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", position: "relative", zIndex: 1 }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: "1.5rem", padding: "2.5rem", backdropFilter: "blur(20px)", textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>⌨️</div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#e2e8f0", marginBottom: "0.5rem" }}>Typing Results</h2>
          <p style={{ color: "#64748b", marginBottom: "2rem" }}>Level: <span style={{ color: "#67e8f9", textTransform: "capitalize" }}>{level}</span></p>
          <div style={{ fontSize: "3rem", fontWeight: 900, color, marginBottom: "0.25rem" }}>{score}%</div>
          <div style={{ color: "#94a3b8", marginBottom: "2rem" }}>{label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
            {[
              { label: "WPM", value: wpm, icon: "⚡", col: "#f59e0b" },
              { label: "Correct", value: correct, icon: "✅", col: "#22c55e" },
              { label: "Errors", value: incorrect, icon: "❌", col: "#ef4444" },
            ].map((s, i) => (
              <div key={i} style={{ background: `${s.col}10`, border: `1px solid ${s.col}30`, borderRadius: "1rem", padding: "1rem" }}>
                <div style={{ fontSize: "1.4rem" }}>{s.icon}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: s.col }}>{s.value}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button onClick={onRetry} style={{ flex: 1, padding: "0.875rem", borderRadius: "1rem", background: "linear-gradient(135deg,#06b6d4,#0284c7)", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}>🔄 Try Again</button>
            <button onClick={onHome} style={{ flex: 1, padding: "0.875rem", borderRadius: "1rem", background: "rgba(30,41,59,0.8)", color: "#94a3b8", fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>🏠 Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CODE TEST ─────────────────────────────────────────────────────────────────
const BUGGY_CODES = {
  easy: {
    desc: "This function should add two numbers and return the result. Find and fix the bug.",
    buggy: `def add_numbers(a, b):\n    result = a + b\n    # Missing return statement`,
    correct: `def add_numbers(a, b):\n    result = a + b\n    return result`,
  },
  normal: {
    desc: "Find the maximum number in a list. The comparison operator is wrong.",
    buggy: `def find_max(numbers):\n    max_num = numbers[0]\n    for num in numbers:\n        if num < max_num:  # Wrong!\n            max_num = num\n    return max_num`,
    correct: `def find_max(numbers):\n    max_num = numbers[0]\n    for num in numbers:\n        if num > max_num:\n            max_num = num\n    return max_num`,
  },
  difficult: {
    desc: "Check if a string is a palindrome. Fix all the syntax errors.",
    buggy: `def is_palindrome(text):\n    text = text.lower().replace(" ", "")\n    reversed_text = text[::-1]\n    if text = reversed_text:  # Wrong operator\n        return True\n    else\n        return False  # Missing colon`,
    correct: `def is_palindrome(text):\n    text = text.lower().replace(" ", "")\n    reversed_text = text[::-1]\n    if text == reversed_text:\n        return True\n    else:\n        return False`,
  },
};

function CodeTest({ user, onFinish, onBack }) {
  const [level, setLevel] = useState("easy");
  const [answer, setAnswer] = useState("");
  const code = BUGGY_CODES[level];

  const calcSimilarity = (student, correct) => {
    const normalize = s => s.replace(/\s+/g, "").replace(/#.*$/gm, "").toLowerCase();
    const a = normalize(student), b = normalize(correct);
    if (!b) return 0;
    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) matches++;
    const base = (matches / Math.max(a.length, b.length)) * 100;
    return Math.min(100, Math.round(base + (a.includes("return") && b.includes("return") ? 5 : 0)));
  };

  const handleSubmit = () => {
    const pct = calcSimilarity(answer, code.correct);
    const { grade } = calcGrade(pct);
    onFinish({ type: "code", percentage: pct, grade, level, student: answer, correct: code.correct });
  };

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1.5rem", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <button onClick={onBack} style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", padding: "0.5rem 1rem", borderRadius: "0.75rem", cursor: "pointer" }}>← Back</button>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "#e2e8f0" }}>💻 Code Debugging Test</h2>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {["easy", "normal", "difficult"].map(l => (
            <button key={l} onClick={() => { setLevel(l); setAnswer(""); }} style={{ padding: "0.6rem 1.25rem", borderRadius: "0.75rem", border: level === l ? "2px solid #10b981" : "2px solid rgba(255,255,255,0.1)", background: level === l ? "rgba(16,185,129,0.2)" : "rgba(30,41,59,0.5)", color: level === l ? "#6ee7b7" : "#64748b", cursor: "pointer", fontWeight: 600, textTransform: "capitalize", fontSize: "0.88rem" }}>{l}</button>
          ))}
        </div>

        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "1.5rem", padding: "1.5rem", marginBottom: "1.25rem", backdropFilter: "blur(20px)" }}>
          <p style={{ color: "#6ee7b7", fontSize: "0.9rem", marginBottom: "1rem" }}>📋 {code.desc}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <div style={{ color: "#fca5a5", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>⚠️ Buggy Code</div>
              <div style={{ background: "#0f172a", borderRadius: "0.75rem", padding: "1.25rem", border: "2px solid rgba(239,68,68,0.4)" }}>
                <pre style={{ color: "#f8fafc", fontFamily: "monospace", fontSize: "0.88rem", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{code.buggy}</pre>
              </div>
            </div>
            <div>
              <div style={{ color: "#6ee7b7", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>✏️ Write Corrected Code</div>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="# Write the corrected version here..."
                style={{ width: "100%", height: "180px", background: "#0f172a", border: "2px solid rgba(16,185,129,0.4)", borderRadius: "0.75rem", padding: "1.25rem", color: "#e2e8f0", fontFamily: "monospace", fontSize: "0.88rem", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <button onClick={handleSubmit} disabled={!answer.trim()} style={{ marginTop: "1rem", padding: "0.875rem 2rem", borderRadius: "1rem", background: answer.trim() ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(30,41,59,0.5)", color: answer.trim() ? "white" : "#64748b", fontWeight: 700, border: "none", cursor: answer.trim() ? "pointer" : "not-allowed", fontSize: "1rem" }}>
            🚀 Submit Solution
          </button>
        </div>
      </div>
    </div>
  );
}

function CodeResults({ data, onRetry, onHome }) {
  const { percentage, grade, level, student, correct } = data;
  const { color, label } = calcGrade(percentage);
  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1.5rem", position: "relative", zIndex: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "1.5rem", padding: "2rem", backdropFilter: "blur(20px)", textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>💻</div>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color }}>{percentage}%</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", maxWidth: "400px", margin: "1rem auto" }}>
            <div style={{ background: `${color}15`, padding: "1rem", borderRadius: "1rem", border: `1px solid ${color}40` }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color }}>{grade}</div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>Grade</div>
            </div>
            <div style={{ background: "rgba(139,92,246,0.15)", padding: "1rem", borderRadius: "1rem", border: "1px solid rgba(139,92,246,0.3)" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#c4b5fd" }}>{label.split("!")[0]}</div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>Result</div>
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
          {[["Your Code", student, "#06b6d4", "rgba(6,182,212,0.3)"], ["Correct Code", correct, "#22c55e", "rgba(34,197,94,0.3)"]].map(([title, code, tc, bc]) => (
            <div key={title} style={{ background: "#0f172a", border: `2px solid ${bc}`, borderRadius: "1rem", padding: "1.25rem" }}>
              <div style={{ color: tc, fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>{title}</div>
              <pre style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: "0.85rem", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" }}>{code}</pre>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button onClick={onRetry} style={{ flex: 1, padding: "1rem", borderRadius: "1rem", background: "linear-gradient(135deg,#10b981,#059669)", color: "white", fontWeight: 700, border: "none", cursor: "pointer" }}>🔄 Try Again</button>
          <button onClick={onHome} style={{ flex: 1, padding: "1rem", borderRadius: "1rem", background: "rgba(30,41,59,0.8)", color: "#94a3b8", fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>🏠 Home</button>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [level, setLevel] = useState(null);
  const [results, setResults] = useState(null);

  const handleLogin = (u) => { setUser(u); setScreen(u.testType === "quiz" ? "levelSelect" : u.testType === "typing" ? "typing" : "code"); };
  const handleLevelSelect = (l) => { setLevel(l); setScreen("quiz"); };
  const handleQuizFinish = (data) => { setResults(data); setScreen("quizResults"); };
  const handleTypingFinish = (data) => { setResults(data); setScreen("typingResults"); };
  const handleCodeFinish = (data) => { setResults(data); setScreen("codeResults"); };
  const goHome = () => { setScreen("login"); setUser(null); setLevel(null); setResults(null); };
  const retryQuiz = () => { setResults(null); setScreen("levelSelect"); };
  const retryTyping = () => { setResults(null); setScreen("typing"); };
  const retryCode = () => { setResults(null); setScreen("code"); };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #080d1a 0%, #0f172a 40%, #0a0f1f 100%)", color: "#e2e8f0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <ParticlesBg />
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}
      {screen === "levelSelect" && <LevelSelect user={user} onSelect={handleLevelSelect} onBack={goHome} />}
      {screen === "quiz" && <QuizScreen user={user} level={level} onFinish={handleQuizFinish} onBack={() => setScreen("levelSelect")} />}
      {screen === "quizResults" && <ResultsScreen data={results} onRetry={retryQuiz} onHome={goHome} />}
      {screen === "typing" && <TypingTest user={user} onFinish={handleTypingFinish} onBack={goHome} />}
      {screen === "typingResults" && <TypingResults data={results} onRetry={retryTyping} onHome={goHome} />}
      {screen === "code" && <CodeTest user={user} onFinish={handleCodeFinish} onBack={goHome} />}
      {screen === "codeResults" && <CodeResults data={results} onRetry={retryCode} onHome={goHome} />}
    </div>
  );
}