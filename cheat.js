// ==UserScript==
// @name         Yupp.ai Ultimate GUI (v6.5.4 - Persistent State)
// @namespace    http://tampermonkey.net/
// @version      6.5.4
// @description  Persistent optimization across URL changes, larger UI, auto-vote continues. Press '[' to open.
// @author       You
// @match        https://yupp.ai/*
// @connect      api.deepinfra.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
'use strict';

// --- CONFIGURATION ---
const TRIGGER_KEY = '[';
const UI_ID = 'yupp-ultimate-gui';
const NOTIF_ID = 'yupp-toast-notif';
const STORAGE_KEY = 'yupp_gui_state_v6';
const UNLOCK_KEY = 'yupp_unlock_active';
const BOT_CONFIG_KEY = 'yupp_bot_config';

// --- STATE ---
let isBuilt = false;
let isVisible = false;
let breakAutoPrompt = false;
let isOptimized = false;
let optimizeCheckInterval = null;

// --- BOT STATE ---
let botInterval = null;
let isBotWorking = false;
let botMode = "TEXT";
let botConfig = {
    publicMode: false,
    useImage: false,
    optimize: false
};

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

// --- LOAD BOT CONFIG FROM STORAGE ---
function loadBotConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem(BOT_CONFIG_KEY));
        if (saved) {
            botConfig.publicMode = saved.publicMode || false;
            botConfig.useImage = saved.useImage || false;
            botConfig.optimize = saved.optimize || false;
        }
    } catch(e) {}
}

function saveBotConfig() {
    localStorage.setItem(BOT_CONFIG_KEY, JSON.stringify(botConfig));
}

// Load on startup
loadBotConfig();

// --- 0. SITE OPTIMIZER (PERSISTENT ACROSS URL CHANGES) ---
function killSiteStyles() {
    if (!botConfig.optimize) return;

    // Remove dark mode
    document.documentElement.classList.remove('dark');
    if (document.body) document.body.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';

    // Kill all stylesheets except ours
    document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
        if (!el.id || !el.id.includes('yupp')) {
            el.disabled = true;
            el.remove();
        }
    });

    // Kill all style tags except ours
    document.querySelectorAll('style').forEach(el => {
        if (!el.id || !el.id.includes('yupp')) {
            el.disabled = true;
            el.remove();
        }
    });

    // Hide SVGs, images, videos (except in our GUI)
    document.querySelectorAll('svg, img, video').forEach(el => {
        if (el.closest('#' + UI_ID) || el.closest('#' + NOTIF_ID)) return;
        el.style.setProperty('display', 'none', 'important');
    });
}

function injectOptimizeStyles() {
    if (!botConfig.optimize) return;
    if (document.getElementById('yupp-optimize-inject')) return;

    const style = document.createElement('style');
    style.id = 'yupp-optimize-inject';
    style.textContent = `
        html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: system-ui, -apple-system, sans-serif !important;
        }
        * {
            animation: none !important;
            transition: none !important;
            box-shadow: none !important;
            text-shadow: none !important;
        }
        button {
            background: #e5e5e5 !important;
            color: #000 !important;
            border: 1px solid #999 !important;
            padding: 8px 16px !important;
            cursor: pointer !important;
            border-radius: 4px !important;
        }
        button:hover {
            background: #d5d5d5 !important;
        }
        button:disabled {
            opacity: 0.5 !important;
        }
        input, textarea {
            background: #fff !important;
            color: #000 !important;
            border: 1px solid #999 !important;
            padding: 8px !important;
        }
        a {
            color: #0066cc !important;
        }
    `;

    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.documentElement.appendChild(style);
    }
}

function startPersistentOptimizer() {
    if (optimizeCheckInterval) return;
    isOptimized = true;

    // Initial kill
    killSiteStyles();
    injectOptimizeStyles();

    // Continuous killer (every 300ms) - survives URL changes
    optimizeCheckInterval = setInterval(() => {
        killSiteStyles();
        injectOptimizeStyles();
    }, 300);

    // MutationObserver for new elements
    const observer = new MutationObserver(() => {
        if (botConfig.optimize) {
            killSiteStyles();
        }
    });

    if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    // Hook into history API for SPA navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
        }, 100);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
        }, 100);
    };

    window.addEventListener('popstate', () => {
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
        }, 100);
    });

    console.log('⚡ Persistent Optimizer: ACTIVE');
}

