import { useState } from "react";

export default function Navbar({ mode, watchlistCount, likesCount, account, onSelectMedia, onSelectView, onLogin, onSignup, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  return (
    <nav className="navbar" aria-label="Main navigation">
      <a className="logo no-underline" href="./index.html" aria-label="CineFind home">🎬 CineFind</a>
      <button type="button" className="nav-menu-toggle" aria-expanded={menuOpen} aria-controls="cinefind-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? "Close" : "Menu"}</button>
      <div id="cinefind-navigation" className={`nav-links ${menuOpen ? "is-open" : ""}`}>
        <a href="./index.html" onClick={event => { event.preventDefault(); closeMenu(); onSelectMedia("all"); }}>Home</a>
        <button type="button" aria-current={mode === "movie" ? "page" : undefined} className={mode === "movie" ? "nav-current" : ""} onClick={() => { closeMenu(); onSelectMedia("movie"); }}>Movies</button>
        <button type="button" aria-current={mode === "tv" ? "page" : undefined} className={mode === "tv" ? "nav-current" : ""} onClick={() => { closeMenu(); onSelectMedia("tv"); }}>Web Series</button>
        <a href="./mood.html">Mood Discovery</a>
        <a href="#likes" onClick={event => { event.preventDefault(); closeMenu(); onSelectView("likes"); }}>My Likes{likesCount ? ` (${likesCount})` : ""}</a>
        <a href="#watchlist" onClick={event => { event.preventDefault(); closeMenu(); onSelectView("watchlist"); }}>Watchlist{watchlistCount ? ` (${watchlistCount})` : ""}</a>
        {account ? <>
          <span className="nav-account-email" title={account.email}>{account.email}</span>
          <button type="button" className="nav-login-button" onClick={() => { closeMenu(); onLogout(); }}>Logout</button>
        </> : <>
          <button type="button" className="nav-login-button" onClick={() => { closeMenu(); onLogin(); }}>Login</button>
          <button type="button" className="nav-login-button" onClick={() => { closeMenu(); onSignup(); }}>Sign Up</button>
        </>}
      </div>
    </nav>
  );
}
