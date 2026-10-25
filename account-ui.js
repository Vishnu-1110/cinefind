/* Login and registration UI for the local FastAPI account service. */
(function () {
    const database = window.CineFindDatabase;
    const loginModal = document.getElementById("loginModal");
    const signupModal = document.getElementById("signupModal");
    const guestWatchlistKey = "cinefind_guest_watchlist_before_login_v1";
    const guestPreferencesKey = "cinefind_guest_preferences_before_login_v1";
    const preferencesKey = "cinefind_recommendation_preferences_v71";
    let activeModal = null;
    let returnFocus = null;
    let activeAccount = null;
    let accountInitializationPromise = Promise.resolve();

    function clearPasswords() {
        ["loginPassword", "signupPassword", "signupConfirmPassword"].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = "";
        });
    }

    function setAccountUI(account) {
        activeAccount = account || null;
        const login = document.getElementById("authOpenLoginButton");
        const signup = document.getElementById("authOpenSignupButton");
        const email = document.getElementById("authAccountEmail");
        const logout = document.getElementById("authLogoutButton");
        if (login) login.hidden = Boolean(activeAccount);
        if (signup) signup.hidden = Boolean(activeAccount);
        if (email) {
            email.hidden = !activeAccount;
            email.textContent = activeAccount ? activeAccount.email : "";
        }
        if (logout) logout.hidden = !activeAccount;
    }

    function rememberGuestData() {
        try {
            if (localStorage.getItem(guestWatchlistKey) === null) {
                localStorage.setItem(guestWatchlistKey, JSON.stringify(loadWatchlist()));
            }
            if (localStorage.getItem(guestPreferencesKey) === null) {
                const preferences = localStorage.getItem(preferencesKey);
                localStorage.setItem(guestPreferencesKey, preferences === null ? "__CINEFIND_NO_GUEST_PREFS__" : preferences);
            }
        } catch (error) {}
    }

    function restoreGuestData() {
        try {
            const savedList = localStorage.getItem(guestWatchlistKey);
            if (savedList !== null) {
                const items = JSON.parse(savedList);
                if (Array.isArray(items)) saveWatchlist(items);
                localStorage.removeItem(guestWatchlistKey);
            }
            const savedPreferences = localStorage.getItem(guestPreferencesKey);
            if (savedPreferences !== null) {
                if (savedPreferences === "__CINEFIND_NO_GUEST_PREFS__") localStorage.removeItem(preferencesKey);
                else localStorage.setItem(preferencesKey, savedPreferences);
                localStorage.removeItem(guestPreferencesKey);
            }
        } catch (error) {}
        updateWatchlistCount();
        displayWatchlist();
    }

    function announceAccountChange(account) {
        window.dispatchEvent(new CustomEvent("cinefind-auth-changed", { detail: { account: account || null } }));
    }

    function openModal(mode) {
        const next = mode === "signup" ? signupModal : loginModal;
        if (!next) return;
        if (!activeModal) returnFocus = document.activeElement;
        clearPasswords();
        next.querySelectorAll(".auth-message").forEach(node => { node.textContent = ""; });
        [loginModal, signupModal].forEach(modal => {
            if (modal) modal.setAttribute("aria-hidden", String(modal !== next));
        });
        activeModal = next;
        document.body.classList.add("auth-modal-open");
        const firstInput = next.querySelector("input");
        if (firstInput) firstInput.focus();
    }

    function closeModal() {
        if (!activeModal) return;
        activeModal.setAttribute("aria-hidden", "true");
        activeModal = null;
        clearPasswords();
        document.body.classList.remove("auth-modal-open");
        if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
        returnFocus = null;
    }

    async function submitAccount(event, mode) {
        event.preventDefault();
        const signup = mode === "signup";
        const prefix = signup ? "signup" : "login";
        const email = document.getElementById(prefix + "Email").value.trim();
        const passwordInput = document.getElementById(prefix + "Password");
        const password = passwordInput.value;
        const confirmPassword = signup ? document.getElementById("signupConfirmPassword").value : "";
        const message = document.getElementById(prefix + "Message");
        const button = event.currentTarget.querySelector('button[type="submit"]');
        if (!email || !password || (signup && !confirmPassword)) message.textContent = "Please complete all required fields.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) message.textContent = "Enter a valid email address.";
        else if (signup && password.length < 8) message.textContent = "Choose a password with at least 8 characters.";
        else if (password.length > 128) message.textContent = "Password must be 128 characters or fewer.";
        else if (signup && password !== confirmPassword) message.textContent = "The passwords do not match.";
        else if (!database) message.textContent = "The local account service is unavailable. Start the CineFind backend and try again.";
        else {
            if (button) button.disabled = true;
            message.textContent = signup ? "Creating your account…" : "Signing in…";
            try {
                await accountInitializationPromise;
                const account = signup
                    ? await database.registerAccount(email, password)
                    : await database.loginAccount(email, password);
                rememberGuestData();
                database.setAuthenticatedProfile(account.profile_id);
                setAccountUI(account);
                await syncWatchlistWithDatabase();
                announceAccountChange(account);
                message.textContent = signup ? "Your account is ready." : "You are signed in.";
                closeModal();
            } catch (error) {
                const errorText = error && error.message ? String(error.message) : "";
                message.textContent = window.CineFindIsGitHubPagesPreview || /failed to fetch|networkerror|load failed/i.test(errorText)
                    ? (window.CineFindIsGitHubPagesPreview
                        ? "GitHub Pages only hosts website files. Deploy the FastAPI app with a hosted database, then open its app address to use accounts."
                        : "Cannot reach CineFind API at " + (window.CineFindApiRoot || window.location.origin) + ". Start FastAPI or check the deployed app.")
                    : errorText || "We could not complete that request. Check the backend and try again.";
            } finally {
                clearPasswords();
                if (button) button.disabled = false;
            }
        }
        if (message.textContent && !message.textContent.includes("…")) clearPasswords();
    }

    function bindModal(modal, closeId, formId, mode) {
        if (!modal) return;
        const close = document.getElementById(closeId);
        const backdrop = modal.querySelector("[data-auth-backdrop]");
        const form = document.getElementById(formId);
        if (close) close.addEventListener("click", closeModal);
        if (backdrop) backdrop.addEventListener("click", closeModal);
        if (form) form.addEventListener("submit", event => submitAccount(event, mode));
    }

    const loginButton = document.getElementById("authOpenLoginButton");
    const signupButton = document.getElementById("authOpenSignupButton");
    if (loginButton) loginButton.addEventListener("click", () => openModal("login"));
    if (signupButton) signupButton.addEventListener("click", () => openModal("signup"));
    bindModal(loginModal, "loginCloseButton", "loginForm", "login");
    bindModal(signupModal, "signupCloseButton", "signupForm", "signup");
    const loginToSignup = document.getElementById("loginToSignupLink");
    const signupToLogin = document.getElementById("signupToLoginLink");
    if (loginToSignup) loginToSignup.addEventListener("click", () => openModal("signup"));
    if (signupToLogin) signupToLogin.addEventListener("click", () => openModal("login"));
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

    const logout = document.getElementById("authLogoutButton");
    if (logout) logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
            await database.logoutAccount();
            setAccountUI(null);
            restoreGuestData();
            announceAccountChange(null);
            await syncWatchlistWithDatabase();
        } catch (error) {
            window.alert("Could not sign out. Check that the local CineFind backend is running, then try again.");
        } finally {
            logout.disabled = false;
        }
    });

    async function initializeAccountSession() {
        if (!database) return;
        try {
            const account = await database.restoreSession();
            if (account) {
                rememberGuestData();
                setAccountUI(account);
            } else {
                database.setAuthenticatedProfile(null);
                restoreGuestData();
                setAccountUI(null);
            }
        } catch (error) {
            setAccountUI(null);
        }
        await syncWatchlistWithDatabase();
    }

    accountInitializationPromise = initializeAccountSession();
    window.CineFindAccountReady = accountInitializationPromise;
})();

