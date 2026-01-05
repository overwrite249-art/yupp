// ==UserScript==
// @name         Yupp.ai Ultimate GUI (v6.0 - Stealth Suite)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Native UI with Auto-Blur, Model Unlocker, and Stealth Auto-Prompter. Press '[' to open.
// @author       You
// @match        https://yupp.ai/*
// @connect      api.deepinfra.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const TRIGGER_KEY = '[';
    const UI_ID = 'yupp-ultimate-gui';
    const NOTIF_ID = 'yupp-toast-notif';
    const STORAGE_KEY = 'yupp_gui_state_v6';

    // --- STATE ---
    let isBuilt = false;
    let isVisible = false;
    let breakAutoPrompt = false;

    // --- DEFINITIONS: MISC FEATURES ---
    const FEATURE_MAP = {
        'feat-wide': {
            label: 'Wide Mode',
            action: (on) => {
                const box = document.querySelector('.max-w-prompt-box');
                if(box) box.style.maxWidth = on ? '100%' : '';
            }
        },
        'feat-sidebar': {
            label: 'Hide Sidebar',
            action: (on) => {
                const sb = document.querySelector('[data-slot="sidebar"]');
                if(sb) sb.style.display = on ? 'none' : 'block';
            }
        },
        'feat-zen': {
            label: 'Zen Mode',
            action: (on) => {
                const header = document.querySelector('header');
                const sidebar = document.querySelector('[data-slot="sidebar"]');
                if(header) header.style.display = on ? 'none' : '';
                if(sidebar) sidebar.style.display = on ? 'none' : '';
            }
        },
        'feat-mono': {
            label: 'Hacker Font',
            action: (on) => {
                document.body.style.fontFamily = on ? 'var(--font-mono)' : '';
            }
        },
        'feat-header': {
            label: 'Hide Header',
            action: (on) => {
                const header = document.querySelector('header');
                if(header) header.style.opacity = on ? '0' : '1';
            }
        },
        'feat-avatars': {
            label: 'Hide Avatars',
            action: (on) => {
                let style = document.getElementById('yupp-hide-avatars');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'yupp-hide-avatars';
                    style.innerHTML = `img[alt="emulator"], img[alt="User"], [data-testid="sidebar-profile-avatar"] { display: none !important; }`;
                    document.head.appendChild(style);
                }
                style.disabled = !on;
            }
        },
        'feat-border': {
            label: 'Debug Borders',
            action: (on) => {
                document.body.style.outline = on ? '1px solid rgba(255,50,0,0.3)' : '';
            }
        },
        'feat-invert': {
            label: 'Invert Colors',
            action: (on) => {
                document.documentElement.style.filter = on ? 'invert(1) hue-rotate(180deg)' : '';
            }
        }
    };

    // --- 1. CORE LISTENER ---
    document.addEventListener('keydown', (e) => {
        if (e.key === TRIGGER_KEY && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            if (!isBuilt) buildUI();
            toggleUI();
        }
    });

    function toggleUI() {
        const el = document.getElementById(UI_ID);
        const mainContent = document.querySelector('main') || document.body;

        isVisible = !isVisible;

        if (isVisible) {
            el.style.opacity = '1';
            el.style.transform = 'translate(-50%, -50%) scale(1)';
            el.style.pointerEvents = 'auto';
            // Auto Blur
            mainContent.style.transition = 'filter 0.2s ease-out';
            mainContent.style.filter = 'blur(8px)';
        } else {
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -45%) scale(0.95)';
            el.style.pointerEvents = 'none';
            // Remove Blur
            mainContent.style.filter = '';
        }
    }

    function showNotification(msg) {
        let notif = document.getElementById(NOTIF_ID);
        if(!notif) {
            notif = document.createElement('div');
            notif.id = NOTIF_ID;
            document.body.appendChild(notif);
        }
        notif.innerHTML = msg;
        notif.classList.add('show');
        setTimeout(() => notif.classList.remove('show'), 3000);
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // --- 2. STORAGE HELPERS ---
    function getSavedState() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveFeatureState(id, isOn) {
        const state = getSavedState();
        state[id] = isOn;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    function clearStorage() {
        localStorage.removeItem(STORAGE_KEY);
        showNotification('Config reset. Reloading...');
        setTimeout(() => location.reload(), 1000);
    }

    // --- 3. UNLOCKER LOGIC ---
    function applyAvailabilityUnlocker() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("json")) {
                const clone = response.clone();
                const text = await clone.text();
                if (text.includes('isUnavailableForUser')) {
                    const modifiedText = text.replace(/"isUnavailableForUser":\s*true/g, '"isUnavailableForUser":false');
                    return new Response(modifiedText, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
            }
            return response;
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4 && this.responseText) {
                    if (this.responseText.includes('isUnavailableForUser":true')) {
                        const modified = this.responseText.replace(/"isUnavailableForUser":\s*true/g, '"isUnavailableForUser":false');
                        Object.defineProperty(this, 'responseText', { value: modified });
                        Object.defineProperty(this, 'response', { value: modified });
                    }
                }
            });
            originalOpen.apply(this, arguments);
        };

        const sendBtn = document.querySelector('button[data-slot="tooltip-trigger"]');
        if(sendBtn) {
            sendBtn.disabled = false;
            sendBtn.classList.remove('disabled:cursor-not-allowed');
        }
    }

    // --- 4. STEALTH AUTO PROMPTER LOGIC ---
    function tryGMRequest() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.deepinfra.com/v1/openai/chat/completions',
                headers: {
                    'Accept': '*/*',
                    'Accept-Language': 'en-US;q=0.8,en;q=0.7',
                    'Content-Type': 'application/json',
                    'Origin': 'https://g4f.dev',
                    'Referer': 'https://g4f.dev/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                data: JSON.stringify({
                    'model': 'openai/gpt-oss-120b',
                    'messages': [{ 'role': 'user', 'content': 'Generate a single creative image generation prompt. Output ONLY the prompt text, no quotes. Start with generate me an image of' }],
                    'stream': false
                }),
                timeout: 8000,
                onload: function(res) {
                    if (res.status === 200) {
                        try {
                            const data = JSON.parse(res.responseText);
                            resolve(data.choices[0].message.content.trim());
                        } catch (e) { reject("Parse Error"); }
                    } else { reject("Status " + res.status); }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject("Timeout")
            });
        });
    }

    async function fetchStealthPrompt() {
        try {
            return await tryGMRequest();
        } catch (e) {
            // Fallback if GM fails (e.g. permission denied)
            console.warn("GM failed, falling back to fetch", e);
            try {
                const req = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        'model': 'openai/gpt-oss-120b',
                        'messages': [{ 'role': 'user', 'content': 'Generate a creative prompt.' }],
                        'stream': false
                    })
                });
                const data = await req.json();
                return data.choices[0].message.content.trim();
            } catch(err) {
                return "A futuristic cyberpunk city in the rain, neon lights, 4k render";
            }
        }
    }

    async function typeAndSend(text) {
        const input = document.querySelector("[data-testid='prompt-input']");
        if (!input) {
            showNotification('❌ Chat input not found');
            return;
        }

        input.focus();
        // React-compatible value setter
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        let str = "";

        // Simulate human typing
        for(let char of text) {
            if(breakAutoPrompt) return;
            str += char;
            setter.call(input, str);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            // Randomize delay slightly for anti-bot evasion
            await sleep(Math.floor(Math.random() * 10) + 5);
        }

        if(breakAutoPrompt) return;
        await sleep(600); // Wait for UI to register

        const sendBtn = document.querySelector('button[type="submit"]');
        if (sendBtn) {
            sendBtn.click();
            showNotification('✅ Prompt Sent');
        }
    }

    // --- 5. UI BUILDER ---
    function buildUI() {
        const savedState = getSavedState();

        const style = document.createElement('style');
        style.innerHTML = `
            #${UI_ID} {
                position: fixed; top: 50%; left: 50%; width: 500px; height: 480px;
                transform: translate(-50%, -45%) scale(0.95); opacity: 0;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 99999; pointer-events: none;
                background: var(--color-surface-300);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-card);
                box-shadow: var(--shadow-surface-l2);
                color: var(--color-text-primary);
                font-family: var(--font-inter), sans-serif;
                display: flex; flex-direction: column; overflow: hidden;
            }
            .y-head { padding: 16px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
            .y-title { font-size: 1.1rem; font-weight: 600; display: flex; gap: 8px; align-items: center; font-family: var(--font-poly-sans); }
            .y-dot { width: 8px; height: 8px; background: var(--color-brand-orange); border-radius: 50%; box-shadow: 0 0 8px var(--color-brand-orange); }

            .y-tabs { display: flex; gap: 4px; padding: 8px 16px; background: var(--color-surface-200); }
            .y-tab-btn {
                flex: 1; padding: 8px; border-radius: 6px; border: none; background: transparent;
                color: var(--color-text-secondary); font-size: 0.85rem; cursor: pointer; transition: 0.2s;
            }
            .y-tab-btn:hover { background: var(--color-element-hover); color: var(--color-text-primary); }
            .y-tab-btn.active { background: var(--color-element); color: var(--color-text-primary); font-weight: 600; box-shadow: 0 1px 2px #00000010; }

            .y-content { flex: 1; padding: 16px; overflow-y: auto; position: relative; }
            .y-page { display: none; animation: fadeIn 0.2s; }
            .y-page.active { display: block !important; }

            .y-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .y-full-btn { width: 100%; margin-bottom: 10px; }

            .y-btn {
                padding: 12px; border-radius: 12px; border: 1px solid var(--color-border);
                background: var(--color-surface-100); color: var(--color-text-primary);
                font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
                text-align: left; display: flex; align-items: center; gap: 8px; position: relative; overflow: hidden;
            }
            .y-btn:hover { background: var(--color-element-hover); border-color: var(--color-text-secondary); }
            .y-btn.on { background: var(--color-brand-orange); color: white; border-color: transparent; }
            .y-btn small { opacity: 0.6; font-size: 0.7em; margin-left: auto; }

            .y-btn.special { border: 1px solid var(--color-brand-orange); background: rgba(255, 165, 0, 0.05); }
            .y-btn.special:hover { background: var(--color-brand-orange); color: white; }

            .y-btn.bot { border: 1px solid #00e5ff; background: rgba(0, 229, 255, 0.05); color: #00e5ff; }
            .y-btn.bot:hover { background: #00e5ff; color: #000; }
            .y-btn.bot svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }

            .y-btn.danger { color: var(--color-destructive); border-color: var(--color-destructive); opacity: 0.8; }
            .y-btn.danger:hover { background: var(--color-destructive); color: white; opacity: 1; }

            .y-code { font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-text-secondary); line-height: 1.5; background: var(--color-surface-100); padding: 10px; border-radius: 8px; border: 1px solid var(--color-border); }

            #${NOTIF_ID} {
                position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
                background: #111; color: #fff; padding: 10px 20px; border-radius: 30px;
                font-size: 0.9rem; pointer-events: none; opacity: 0; transition: all 0.3s; z-index: 100000;
                box-shadow: 0 5px 20px rgba(0,0,0,0.3); border: 1px solid #333; font-family: var(--font-inter);
            }
            #${NOTIF_ID}.show { opacity: 1; transform: translateX(-50%) translateY(0); }

            @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);

        const gui = document.createElement('div');
        gui.id = UI_ID;
        gui.innerHTML = `
            <div class="y-head">
                <div class="y-title"><div class="y-dot"></div> Yupp Ultimate</div>
                <div style="font-size:0.7rem; opacity:0.5">v6.0</div>
            </div>

            <div class="y-tabs">
                <button class="y-tab-btn active" id="btn-tab-main">Main</button>
                <button class="y-tab-btn" id="btn-tab-misc">Misc</button>
                <button class="y-tab-btn" id="btn-tab-docs">Docs</button>
                <button class="y-tab-btn" id="btn-tab-system">System</button>
            </div>

            <div class="y-content">
                <!-- MAIN TAB -->
                <div id="tab-main" class="y-page active">
                    <p style="font-size: 0.8rem; margin-bottom: 12px; opacity: 0.7">Tools</p>

                    <button class="y-btn special y-full-btn" id="y-unlock-btn">
                        <span>Remove Model Bans</span>
                        <small>FIX</small>
                    </button>

                    <button class="y-btn bot y-full-btn" id="y-autoprompt-btn">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
                        <span>Auto prompt</span>
                        <small>1-SHOT</small>
                    </button>

                    <p style="font-size: 0.7rem; opacity: 0.5; line-height: 1.4; margin-top: 10px;">
                        <strong>Auto Prompt:</strong> Fetches a creative prompt via stealth API, types it like a human, sends it, and stops. Use for quick testing.
                    </p>
                </div>

                <!-- MISC TAB -->
                <div id="tab-misc" class="y-page">
                    <div class="y-grid" id="y-misc-grid"></div>
                </div>

                <!-- SYSTEM TAB -->
                <div id="tab-system" class="y-page">
                    <div class="y-grid">
                        <button class="y-btn" id="y-reload-btn">Force Reload</button>
                        <button class="y-btn" id="y-theme-btn">Toggle Theme</button>
                        <button class="y-btn danger" id="y-reset-btn">Reset Config</button>
                    </div>
                </div>

                <!-- DOCS TAB (FOR AI) -->
                <div id="tab-docs" class="y-page">
                    <div class="y-code">
                        <strong>// TECHNICAL DOCUMENTATION</strong><br><br>
                        <strong>1. Auto-Prompter (Stealth):</strong><br>
                        Uses <code>GM_xmlhttpRequest</code> to bypass CORS/Network monitoring.<br>
                        Injects text via <code>React value setter</code> + <code>input event</code>.<br>
                        Simulates human typing delays (5-15ms var).<br><br>
                        <strong>2. Network Patching (Unlocker):</strong><br>
                        Overrides <code>window.fetch</code> and <code>XMLHttpRequest</code>.<br>
                        MITM attack on JSON responses: converts <code>"isUnavailableForUser":true</code> to <code>false</code> on the fly.<br><br>
                        <strong>3. CSS Variable Hooks:</strong><br>
                        Consumes native <code>var(--color-surface-300)</code> for seamless theming.<br><br>
                        <strong>4. Tab System:</strong><br>
                        Uses JS class switching with <code>display: block !important</code> to prevent site CSS conflicts.
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(gui);

        // --- EVENT BINDINGS (JS-Based) ---

        // 1. Tab Switching
        const tabBtns = ['main', 'misc', 'docs', 'system'];
        tabBtns.forEach(name => {
            document.getElementById(`btn-tab-${name}`).addEventListener('click', (e) => {
                document.querySelectorAll('.y-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.querySelectorAll('.y-page').forEach(p => p.classList.remove('active'));
                document.getElementById(`tab-${name}`).classList.add('active');
            });
        });

        // 2. Unlocker
        const unlockBtn = document.getElementById('y-unlock-btn');
        unlockBtn.addEventListener('click', () => {
            unlockBtn.classList.add('on');
            unlockBtn.innerHTML = `<span>🔓 Patching...</span><small>...</small>`;
            applyAvailabilityUnlocker();
            setTimeout(() => {
                unlockBtn.classList.remove('on');
                unlockBtn.innerHTML = `<span>🔓 Unlock Model Limits</span><small>FIX</small>`;
                showNotification('Network Layer Patched');
            }, 600);
        });

        // 3. Auto Prompt (One-Shot)
        const autoBtn = document.getElementById('y-autoprompt-btn');
        autoBtn.addEventListener('click', async () => {
            if(autoBtn.classList.contains('on')) return; // Prevent double click

            autoBtn.classList.add('on');
            autoBtn.innerHTML = `<span>🤖 Generating...</span><small>...</small>`;
            breakAutoPrompt = false;

            try {
                // Step A: Fetch
                const prompt = await fetchStealthPrompt();

                // Step B: Type & Send
                if (!breakAutoPrompt) {
                    autoBtn.innerHTML = `<span>🤖 Typing...</span><small>...</small>`;
                    await typeAndSend(prompt);

                    // Close GUI automatically to see result (optional, remove if unwanted)
                    toggleUI();
                }
            } catch (e) {
                console.error(e);
                showNotification('Error generating prompt');
            } finally {
                autoBtn.classList.remove('on');
                autoBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg> <span>Display Auto Prompt</span><small>1-SHOT</small>`;
            }
        });

        // 4. Misc Grid
        const grid = document.getElementById('y-misc-grid');
        Object.keys(FEATURE_MAP).forEach(key => {
            const feat = FEATURE_MAP[key];
            const btn = document.createElement('button');
            btn.className = 'y-btn';

            const isEnabled = savedState[key] === true;
            if(isEnabled) btn.classList.add('on');

            btn.innerHTML = `${feat.label} <small>${isEnabled ? 'ON' : 'OFF'}</small>`;

            btn.onclick = () => {
                const nowOn = btn.classList.toggle('on');
                btn.querySelector('small').innerText = nowOn ? 'ON' : 'OFF';
                feat.action(nowOn);
                saveFeatureState(key, nowOn);
            };

            grid.appendChild(btn);
            if(isEnabled) feat.action(true);
        });

        // 5. System
        document.getElementById('y-reload-btn').onclick = () => location.reload();
        document.getElementById('y-theme-btn').onclick = () => document.documentElement.classList.toggle('dark');
        document.getElementById('y-reset-btn').onclick = clearStorage;

        isBuilt = true;
    }
})();
