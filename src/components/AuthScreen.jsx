import { useState, useEffect, useRef } from "react";
import { BuildingIcon } from "./Icons";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// ─── User type display helpers ───────────────────────────────────────────────
const USER_TYPE_LABELS = {
  admin:       '🔑 Admin',
  pg_member:   '🏠 PG Member',
  mess_member: '🍽 Mess Member',
};

function AuthScreen({ onLogin }) {
  const renderCount = useRef(0);
  renderCount.current++;
  
  useEffect(() => {
    console.log(`[AuthScreen Mount] Component mounted (Render #${renderCount.current})`);
    return () => {
      console.log("[AuthScreen Unmount] Component unmounted");
    };
  }, []);

  console.log(`[AuthScreen Render] Render #${renderCount.current}`);

  const handleInputFocus = (e) => {
    console.log(`[Input Focus] Field: "${e.target.placeholder || e.target.name || e.target.type}"`);
  };

  const handleInputBlur = (e) => {
    console.log(`[Input Blur] Field: "${e.target.placeholder || e.target.name || e.target.type}"`);
  };

  const [activeTab, setActiveTab] = useState("login");
  const [loading,   setLoading]   = useState(false);

  const [loginData, setLoginData] = useState({
    username: "",
    userType: "pg_member",   // cosmetic — actual role read from Firestore
    password: "",
  });

  const [signupData, setSignupData] = useState({
    fullName: "",
    username: "",
    userType: "pg_member",
    password: "",
  });

  // ── LOGIN ────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginData.username || !loginData.password) {
      alert("Enter username and password");
      return;
    }
    setLoading(true);
    try {
      const email = loginData.username.trim().toLowerCase() + "@pgmanager.com";
      const userCred = await signInWithEmailAndPassword(auth, email, loginData.password);

      const userDoc = await getDoc(doc(db, "users", userCred.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Derive effective userType — support legacy 'role' field
        const userType =
          userData.userType ||
          (userData.role === "admin" ? "admin" : "pg_member");
        onLogin(userType);
      } else {
        alert("User data not found. Please contact admin.");
      }
    } catch (error) {
      console.error("Login error:", error);
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        alert("Incorrect username or password.");
      } else if (error.code === "auth/user-not-found") {
        alert("No account found. Please sign up first.");
      } else {
        alert(`Login failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── SIGN UP ──────────────────────────────────────────────────────────────
  const handleSignup = async () => {
    if (!signupData.fullName || !signupData.username || !signupData.password) {
      alert("Please fill all fields");
      return;
    }
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(signupData.username)) {
      alert("Username: 3-20 characters, letters/numbers/underscore only");
      return;
    }
    if (signupData.password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const email = signupData.username.trim().toLowerCase() + "@pgmanager.com";
      const userCred = await createUserWithEmailAndPassword(auth, email, signupData.password);

      // Save full user doc — keep 'role' field for backward compat
      await setDoc(doc(db, "users", userCred.user.uid), {
        fullName:  signupData.fullName.trim(),
        name:      signupData.fullName.trim(),   // legacy compat
        username:  signupData.username.toLowerCase(),
        userType:  signupData.userType,
        role:      signupData.userType, // matches userType — no 'student' value
        createdAt: new Date(),
      });

      onLogin(signupData.userType);
    } catch (error) {
      console.error("Signup error:", error);
      if (error.code === "auth/email-already-in-use") {
        alert("Username already taken. Choose another.");
      } else {
        alert(`Signup failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e, action) => {
    if (e.key === "Enter" && !loading) action();
  };

  return (
    <div className="auth-screen">
      {/* Header */}
      <div className="auth-header">
        <div className="auth-logo"><BuildingIcon /></div>
        <h1 className="auth-title">PG Manager</h1>
        <p className="auth-subtitle">Food &amp; Rent Management</p>
      </div>

      {/* Tabs */}
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${activeTab === "login" ? "active" : ""}`}
          onClick={() => setActiveTab("login")}
          disabled={loading}
        >
          Login
        </button>
        <button
          type="button"
          className={`auth-tab ${activeTab === "signup" ? "active" : ""}`}
          onClick={() => setActiveTab("signup")}
          disabled={loading}
        >
          Sign Up
        </button>
      </div>

      {/* ── LOGIN FORM ── */}
      {activeTab === "login" ? (
        <div className="auth-form">
          {/* Role selector */}
          <div className="auth-role-selector">
            {["admin", "pg_member", "mess_member"].map((type) => (
              <button
                type="button"
                key={type}
                className={`auth-role-btn ${loginData.userType === type ? "selected" : ""}`}
                onClick={() => setLoginData({ ...loginData, userType: type })}
                disabled={loading}
              >
                {USER_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          <input
            className="form-input"
            placeholder="Username"
            value={loginData.username}
            onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={loading}
          />
          <input
            className="form-input"
            type="password"
            placeholder="Password"
            value={loginData.password}
            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, handleLogin)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={loading}
          />
          <button
            type="button"
            className="auth-button"
            onClick={handleLogin}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Logging in…" : `Login as ${USER_TYPE_LABELS[loginData.userType]}`}
          </button>
        </div>
      ) : (
        /* ── SIGNUP FORM ── */
        <div className="auth-form">
          {/* Role selector — no public admin signup */}
          <div className="auth-role-selector">
            {["pg_member", "mess_member"].map((type) => (
              <button
                type="button"
                key={type}
                className={`auth-role-btn ${signupData.userType === type ? "selected" : ""}`}
                onClick={() => setSignupData({ ...signupData, userType: type })}
                disabled={loading}
              >
                {USER_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="auth-role-hint">
            {signupData.userType === "pg_member"
              ? "🏠 PG Member — Rent + food charges"
              : "🍽 Mess Member — Food charges only"}
          </div>

          <input
            className="form-input"
            placeholder="Full Name"
            value={signupData.fullName}
            onChange={(e) => setSignupData({ ...signupData, fullName: e.target.value })}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={loading}
          />
          <input
            className="form-input"
            placeholder="Username (letters, numbers, underscore)"
            value={signupData.username}
            onChange={(e) => setSignupData({ ...signupData, username: e.target.value.toLowerCase() })}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={loading}
          />
          <input
            className="form-input"
            type="password"
            placeholder="Password (min 6 characters)"
            value={signupData.password}
            onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, handleSignup)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            disabled={loading}
          />
          <button
            type="button"
            className="auth-button"
            onClick={handleSignup}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </div>
      )}
    </div>
  );
}

export default AuthScreen;