// If optimize was enabled before, restart it
if (botConfig.optimize) {
    startPersistentOptimizer();
}

// --- 1. URL HASH PARSING ---
function parseAutoFarmHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;

    const params = {};
    hash.split(',').forEach(part => {
        const [key, value] = part.split('=');
        if (key && value !== undefined) {
            params[key.trim()] = value.trim();
        }
    });
    return params;
}

function generateAutoFarmHash() {
    const settings = ['autofarm=on'];
    if (botConfig.publicMode) settings.push('public=1');
    if (botConfig.useImage) settings.push('image=1');
    if (botConfig.optimize) settings.push('optimize=1');
    return '#' + settings.join(',');
}

function openAutoFarmWindow() {
    const hash = generateAutoFarmHash();
    const url = window.location.origin + window.location.pathname + hash;
    const win = window.open(url, '_blank', 'width=1000,height=800,scrollbars=yes,resizable=yes');
    if (win) {
        showNotification('🚀 New AutoFarm window opened!');
    } else {
        showNotification('❌ Popup blocked! Allow popups.');
    }
}

// --- 2. CRITICAL STARTUP ---

// Check URL hash for auto-start
const hashParams = parseAutoFarmHash();
if (hashParams && hashParams.autofarm === 'on') {
    console.log('🤖 AutoFarm: Detected hash params', hashParams);

    if (hashParams.public === '1') botConfig.publicMode = true;
    if (hashParams.image === '1') botConfig.useImage = true;
    if (hashParams.optimize === '1') {
        botConfig.optimize = true;
        startPersistentOptimizer();
    }

    saveBotConfig();

    // Start bot when page loads
    const startBotFromHash = () => {
        if (!botInterval) {
            botMode = "TEXT";
            botInterval = setInterval(runBotLogic, 800);
            console.log('🤖 AutoFarm: Bot started from URL hash');
            showNotification('🤖 AutoFarm started!');
        }
    };

    if (document.readyState === 'complete') {
        setTimeout(startBotFromHash, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(startBotFromHash, 1500));
    }
}

// Universal Unlocker
if (localStorage.getItem(UNLOCK_KEY) === 'true') {
    runUniversalUnlocker(true);
}

function runUniversalUnlocker(isLooping) {
    console.log("🔓 Yupp Unlocker: Hooks Applied");

    const originalParse = JSON.parse;
    JSON.parse = function(text, reviver) {
        if (typeof text === 'string' && text.includes('isUnavailableForUser":true')) {
            text = text.replace(/"isUnavailableForUser":\s*true/g, '"isUnavailableForUser":false');
        }
        return originalParse.call(this, text, reviver);
    };

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const contentType = response.headers ? (response.headers.get("content-type") || "") : "";
        if (contentType.includes("javascript") || contentType.includes("json")) {
            const clone = response.clone();
            try {
                const text = await clone.text();
                if (text.includes('isUnavailableForUser')) {
                    const modifiedText = text.replace(/"isUnavailableForUser":\s*true/g, '"isUnavailableForUser":false');
                    return new Response(modifiedText, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
            } catch(e) {}
        }
        return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('readystatechange', function() {
            if (this.readyState === 4 && this.responseText) {
                try {
                    if (this.responseText.includes('isUnavailableForUser":true')) {
                        const modified = this.responseText.replace(/"isUnavailableForUser":\s*true/g, '"isUnavailableForUser":false');
                        Object.defineProperty(this, 'responseText', { value: modified });
                        Object.defineProperty(this, 'response', { value: modified });
                    }
                } catch (e) {}
            }
        });
        originalOpen.apply(this, arguments);
    };

    if (isLooping) {
        console.log("🔓 Yupp Unlocker: Starting 20s Clean-up Loop");
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (Date.now() - startTime > 20000) {
                clearInterval(interval);
                return;
            }

            const disabledBtns = document.querySelectorAll('button[disabled]');
            disabledBtns.forEach(btn => {
                if (btn.innerText.includes("Send") || btn.querySelector('svg')) {
                    btn.disabled = false;
                }
            });
        }, 100);
    }
}

