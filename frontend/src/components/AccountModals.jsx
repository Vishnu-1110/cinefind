import { useEffect, useRef, useState } from "react";
import { backendApi } from "../services/tmdb";

export default function AccountModals({ mode, onClose, onSwitch, onAuthenticated }) {
  const emailRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!mode) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => emailRef.current?.focus());
    const onKeyDown = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [mode, onClose]);

  useEffect(() => { setEmail(""); setPassword(""); setConfirmPassword(""); setMessage(""); setSubmitting(false); }, [mode]);
  if (!mode) return null;
  const signup = mode === "signup";
  const submit = async event => {
    event.preventDefault();
    if (!email.trim() || !password || (signup && !confirmPassword)) setMessage("Please complete all required fields.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) setMessage("Enter a valid email address.");
    else if (signup && password !== confirmPassword) setMessage("The passwords do not match.");
    else {
      setSubmitting(true);
      setMessage("");
      try {
        const account = await backendApi(`/api/auth/${signup ? "signup" : "login"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        setMessage(signup ? "Your account is ready. You are signed in." : "You are signed in.");
        onAuthenticated?.(account);
      } catch (error) {
        setMessage(error.message || "CineFind could not sign you in. Please try again.");
      } finally {
        setPassword(""); setConfirmPassword(""); setSubmitting(false);
      }
    }
  };

  return (
    <div className="auth-modal fixed inset-0 z-[100] grid place-items-center p-4" aria-hidden="false" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal-backdrop absolute inset-0" onMouseDown={onClose} />
      <section className="auth-dialog relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby={signup ? "signupTitle" : "loginTitle"}>
        <button type="button" className="auth-close" aria-label="Close" onClick={onClose}>×</button>
        <p className="auth-eyebrow">CINEFIND ACCOUNT</p>
        <h2 id={signup ? "signupTitle" : "loginTitle"}>{signup ? "Create your account" : "Welcome to CineFind"}</h2>
        <form onSubmit={submit} noValidate>
          <label className="auth-field">Email<input ref={emailRef} type="email" autoComplete="username" placeholder="Enter your email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label className="auth-field">Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          {signup && <label className="auth-field">Confirm Password<input type="password" autoComplete="new-password" placeholder="Confirm your password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>}
          <p className="auth-message" role="status" aria-live="polite">{message}</p>
          <button type="submit" className="auth-submit w-full" disabled={submitting}>{submitting ? "Please wait…" : signup ? "Create Account" : "Login"}</button>
        </form>
        <p className="auth-switch-copy">{signup ? "Already have an account? " : "Don't have an account? "}
          <button type="button" className="auth-switch-button" onClick={() => onSwitch(signup ? "login" : "signup")}>{signup ? "Login" : "Sign Up"}</button>
        </p>
        <p className="auth-security-note">Your password is sent only to the configured CineFind API. The backend stores a salted password hash.</p>
      </section>
    </div>
  );
}
