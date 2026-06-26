// ==UserScript==
// @name         OpenVPB -> Google Voice (bridge + Enter-to-Call + E-to-End + daily counter)
// @namespace    codex-helper
// @version      2.5.1
// @description  OpenVPB dial helper with daily counter. Reuses one Voice tab, Enter confirms Call, E ends call.
// @match        https://www.openvpb.com/VirtualPhoneBank/LoggedIn/*
// @match        https://voice.google.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==
// ==UserScript==
// @name         OpenVPB -> Google Voice (bridge + Enter-to-Call + E-to-End + daily counter)
// @namespace    codex-helper
// @version      2.6.0
// @description  OpenVPB dial helper with daily counter. Reuses one Voice tab, Enter confirms Call, E ends call. Updated for 2025 Google Voice web UI.
// @match        https://www.openvpb.com/VirtualPhoneBank/LoggedIn/*
// @match        https://voice.google.com/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(function () {
    "use strict";

    const KEY_DIAL_REQ = "openvpb_gv_dial_req_v7";
    const KEY_FOCUS_REQ = "openvpb_gv_focus_req_v5";
    const KEY_VOICE_STATE = "openvpb_gv_voice_state_v5";

    if (location.hostname === "voice.google.com") {
        initVoiceBridge();
        return;
    }

    if (location.hostname === "www.openvpb.com" && location.pathname.includes("/VirtualPhoneBank/LoggedIn/")) {
        initOpenVPB();
    }

    function initVoiceBridge() {
        const GV_BASE = "https://voice.google.com/u/3/calls?a=nc,";
        const instanceId = "voice_" + Math.random().toString(36).slice(2);
        let lastDialId = 0;
        let lastFocusId = 0;

        function dialUrl(e164) {
            return GV_BASE + encodeURIComponent(e164);
        }

        function publishState() {
            GM_setValue(KEY_VOICE_STATE, { id: instanceId, ts: Date.now() });
        }

        function isVisibleEnabled(el) {
            if (!el) return false;
            const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            const enabled = !el.disabled && el.getAttribute("aria-disabled") !== "true";
            return visible && enabled;
        }

        function labelOf(el) {
            return (((el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).trim().toLowerCase());
        }

        // Shadow DOM traversal - GV uses web components with shadow roots
        function querySelectorAllDeep(root, selector) {
            var results = Array.from(root.querySelectorAll(selector));
            var allElements = root.querySelectorAll("*");
            for (var i = 0; i < allElements.length; i++) {
                if (allElements[i].shadowRoot) {
                    var nested = querySelectorAllDeep(allElements[i].shadowRoot, selector);
                    for (var j = 0; j < nested.length; j++) {
                        results.push(nested[j]);
                    }
                }
            }
            return results;
        }

        function getDialogRoots() {
            var roots = Array.from(document.querySelectorAll(
                "[role='dialog'], [aria-modal='true'], .mat-mdc-dialog-container, mat-dialog-container, .cdk-overlay-pane"
            ));
            return roots.filter(function (el) {
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            });
        }

        function findCallButtonIn(root) {
            var selectors = "button, [role='button'], a[role='button'], gv-icon-button, [mat-button], [mat-raised-button], [mat-flat-button], [matDialogClose]";
            var candidates = querySelectorAllDeep(root, selectors);
            var i, el, text, ariaLabel, tooltip, icons, icon, iconText, iconName, parentLabel, lbl;

            // Pass 1: Exact text match "call"
            for (i = 0; i < candidates.length; i++) {
                el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                text = (el.textContent || "").trim().toLowerCase();
                if (text === "call") return el;
            }

            // Pass 2: aria-label exact match
            for (i = 0; i < candidates.length; i++) {
                el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                ariaLabel = (el.getAttribute("aria-label") || "").trim().toLowerCase();
                if (ariaLabel === "call") return el;
            }

            // Pass 3: data-tooltip or title
            for (i = 0; i < candidates.length; i++) {
                el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                tooltip = (el.getAttribute("data-tooltip") || el.getAttribute("title") || "").trim().toLowerCase();
                if (tooltip === "call" || tooltip === "make a call") return el;
            }

            // Pass 4: Button containing a phone/call mat-icon
            for (i = 0; i < candidates.length; i++) {
                el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                icons = el.querySelectorAll("mat-icon, .material-icons, i.material-icons, gv-icon, [data-icon]");
                for (var k = 0; k < icons.length; k++) {
                    icon = icons[k];
                    iconText = (icon.textContent || "").trim().toLowerCase();
                    iconName = (icon.getAttribute("data-icon") || icon.getAttribute("fonticon") || "").toLowerCase();
                    if (iconText === "call" || iconText === "phone" || iconName === "call" || iconName === "phone") {
                        parentLabel = labelOf(el);
                        if (!parentLabel.includes("end") && !parentLabel.includes("hang")) {
                            return el;
                        }
                    }
                }
            }

            // Pass 5: Broader label match with exclusions
            for (i = 0; i < candidates.length; i++) {
                el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                lbl = labelOf(el);
                if (!/\bcall\b/.test(lbl)) continue;
                if (/\bcalls\b/.test(lbl)) continue;
                if (lbl.includes("cancel")) continue;
                if (lbl.includes("end call") || lbl.includes("hang up") || lbl.includes("hangup")) continue;
                if (lbl.includes("call log")) continue;
                return el;
            }

            return null;
        }

        function findVisibleCallButton() {
            var dialogRoots, i, btn, overlayContainer;

            // Strategy 1: Inside visible dialogs/overlays
            dialogRoots = getDialogRoots();
            for (i = 0; i < dialogRoots.length; i++) {
                btn = findCallButtonIn(dialogRoots[i]);
                if (btn) return btn;
            }

            // Strategy 2: CDK overlay container (Angular Material)
            overlayContainer = document.querySelector(".cdk-overlay-container");
            if (overlayContainer) {
                btn = findCallButtonIn(overlayContainer);
                if (btn) return btn;
            }

            // Strategy 3: Whole document
            return findCallButtonIn(document);
        }

        function findVisibleEndCallButton() {
            var selectors = "button, [role='button'], gv-icon-button, [mat-button]";
            var candidates = querySelectorAllDeep(document, selectors);
            for (var i = 0; i < candidates.length; i++) {
                var el = candidates[i];
                if (!isVisibleEnabled(el)) continue;
                var lbl = labelOf(el);
                if (lbl.includes("end call") || lbl.includes("hang up") || lbl.includes("hangup")) {
                    return el;
                }
            }
            return null;
        }

        function focusCallButtonIfPresent() {
            var btn = findVisibleCallButton();
            if (btn) {
                btn.focus();
                try { btn.scrollIntoView({ block: "center" }); } catch (_e) { /* ignore */ }
            }
        }

        // Retry loop - keeps checking for the Call button over time
        function retryFocusCall(maxAttempts, interval) {
            var attempts = 0;
            var timer = setInterval(function () {
                attempts++;
                var btn = findVisibleCallButton();
                if (btn) {
                    btn.focus();
                    clearInterval(timer);
                }
                if (attempts >= maxAttempts) {
                    clearInterval(timer);
                }
            }, interval);
        }

        function enableVoiceHotkeys() {
            var obs = new MutationObserver(function () {
                setTimeout(focusCallButtonIfPresent, 40);
            });
            obs.observe(document.body, { childList: true, subtree: true });

            window.addEventListener(
                "keydown",
                function (e) {
                    var tag = (e.target && e.target.tagName) ? e.target.tagName : "";
                    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
                    if (e.ctrlKey || e.metaKey || e.altKey) return;

                    if (e.key === "Enter") {
                        var callBtn = findVisibleCallButton();
                        if (!callBtn) return;
                        e.preventDefault();
                        e.stopPropagation();
                        callBtn.click();
                        return;
                    }

                    if (String(e.key || "").toLowerCase() === "e") {
                        var endBtn = findVisibleEndCallButton();
                        if (!endBtn) return;
                        e.preventDefault();
                        e.stopPropagation();
                        endBtn.click();
                    }
                },
                true
            );
        }

        function handleDial(req) {
            if (!req || !req.id || !req.e164) return;
            if (req.targetId && req.targetId !== instanceId) return;
            if (req.id <= lastDialId) return;
            lastDialId = req.id;

            var target = dialUrl(req.e164);
            if (location.href !== target) location.href = target;

            // Retry over up to 5 seconds instead of two fixed timeouts
            retryFocusCall(20, 250);
        }

        function handleFocus(req) {
            if (!req || !req.id) return;
            if (req.targetId && req.targetId !== instanceId) return;
            if (req.id <= lastFocusId) return;
            lastFocusId = req.id;
            try {
                window.focus();
            } catch (_e) { /* ignore */ }
            setTimeout(focusCallButtonIfPresent, 120);
        }

        GM_addValueChangeListener(KEY_DIAL_REQ, function (_k, _o, n) { handleDial(n); });
        GM_addValueChangeListener(KEY_FOCUS_REQ, function (_k, _o, n) { handleFocus(n); });

        enableVoiceHotkeys();
        publishState();
        setInterval(publishState, 1000);

        Promise.resolve(GM_getValue(KEY_DIAL_REQ, null)).then(function (req) {
            if (req && req.ts && Date.now() - req.ts < 15000) handleDial(req);
        });
    }

    function initOpenVPB() {
        const NAME_SEL = "#contactName";
        const PHONE_SEL = "#openvpb-phone-link-current";
        const HOTKEY = "d";
        const COUNTER_KEY = "openvpb_gv_daily_counter_v11";

        let current = { name: "", e164: "" };
        let counter = loadCounter();
        let voiceState = { id: "", ts: 0 };
        let lastVoiceOpenAttempt = 0;

        function dayStamp(d) {
            const dt = d || new Date();
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, "0");
            const day = String(dt.getDate()).padStart(2, "0");
            return `${y}-${m}-${day}`;
        }

        function loadCounter() {
            const today = dayStamp();
            try {
                const raw = localStorage.getItem(COUNTER_KEY);
                if (!raw) return { date: today, count: 0 };
                const parsed = JSON.parse(raw);
                if (!parsed || parsed.date !== today) return { date: today, count: 0 };
                let c = Number(parsed.count);
                if (!Number.isFinite(c) || c < 0) c = 0;
                return { date: today, count: Math.floor(c) };
            } catch {
                return { date: today, count: 0 };
            }
        }

        function saveCounter() {
            localStorage.setItem(COUNTER_KEY, JSON.stringify(counter));
        }

        function ensureToday() {
            const today = dayStamp();
            if (counter.date !== today) {
                counter = { date: today, count: 0 };
                saveCounter();
                updateUI();
            }
        }

        function incrementCounter() {
            ensureToday();
            counter.count += 1;
            saveCounter();
            updateUI();
        }

        function toE164(raw) {
            if (!raw) return null;
            const digits = String(raw).replace(/\D/g, "");
            if (digits.length === 10) return `+1${digits}`;
            if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
            if (String(raw).trim().startsWith("+") && digits.length > 11) return `+${digits}`;
            return null;
        }

        function readContact() {
            const nameEl = document.querySelector(NAME_SEL);
            const phoneEl = document.querySelector(PHONE_SEL);
            const name = (nameEl?.textContent || "").trim();
            const href = (phoneEl?.getAttribute("href") || "").replace(/^tel:/i, "").trim();
            const txt = (phoneEl?.textContent || "").trim();
            const e164 = toE164(href || txt);
            return { name, e164 };
        }

        async function refreshVoiceState() {
            const s = await Promise.resolve(GM_getValue(KEY_VOICE_STATE, { id: "", ts: 0 }));
            voiceState = s || { id: "", ts: 0 };
            updateVoiceIndicator();
        }

        function voiceConnected() {
            return !!voiceState.id && Date.now() - Number(voiceState.ts || 0) < 5000;
        }

        async function dial(e164) {
            ensureToday();
            const num = e164 || current.e164;

            if (!num) {
                setStatus("No valid phone");
                return;
            }

            await refreshVoiceState();

            if (!voiceConnected()) {
                const now = Date.now();
                if (now - lastVoiceOpenAttempt > 10000) {
                    window.open("https://voice.google.com/u/3/calls", "openvpbVoiceBridge");
                    lastVoiceOpenAttempt = now;
                    setStatus("Opened Voice tab. Wait 1-2 sec, then press D again.");
                } else {
                    setStatus("Waiting for Voice tab to connect...");
                }
                return;
            }

            const reqId = Date.now();
            await Promise.resolve(
                GM_setValue(KEY_DIAL_REQ, {
                    id: reqId,
                    ts: Date.now(),
                    e164: num,
                    targetId: voiceState.id
                })
            );
            await Promise.resolve(
                GM_setValue(KEY_FOCUS_REQ, {
                    id: reqId,
                    ts: Date.now(),
                    targetId: voiceState.id
                })
            );

            incrementCounter();
            setStatus("Dial sent to existing Voice tab");
        }

        function ensureUI() {
            if (document.getElementById("vpb-gv-box")) return;

            const box = document.createElement("div");
            box.id = "vpb-gv-box";
            box.style.cssText = [
                "position:fixed",
                "left:50%",
                "top:16px",
                "transform:translateX(-50%)",
                "z-index:999999",
                "background:rgba(255,255,255,0.82)",
                "backdrop-filter:blur(4px)",
                "color:#111827",
                "border:2px solid #111827",
                "padding:10px 12px",
                "border-radius:10px",
                "font:13px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
                "box-shadow:0 8px 22px rgba(0,0,0,.15)",
                "min-width:300px"
            ].join(";");

            box.innerHTML =
                '<div id="vpb-gv-name" style="font-weight:600;margin-bottom:4px">No contact</div>' +
                '<div id="vpb-gv-phone" style="opacity:.9;margin-bottom:6px">-</div>' +
                '<div id="vpb-gv-count" style="opacity:.9;margin-bottom:4px">Calls today: 0</div>' +
                '<div id="vpb-gv-voice" style="opacity:.9;margin-bottom:8px">Voice: checking...</div>' +
                '<div id="vpb-gv-status" style="opacity:.75;margin-bottom:8px">Ready</div>' +
                '<button id="vpb-gv-dial" style="border:1px solid #111827;background:#2563eb;color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer">Dial in Google Voice (D)</button>';

            document.body.appendChild(box);
            document.getElementById("vpb-gv-dial").addEventListener("click", () => dial());
        }

        function setStatus(text) {
            const el = document.getElementById("vpb-gv-status");
            if (el) el.textContent = text;
        }

        function updateVoiceIndicator() {
            const el = document.getElementById("vpb-gv-voice");
            if (!el) return;
            el.textContent = voiceConnected() ? "Voice: connected" : "Voice: not connected";
        }

        function updateUI() {
            const nameEl = document.getElementById("vpb-gv-name");
            const phoneEl = document.getElementById("vpb-gv-phone");
            const countEl = document.getElementById("vpb-gv-count");

            if (nameEl) nameEl.textContent = current.name || "Contact loaded";
            if (phoneEl) phoneEl.textContent = current.e164 || "No valid phone";
            if (countEl) countEl.textContent = `Calls today: ${counter.count}`;
            updateVoiceIndicator();
        }

        function scan() {
            ensureToday();
            const next = readContact();
            if (!next.e164) return;
            if (next.e164 !== current.e164 || next.name !== current.name) {
                current = next;
                updateUI();
                setStatus("Contact updated");
            }
        }

        let timer = null;
        function scheduleScan() {
            clearTimeout(timer);
            timer = setTimeout(scan, 120);
        }

        ensureUI();
        updateUI();
        scan();

        const root = document.querySelector(".script-person-header") || document.body;
        new MutationObserver(scheduleScan).observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["href"]
        });

        window.addEventListener("keydown", (e) => {
            const tag = e.target?.tagName || "";
            if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey) return;
            if (String(e.key || "").toLowerCase() === HOTKEY) dial();
        });

        setInterval(refreshVoiceState, 1500);
        refreshVoiceState();
    }
})();