// --- 3. CORE LISTENER ---
document.addEventListener('keydown', (e) => {
    if (e.key === TRIGGER_KEY) {
        e.preventDefault();
        if (!isBuilt) {
            if (!document.body) {
                document.addEventListener('DOMContentLoaded', () => {
                    if(!isBuilt) buildUI();
                    toggleUI();
                });
            } else {
                buildUI();
                toggleUI();
            }
        } else {
            toggleUI();
        }
    }
}, true);

function toggleUI() {
    const el = document.getElementById(UI_ID);
    if (!el) return;
    const mainContent = document.querySelector('main') || document.body;

    isVisible = !isVisible;

    if (isVisible) {
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%, -50%) scale(1)';
        el.style.pointerEvents = 'auto';
        if (!isOptimized) {
            mainContent.style.transition = 'filter 0.2s ease-out';
            mainContent.style.filter = 'blur(8px)';
        }
    } else {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -45%) scale(0.95)';
        el.style.pointerEvents = 'none';
        mainContent.style.filter = '';
    }
}

function showNotification(msg) {
    if (!document.body) return;
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

// --- 4. STORAGE HELPERS ---
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
    localStorage.removeItem(UNLOCK_KEY);
    localStorage.removeItem(BOT_CONFIG_KEY);
    showNotification('Config reset. Reloading...');
    setTimeout(() => location.reload(), 1000);
}

// --- 5. STEALTH AUTO PROMPTER LOGIC ---
function tryGMRequest(contentPrompt) {
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
                'messages': [{ 'role': 'user', 'content': contentPrompt }],
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

async function fetchStealthPrompt(isBot = false) {
    let contentPrompt = 'Generate a single creative image generation prompt. Output ONLY the prompt text, no quotes. Start with generate me an image of';

    if (isBot) {
        const themes = [
            "bioluminescent mycelium forest", "liquid chrome samurai", "shattering obsidian palace",
            "steampunk clockwork heart", "ancient overgrown cyborg", "iridescent opal dragon",
            "cosmic nebula phoenix", "submerged gothic cathedral", "volcanic glass citadel",
            "fractal geometry desert", "celestial gold cartography", "cyberpunk rain shanty",
            "voodoo neon swamp", "ivory filigree labyrinth", "molten diamond cavern",
            "post-apocalyptic ballroom", "ethereal cloud whale", "hyper-detailed kintsugi mask",
            "solar flare deity", "frozen lightning garden", "emerald jungle ruins",
            "retro-future moon base", "amber trapped prehistoric world", "quantum glitch cityscape",
            "porcelain doll workshop", "iron rose garden", "galactic library vortex",
            "spectral ghost ship", "alchemist neon lab", "marble statue melting"
        ];
        const theme = themes[Math.floor(Math.random() * themes.length)];
        const prefix = botConfig.useImage ? "generate me a picture in 4k with" : "generate me an svg of";
        contentPrompt = `Write one 4k image prompt about ${theme}. Start with "${prefix} ". No quotes.`;
    }

    try {
        return await tryGMRequest(contentPrompt);
    } catch (e) {
        console.warn("GM failed, falling back to fetch", e);
        try {
            const req = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    'model': 'openai/gpt-oss-120b',
                    'messages': [{ 'role': 'user', 'content': contentPrompt }],
                    'stream': false
                })
            });
            const data = await req.json();
            return data.choices[0].message.content.trim();
        } catch(err) {
            return botConfig.useImage ? "generate me a picture in 4k with a futuristic cyberpunk city" : "generate me an svg of a futuristic cyberpunk city";
        }
    }
}

