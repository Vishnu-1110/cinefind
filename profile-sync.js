/* Local FastAPI/SQLite account and profile sync. */
(function () {
    const API_HOST = window.location && window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
    const API_ROOT = "http://" + API_HOST + ":8000";
    const PROFILE_KEY = "cinefind_local_profile_id_v10";
    const OUTBOX_KEY = "cinefind_database_outbox_v10";
    const PENDING_PREFS_KEY = "cinefind_pending_database_preferences_v10";
    let outboxQueue = Promise.resolve();
    let preferenceQueue = Promise.resolve();
    let authenticatedProfileId = null;

    function reportDatabaseStatus(state) {
        const messages = {
            connecting: "Connecting to the local database…",
            connected: "Local database connected; saved titles and supported preferences sync here.",
            offline: "Database unavailable. Browser data is retained; pending changes retry after refresh or the next Watchlist change.",
        };
        const message = messages[state] || messages.connecting;
        document.querySelectorAll("[data-database-status]").forEach(node => { node.textContent = message; });
        window.dispatchEvent(new CustomEvent("cinefind-database-status", { detail: { state, message } }));
    }

    function profileId() {
        let id = "";
        try { id = localStorage.getItem(PROFILE_KEY) || ""; } catch (error) {}
        if (/^[a-zA-Z0-9-]{1,64}$/.test(id)) return id;
        id = window.crypto && typeof window.crypto.randomUUID === "function"
            ? window.crypto.randomUUID()
            : "cf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        try { localStorage.setItem(PROFILE_KEY, id); }
        catch (error) { throw new Error("Browser storage is unavailable for this local profile."); }
        return id;
    }

    function setAuthenticatedProfile(id) {
        authenticatedProfileId = typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
    }

    function profilePath(suffix) {
        return "/api/profiles/" + encodeURIComponent(authenticatedProfileId || profileId()) + suffix;
    }

    async function request(path, options = {}) {
        const response = await fetch(API_ROOT + path, { credentials: "include", ...options });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg || "Invalid value").join(" ") : data.detail;
            const error = new Error(detail || "The local database request failed.");
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function readOutbox() {
        try {
            const value = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
            return Array.isArray(value) ? value : [];
        } catch (error) { return []; }
    }

    function writeOutbox(items) {
        try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); }
        catch (error) { throw new Error("Could not queue a database update in browser storage."); }
    }

    function normalizeSavedTitle(item) {
        const mediaType = item.media_type === "tv" ? "tv" : "movie";
        const tmdbId = Number(item.tmdb_id || item.id);
        if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return null;
        const rawDate = item.release_date || item.first_air_date || "";
        const releaseDate = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(rawDate) ? rawDate.slice(0, 10) : null;
        const rawRating = item.rating ?? item.vote_average;
        const rating = Number(rawRating);
        return {
            media_type: mediaType,
            tmdb_id: tmdbId,
            title: String(item.title || item.name || "Unknown Title").trim().slice(0, 300) || "Unknown Title",
            poster_path: typeof item.poster_path === "string" ? item.poster_path.slice(0, 512) : null,
            release_date: releaseDate,
            rating: Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null,
        };
    }

    async function processOutbox() {
        const pending = outboxQueue.catch(() => {}).then(async () => {
            const operations = readOutbox();
            while (operations.length) {
                const operation = operations[0];
                const path = profilePath("/saved-titles");
                try {
                    if (operation.action === "add") {
                        await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation.payload) });
                    } else if (operation.action === "remove") {
                        await request(path + "/" + encodeURIComponent(operation.media_type) + "/" + Number(operation.tmdb_id), { method: "DELETE" });
                    }
                } catch (error) {
                    if (!((operation.action === "add" && error.status === 409) || (operation.action === "remove" && error.status === 404))) {
                        reportDatabaseStatus("offline");
                        throw error;
                    }
                }
                operations.shift();
                writeOutbox(operations);
            }
        });
        outboxQueue = pending;
        return pending;
    }

    function queueOperation(operation) {
        const operations = readOutbox();
        operations.push(operation);
        writeOutbox(operations);
        reportDatabaseStatus("connecting");
        return processOutbox();
    }

    function databaseTitleToBrowser(item) {
        return {
            id: Number(item.tmdb_id),
            media_type: item.media_type === "tv" ? "tv" : "movie",
            title: item.title || "Unknown Title",
            poster_path: item.poster_path || null,
            release_date: item.release_date || "Unknown",
            vote_average: item.rating == null ? null : Number(item.rating),
        };
    }

    async function syncSavedTitles(localItems) {
        reportDatabaseStatus("connecting");
        try {
            await processOutbox();
            let remote = await request(profilePath("/saved-titles"));
            const keys = new Set(remote.map(item => item.media_type + ":" + item.tmdb_id));
            for (const item of localItems || []) {
                const payload = normalizeSavedTitle(item);
                if (!payload) continue;
                const key = payload.media_type + ":" + payload.tmdb_id;
                if (keys.has(key)) continue;
                await queueOperation({ action: "add", payload });
                keys.add(key);
            }
            remote = await request(profilePath("/saved-titles"));
            reportDatabaseStatus("connected");
            return remote.map(databaseTitleToBrowser);
        } catch (error) {
            reportDatabaseStatus("offline");
            throw error;
        }
    }

    function addSavedTitle(item) {
        const payload = normalizeSavedTitle(item);
        if (!payload) return Promise.resolve();
        return queueOperation({ action: "add", payload }).then(() => reportDatabaseStatus("connected"));
    }

    function removeSavedTitle(itemId, mediaType) {
        return queueOperation({ action: "remove", tmdb_id: Number(itemId), media_type: mediaType === "tv" ? "tv" : "movie" })
            .then(() => reportDatabaseStatus("connected"));
    }

    function databasePreferences(localPreferences) {
        return {
            preferred_media_type: ["movie", "tv", "both"].includes(localPreferences.mediaType) ? localPreferences.mediaType : "both",
            movie_genre_ids: Array.isArray(localPreferences.movieGenres) ? localPreferences.movieGenres.map(Number).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 30) : [],
            tv_genre_ids: Array.isArray(localPreferences.tvGenres) ? localPreferences.tvGenres.map(Number).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 30) : [],
            favorite_moods: Array.isArray(localPreferences.favoriteMoods) ? localPreferences.favoriteMoods.filter(id => typeof id === "string").slice(0, 20) : [],
        };
    }

    async function writePreferencePayload(payload) {
        const write = preferenceQueue.catch(() => {}).then(() => request(profilePath("/preferences"), {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        }));
        preferenceQueue = write;
        const result = await write;
        try { localStorage.removeItem(PENDING_PREFS_KEY); } catch (error) {}
        reportDatabaseStatus("connected");
        return result;
    }

    function savePreferences(localPreferences) {
        const payload = databasePreferences(localPreferences);
        try { localStorage.setItem(PENDING_PREFS_KEY, JSON.stringify(payload)); } catch (error) {}
        return writePreferencePayload(payload).catch(error => {
            reportDatabaseStatus("offline");
            throw error;
        });
    }

    async function syncPreferences(localPreferences) {
        reportDatabaseStatus("connecting");
        let pending = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_PREFS_KEY) || "null"); } catch (error) {}
        if (pending && typeof pending === "object") {
            try { return await writePreferencePayload(pending); }
            catch (error) { reportDatabaseStatus("offline"); throw error; }
        }
        try {
            const remote = await request(profilePath("/preferences"));
            reportDatabaseStatus("connected");
            return remote;
        } catch (error) {
            if (error.status !== 404) { reportDatabaseStatus("offline"); throw error; }
            return savePreferences(localPreferences);
        }
    }

    async function submitAccountForm(path, email, password) {
        return request("/api/auth/" + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
    }

    async function restoreSession() {
        try {
            const account = await request("/api/auth/me");
            setAuthenticatedProfile(account.profile_id);
            return account;
        } catch (error) {
            setAuthenticatedProfile(null);
            if (error.status === 401) return null;
            reportDatabaseStatus("offline");
            throw error;
        }
    }

    function registerAccount(email, password) { return submitAccountForm("signup", email, password); }
    function loginAccount(email, password) { return submitAccountForm("login", email, password); }

    async function logoutAccount() {
        await request("/api/auth/logout", { method: "POST" });
        setAuthenticatedProfile(null);
    }
    window.CineFindDatabase = { syncSavedTitles, addSavedTitle, removeSavedTitle, savePreferences, syncPreferences, reportDatabaseStatus, setAuthenticatedProfile, restoreSession, registerAccount, loginAccount, logoutAccount };
})();