async function typeAndSend(text) {
    const input = document.querySelector("[data-testid='prompt-input']");
    if (!input) return;

    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    let str = "";

    const speed = botInterval ? 2 : (Math.floor(Math.random() * 10) + 5);

    for(let char of text) {
        if(breakAutoPrompt && !botInterval) return;
        str += char;
        setter.call(input, str);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(speed);
    }

    await sleep(botInterval ? 200 : 600);

    const sendBtn = document.querySelector('button[type="submit"]');
    if (sendBtn) {
        sendBtn.click();
        if(!botInterval) showNotification('✅ Prompt Sent');
    }
}

// --- 6. BOT HELPERS ---
function getNativeWindow() {
    return (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
}

function realClick(el) {
    if (!el) return;
    const win = getNativeWindow();
    const opts = { bubbles: true, cancelable: true, view: win, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.click();
}

async function handlePublicMode() {
    const switchBtn = document.querySelector('[data-testid="public-private-switch"]');
    if (!switchBtn) return;

    if (switchBtn.textContent.includes("Private")) {
        realClick(switchBtn);
        await sleep(600);

        const publicRadio = Array.from(document.querySelectorAll('button[role="radio"]')).find(b => b.getAttribute('aria-label') === 'Public');
        if (publicRadio) {
            realClick(publicRadio);
            await sleep(500);
        }

        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Confirm');
        if (confirmBtn) {
            realClick(confirmBtn);
            await sleep(800);
        }
    }
}

async function forceScratchComplete(canvas) {
    const win = getNativeWindow();
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (e) {}

    const eventOpts = { bubbles: true, clientX: centerX, clientY: centerY, pointerType: 'mouse', buttons: 1, view: win };
    canvas.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
    canvas.dispatchEvent(new MouseEvent('mousedown', eventOpts));

    const moveOpts = { ...eventOpts, clientX: centerX + 5, clientY: centerY + 5 };
    canvas.dispatchEvent(new PointerEvent('pointermove', moveOpts));
    canvas.dispatchEvent(new PointerEvent('pointerup', moveOpts));
    canvas.dispatchEvent(new MouseEvent('mouseup', moveOpts));
    canvas.click();
}

// --- 7. BOT LOOP (CONTINUES ACROSS URL CHANGES) ---
async function runBotLogic() {
    if (isBotWorking || !botInterval) return;
    isBotWorking = true;

    const statusEl = document.getElementById('y-bot-status');
    const setStatus = (txt) => { if(statusEl) statusEl.innerText = txt; };

    try {
        if (botMode === "VOTING" || window.location.search.includes('stream=true')) {
            setStatus("Selecting All & Saving...");

            const tags = Array.from(document.querySelectorAll('button[data-radix-collection-item]'));
            tags.forEach(tag => {
                if (tag.getAttribute('data-state') === 'off') {
                    realClick(tag);
                }
            });

            const fbBtn = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.includes("Send feedback") || b.textContent.includes("Save feedback")
            );

            if (fbBtn && !fbBtn.disabled) {
                realClick(fbBtn);
                setStatus("Feedback Saved.");
            }

            const canvas = document.querySelector('canvas[data-testid="new-scratch-card"]:not([data-bot-done])');
            if (canvas && canvas.offsetParent !== null) {
                canvas.setAttribute('data-bot-done', 'true');
                setStatus("Scratching...");
                await forceScratchComplete(canvas);
                await forceScratchComplete(canvas);
                await sleep(2000);

                const sidebarBtn = document.querySelector('a[href="/"] svg.lucide-message-circle')?.closest('a') ||
                                 document.querySelector('a[data-sidebar="menu-button"][href="/"]');
                if (sidebarBtn) {
                    realClick(sidebarBtn);
                    setStatus("Loading New Chat...");
                    await sleep(1500);
                    botMode = "TEXT";
                }
                isBotWorking = false; return;
            }

            const prefButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent && b.textContent.toLowerCase().includes('i prefer this') && !b.disabled
            );
            if (prefButtons.length >= 2) {
                realClick(prefButtons[prefButtons.length - 1]);
                await sleep(1000);
            }
            isBotWorking = false; return;
        }

        const input = document.querySelector("[data-testid='prompt-input']");
        if (botMode === "TEXT" && input) {
            if (botConfig.publicMode) {
                const switchBtn = document.querySelector('[data-testid="public-private-switch"]');
                if (!switchBtn) {
                    setStatus("Waiting for UI Switch...");
                    isBotWorking = false;
                    return;
                }
                if (switchBtn.textContent.includes("Private")) {
                    setStatus("Switching to Public...");
                    await handlePublicMode();
                    isBotWorking = false;
                    return;
                }
            }

            if (input.value.length < 5) {
                setStatus("Fetching Prompt...");
                const prompt = await fetchStealthPrompt(true);
                if (!botInterval) { isBotWorking = false; return; }
                setStatus("Typing...");
                await typeAndSend(prompt);
                botMode = "VOTING";
            }
        }
    } catch(e) {
        console.error("Bot Error", e);
        setStatus("Error: " + e.message);
    }
    isBotWorking = false;
}

// --- 8. UI BUILDER (LARGER WIDTH) ---
function buildUI() {
    if (document.getElementById(UI_ID)) return;
    const savedState = getSavedState();
    const isUnlockActive = localStorage.getItem(UNLOCK_KEY) === 'true';

    const style = document.createElement('style');
    style.id = 'yupp-gui-style';
    style.innerHTML = `
        #${UI_ID} {
            position: fixed; top: 50%; left: 50%; width: 700px; height: 650px;
            transform: translate(-50%, -45%) scale(0.95); opacity: 0;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 2147483647; pointer-events: none;
            background: var(--color-surface-300, #1a1a2e);
            border: 1px solid var(--color-border, #333);
            border-radius: var(--radius-card, 12px);
            box-shadow: var(--shadow-surface-l2, 0 25px 50px rgba(0,0,0,0.5));
            color: var(--color-text-primary, #e0e0e0);
            font-family: var(--font-inter), system-ui, sans-serif;
            display: flex; flex-direction: column; overflow: hidden;
        }
        #${UI_ID} .y-head { padding: 16px 20px; border-bottom: 1px solid var(--color-border, #333); display: flex; justify-content: space-between; align-items: center; }
        #${UI_ID} .y-title { font-size: 1.3rem; font-weight: 600; display: flex; gap: 8px; align-items: center; font-family: var(--font-poly-sans, sans-serif); }
        #${UI_ID} .y-dot { width: 8px; height: 8px; background: var(--color-brand-orange, #ff6b35); border-radius: 50%; box-shadow: 0 0 8px var(--color-brand-orange, #ff6b35); }

        #${UI_ID} .y-tabs { display: flex; gap: 4px; padding: 12px 16px; background: var(--color-surface-200, #12122a); flex-wrap: wrap; }
        #${UI_ID} .y-tab-btn {
            flex: 1; padding: 10px; border-radius: 6px; border: none; background: transparent;
            color: var(--color-text-secondary, #888); font-size: 0.9rem; cursor: pointer; transition: 0.2s; min-width: 70px;
        }
        #${UI_ID} .y-tab-btn:hover { background: var(--color-element-hover, #252545); color: var(--color-text-primary, #fff); }
        #${UI_ID} .y-tab-btn.active { background: var(--color-element, #2a2a4a); color: var(--color-text-primary, #fff); font-weight: 600; }

        #${UI_ID} .y-content { flex: 1; padding: 16px; overflow-y: auto; position: relative; }
        #${UI_ID} .y-page { display: none; animation: fadeIn 0.2s; }
        #${UI_ID} .y-page.active { display: block !important; }

        #${UI_ID} .y-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        #${UI_ID} .y-full-btn { grid-column: 1 / -1; width: 100%; margin-bottom: 5px; }

        #${UI_ID} .y-btn {
            padding: 14px; border-radius: 12px; border: 1px solid var(--color-border, #444);
            background: var(--color-surface-100, #252540); color: var(--color-text-primary, #e0e0e0);
            font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
            text-align: left; display: flex; align-items: center; gap: 10px; position: relative; overflow: hidden;
        }
        #${UI_ID} .y-btn:hover { background: var(--color-element-hover, #353560); border-color: var(--color-text-secondary, #666); }
        #${UI_ID} .y-btn.on { background: var(--color-brand-orange, #ff6b35); color: white; border-color: transparent; }
        #${UI_ID} .y-btn small { opacity: 0.6; font-size: 0.75rem; margin-left: auto; }
        #${UI_ID} .y-btn svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; flex-shrink: 0; }

        #${UI_ID} .y-btn.special { border: 1px solid var(--color-brand-orange, #ff6b35); background: rgba(255, 165, 0, 0.05); }
        #${UI_ID} .y-btn.special:hover { background: var(--color-brand-orange, #ff6b35); color: white; }

        #${UI_ID} .y-btn.bot { border: 1px solid #00e5ff; background: rgba(0, 229, 255, 0.05); color: #00e5ff; }
        #${UI_ID} .y-btn.bot:hover { background: #00e5ff; color: #000; }

        #${UI_ID} .y-btn.optimize { border: 1px solid #00ff88; background: rgba(0, 255, 136, 0.05); color: #00ff88; }
        #${UI_ID} .y-btn.optimize:hover { background: #00ff88; color: #000; }
        #${UI_ID} .y-btn.optimize.on { background: #00ff88; color: #000; }

        #${UI_ID} .y-btn.window { border: 1px solid #a855f7; background: rgba(168, 85, 247, 0.05); color: #a855f7; }
        #${UI_ID} .y-btn.window:hover { background: #a855f7; color: #fff; }

        #${UI_ID} .y-btn.danger { color: var(--color-destructive, #ff4444); border-color: var(--color-destructive, #ff4444); opacity: 0.8; }
        #${UI_ID} .y-btn.danger:hover { background: var(--color-destructive, #ff4444); color: white; opacity: 1; }

        #${UI_ID} .y-section { font-size: 0.85rem; margin-bottom: 10px; margin-top: 5px; opacity: 0.7; font-weight: 500; }
        #${UI_ID} .y-divider { height: 1px; background: var(--color-border, #333); margin: 12px 0; grid-column: 1 / -1; }
        #${UI_ID} .y-hash-box { grid-column: 1 / -1; margin-top: 5px; padding: 10px; background: var(--color-surface-100, #1a1a2e); border-radius: 6px; border: 1px solid var(--color-border, #333); font-size: 0.7rem; }
        #${UI_ID} .y-hash-box code { color: #00e5ff; word-break: break-all; font-family: var(--font-mono, monospace); display: block; margin-top: 5px; }
        #${UI_ID} .y-note { font-size: 0.65rem; color: #888; margin-top: 4px; font-style: italic; grid-column: 1 / -1; }

        #${UI_ID} .y-bot-status { grid-column: 1 / -1; margin-top: 8px; font-size: 0.75rem; text-align: center; color: var(--color-text-secondary, #888); font-family: var(--font-mono, monospace); }
        #${UI_ID} .y-code { font-family: var(--font-mono, monospace); font-size: 0.75rem; color: var(--color-text-secondary, #888); line-height: 1.6; background: var(--color-surface-100, #1a1a2e); padding: 12px; border-radius: 8px; border: 1px solid var(--color-border, #333); }

        #${NOTIF_ID} {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
            background: #111; color: #fff; padding: 12px 24px; border-radius: 30px;
            font-size: 0.95rem; pointer-events: none; opacity: 0; transition: all 0.3s; z-index: 2147483647;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3); border: 1px solid #333; font-family: var(--font-inter, sans-serif);
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
            <div style="font-size:0.75rem; opacity:0.5">v6.5.4</div>
        </div>

        <div class="y-tabs">
            <button class="y-tab-btn active" id="btn-tab-main">Main</button>
            <button class="y-tab-btn" id="btn-tab-autofarm">AutoFarm</button>
            <button class="y-tab-btn" id="btn-tab-misc">Misc</button>
            <button class="y-tab-btn" id="btn-tab-docs">Docs</button>
            <button class="y-tab-btn" id="btn-tab-system">System</button>
        </div>

        <div class="y-content">
            <div id="tab-main" class="y-page active">
                <p class="y-section">Tools</p>
                <div class="y-grid">
                    <button class="y-btn special ${isUnlockActive ? 'on' : ''}" id="y-unlock-btn">
                        <span>Remove Model Bans</span>
                        <small>${isUnlockActive ? 'ACTIVE' : 'OFF'}</small>
                    </button>
                    <button class="y-btn bot" id="y-autoprompt-btn">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path></svg>
                        <span>Auto prompt</span>
                        <small>1-SHOT</small>
                    </button>
                </div>
            </div>

            <div id="tab-autofarm" class="y-page">
                <p class="y-section">Settings</p>
                <div class="y-grid">
                    <button class="y-btn ${botConfig.publicMode ? 'on' : ''}" id="y-bot-public">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                        <span>Public Mode</span>
                        <small>${botConfig.publicMode ? 'ON' : 'OFF'}</small>
                    </button>
                    <button class="y-btn ${botConfig.useImage ? 'on' : ''}" id="y-bot-image">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle></svg>
                        <span>Use Image</span>
                        <small>${botConfig.useImage ? 'ON' : 'OFF'}</small>
                    </button>
                    <button class="y-btn optimize ${botConfig.optimize ? 'on' : ''}" id="y-optimize-btn" style="grid-column: 1 / -1;">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        <span>Optimize Site</span>
                        <small>${botConfig.optimize ? 'ACTIVE' : 'OFF'}</small>
                    </button>
                </div>

                <p class="y-section">Bot Control</p>
                <div class="y-grid">
                    <button class="y-btn bot ${botInterval ? 'on' : ''}" id="y-bot-start" style="grid-column: 1 / -1;">
                        <svg id="y-bot-icon" viewBox="0 0 24 24">${botInterval ? '<rect x="6" y="6" width="12" height="12"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}</svg>
                        <span id="y-bot-text">${botInterval ? 'STOP BOT' : 'START BOT'}</span>
                        <small>LOOP</small>
                    </button>
                </div>

                <p class="y-section">Multi-Window</p>
                <div class="y-grid">
                    <button class="y-btn window" id="y-new-window-btn" style="grid-column: 1 / -1;">
                        <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                        <span>Open New Farm Window</span>
                        <small>∞</small>
                    </button>
                </div>

                <div class="y-hash-box">
                    URL: <code id="y-hash-preview">${generateAutoFarmHash()}</code>
                </div>

                <div class="y-bot-status" id="y-bot-status">Status: ${botInterval ? 'Running...' : 'Idle'}</div>
            </div>

            <div id="tab-misc" class="y-page">
                <div class="y-grid" id="y-misc-grid"></div>
            </div>

            <div id="tab-system" class="y-page">
                <div class="y-grid">
                    <button class="y-btn" id="y-reload-btn">Force Reload</button>
                    <button class="y-btn danger" id="y-reset-btn">Reset Config</button>
                    <button class="y-btn" id="y-copy-hash-btn" style="grid-column: 1 / -1;">Copy Farm URL</button>
                </div>
            </div>

            <div id="tab-docs" class="y-page">
                <div class="y-code">
                    <strong>// DOCUMENTATION v6.5.4</strong><br><br>
                    <strong>✨ What's New:</strong><br>
                    • Settings persist across URL changes<br>
                    • Bot continues voting after redirects<br>
                    • Optimizer saves state persistently<br>
                    • Larger UI for better visibility<br><br>
                    <strong>🤖 How it works:</strong><br>
                    1. Set your preferences in AutoFarm<br>
                    2. Open new window via button<br>
                    3. Bot auto-farms & optimizes<br>
                    4. Settings survive redirects!
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(gui);

    // Tab switching
    const tabBtns = ['main', 'autofarm', 'misc', 'docs', 'system'];
    tabBtns.forEach(name => {
        document.getElementById(`btn-tab-${name}`).addEventListener('click', (e) => {
            document.querySelectorAll('.y-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.y-page').forEach(p => p.classList.remove('active'));
            document.getElementById(`tab-${name}`).classList.add('active');
        });
    });

    function updateHashPreview() {
        const preview = document.getElementById('y-hash-preview');
        if (preview) preview.innerText = generateAutoFarmHash();
    }

    // Unlock button
    document.getElementById('y-unlock-btn').addEventListener('click', () => {
        if (localStorage.getItem(UNLOCK_KEY) === 'true') {
            localStorage.removeItem(UNLOCK_KEY);
            document.getElementById('y-unlock-btn').classList.remove('on');
            document.getElementById('y-unlock-btn').querySelector('small').innerText = "OFF";
            showNotification('Unlocker Disabled. Reloading...');
        } else {
            localStorage.setItem(UNLOCK_KEY, 'true');
            document.getElementById('y-unlock-btn').classList.add('on');
            document.getElementById('y-unlock-btn').querySelector('small').innerText = "ACTIVE";
            showNotification('Unlocker Active. Reloading...');
        }
        setTimeout(() => location.reload(), 1000);
    });

    // Auto prompt button
    document.getElementById('y-autoprompt-btn').addEventListener('click', async function() {
        if(this.classList.contains('on')) return;
        toggleUI();
        showNotification('🤖 Generating Prompt...');
        this.classList.add('on');
        breakAutoPrompt = false;
        try {
            const prompt = await fetchStealthPrompt(false);
            if (!breakAutoPrompt) {
                showNotification('⌨️ Typing...');
                await typeAndSend(prompt);
            }
        } catch (e) {
            showNotification('Error generating prompt');
        } finally {
            this.classList.remove('on');
        }
    });

    // Bot config buttons
    document.getElementById('y-bot-public').onclick = function() {
        botConfig.publicMode = !botConfig.publicMode;
        saveBotConfig();
        this.classList.toggle('on', botConfig.publicMode);
        this.querySelector('small').innerText = botConfig.publicMode ? 'ON' : 'OFF';
        updateHashPreview();
    };

    document.getElementById('y-bot-image').onclick = function() {
        botConfig.useImage = !botConfig.useImage;
        saveBotConfig();
        this.classList.toggle('on', botConfig.useImage);
        this.querySelector('small').innerText = botConfig.useImage ? 'ON' : 'OFF';
        updateHashPreview();
    };

    // Optimize button - TURNS ON/OFF PERSISTENT OPTIMIZER
    document.getElementById('y-optimize-btn').onclick = function() {
        botConfig.optimize = !botConfig.optimize;
        saveBotConfig();
        this.classList.toggle('on', botConfig.optimize);
        this.querySelector('small').innerText = botConfig.optimize ? 'ACTIVE' : 'OFF';
        updateHashPreview();

        if (botConfig.optimize) {
            startPersistentOptimizer();
            showNotification('⚡ Site Optimizer Enabled!');
        } else {
            if (optimizeCheckInterval) {
                clearInterval(optimizeCheckInterval);
                optimizeCheckInterval = null;
            }
            isOptimized = false;
            const style = document.getElementById('yupp-optimize-inject');
            if (style) style.remove();
            location.reload();
        }
    };

    // Bot start/stop
    document.getElementById('y-bot-start').onclick = function() {
        if(botInterval) {
            clearInterval(botInterval);
            botInterval = null;
            isBotWorking = false;
            this.classList.remove('on');
            document.getElementById('y-bot-text').innerText = "START BOT";
            document.getElementById('y-bot-icon').innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
            document.getElementById('y-bot-status').innerText = "Status: Idle";
        } else {
            botMode = "TEXT";
            botInterval = setInterval(runBotLogic, 800);
            this.classList.add('on');
            document.getElementById('y-bot-text').innerText = "STOP BOT";
            document.getElementById('y-bot-icon').innerHTML = `<rect x="6" y="6" width="12" height="12"></rect>`;
        }
    };

    // New window button
    document.getElementById('y-new-window-btn').onclick = openAutoFarmWindow;

    // Copy URL button
    document.getElementById('y-copy-hash-btn').onclick = () => {
        const url = window.location.origin + window.location.pathname + generateAutoFarmHash();
        navigator.clipboard.writeText(url).then(() => {
            showNotification('📋 URL copied!');
        });
    };

    // Misc features grid
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

    // System buttons
    document.getElementById('y-reload-btn').onclick = () => location.reload();
    document.getElementById('y-reset-btn').onclick = clearStorage;

    isBuilt = true;
}

})();
