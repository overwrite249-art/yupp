// ==UserScript==
// @name         Yupp.ai Ultimate GUI (v6.6.1 - Full Optimizer)
// @namespace    http://tampermonkey.net/
// @version      6.6.1
// @description  Original GUI with emergency stop keybind and full optimization. Press '[' to open, ']' to emergency stop.
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
const EMERGENCY_KEY = ']';
const UI_ID = 'yupp-ultimate-gui';
const NOTIF_ID = 'yupp-toast-notif';
const STORAGE_KEY = 'yupp_gui_state_v6';
const UNLOCK_KEY = 'yupp_unlock_active';
const BOT_CONFIG_KEY = 'yupp_bot_config';
const BOT_RUNNING_KEY = 'yupp_bot_running';
const BOT_MODE_KEY = 'yupp_bot_mode';

// Heavy element selector (response text containers)
const HEAVY_ELEMENT_SELECTOR = 'div.relative.w-full.md\\:min-h-\\[max\\(var\\(--bot-message-min-height\\)\\,calc\\(100vh-var\\(--chat-page-vertical-offset\\)-var\\(--minified-prompt-box-height\\)-var\\(--quick-take-height\\,0px\\)\\)\\)\\]';

// --- STATE ---
let isBuilt = false;
let isVisible = false;
let breakAutoPrompt = false;
let optimizeObserver = null;

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

// --- EMERGENCY STOP (Press ']') ---
function emergencyStop() {
    console.log('🚨 EMERGENCY STOP TRIGGERED');

    // Stop bot
    if (botInterval) {
        clearInterval(botInterval);
        botInterval = null;
    }
    isBotWorking = false;

    // Stop optimizer observer
    if (optimizeObserver) {
        optimizeObserver.disconnect();
        optimizeObserver = null;
    }

    // Clear all bot state
    localStorage.removeItem(BOT_RUNNING_KEY);
    localStorage.removeItem(BOT_MODE_KEY);

    // Disable optimizer
    botConfig.optimize = false;
    saveBotConfig();

    // Remove optimizer styles
    const optStyle = document.getElementById('yupp-optimize-style');
    if (optStyle) optStyle.remove();

    showNotification('🚨 EMERGENCY STOP! All farming stopped.');

    // Reload after short delay
    setTimeout(() => location.reload(), 1000);
}

// --- PERSISTENT STATE MANAGEMENT ---
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

function setBotRunning(running) {
    if (running) {
        localStorage.setItem(BOT_RUNNING_KEY, 'true');
    } else {
        localStorage.removeItem(BOT_RUNNING_KEY);
    }
}

function isBotRunningStored() {
    return localStorage.getItem(BOT_RUNNING_KEY) === 'true';
}

function saveBotMode(mode) {
    localStorage.setItem(BOT_MODE_KEY, mode);
}

function loadBotMode() {
    return localStorage.getItem(BOT_MODE_KEY) || 'TEXT';
}

// Load config immediately
loadBotConfig();

// --- SITE OPTIMIZER (FULL VERSION) ---
function hideHeavyElements() {
    if (!botConfig.optimize) return;

    // Hide heavy message containers (response text)
    try {
        const heavyElements = document.querySelectorAll(HEAVY_ELEMENT_SELECTOR);
        heavyElements.forEach(el => {
            if (el.style.display !== 'none') {
                el.style.display = 'none';
            }
        });
    } catch(e) {}

    // Hide sidebar content
    try {
        const sidebarContent = document.querySelector('[data-slot="sidebar-group-content"]');
        if (sidebarContent && sidebarContent.style.display !== 'none') {
            sidebarContent.style.display = 'none';
        }
    } catch(e) {}

    // Hide SVGs, images, videos (except in GUI)
    document.querySelectorAll('svg, img, video').forEach(el => {
        if (el.closest('#' + UI_ID) || el.closest('#' + NOTIF_ID)) return;
        if (el.style.display !== 'none') {
            el.style.display = 'none';
        }
    });
}

function killSiteStyles() {
    if (!botConfig.optimize) return;

    // Remove dark mode
    document.documentElement.classList.remove('dark');
    if (document.body) document.body.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    document.querySelector('[data-slot="sidebar-group-content"]').remove();
    // Disable site stylesheets
    document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
        if (!el.id || !el.id.includes('yupp')) {
            el.disabled = true;
        }
    });

    // Disable site style tags
    document.querySelectorAll('style').forEach(el => {
        if (!el.id || !el.id.includes('yupp')) {
            el.disabled = true;
        }
    });

    hideHeavyElements();
}

function injectOptimizeStyles() {
    if (!botConfig.optimize) return;
    if (document.getElementById('yupp-optimize-style')) return;

    const style = document.createElement('style');
    style.id = 'yupp-optimize-style';
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
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
        }
        button {
            background: #e5e5e5 !important;
            color: #000 !important;
            border: 1px solid #999 !important;
            padding: 8px 16px !important;
            cursor: pointer !important;
            border-radius: 4px !important;
        }
        button:hover { background: #d5d5d5 !important; }
        button:disabled { opacity: 0.5 !important; }
        input, textarea {
            background: #fff !important;
            color: #000 !important;
            border: 1px solid #999 !important;
            padding: 8px !important;
        }
        a { color: #0066cc !important; }

        /* Hide heavy message containers */
        div.relative.w-full[class*="md:min-h-[max(var(--bot-message-min-height)"] {
            display: none !important;
        }

        /* Hide media */
        svg:not(#${UI_ID} svg), img:not(#${UI_ID} img), video {
            display: none !important;
        }

        /* Hide sidebar content */
        [data-slot="sidebar-group-content"] {
            display: none !important;
        }
    `;

    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.documentElement.appendChild(style);
    }
}

function startOptimizer() {
    if (optimizeObserver) return;

    // Initial optimization
    killSiteStyles();
    injectOptimizeStyles();
    hideHeavyElements();

    // Watch for new elements
    optimizeObserver = new MutationObserver(() => {
        if (botConfig.optimize) {
            hideHeavyElements();
            killSiteStyles();
        }
    });

    const startObserver = () => {
        if (document.body) {
            optimizeObserver.observe(document.body, { childList: true, subtree: true });
        }
    };

    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

    // Hook into history API for SPA navigation
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
            hideHeavyElements();
        }, 100);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
            hideHeavyElements();
        }, 100);
    };

    window.addEventListener('popstate', () => {
        setTimeout(() => {
            killSiteStyles();
            injectOptimizeStyles();
            hideHeavyElements();
        }, 100);
    });

    console.log('⚡ Optimizer: ON (hiding responses + media)');
}

function stopOptimizer() {
    if (optimizeObserver) {
        optimizeObserver.disconnect();
        optimizeObserver = null;
    }

    const style = document.getElementById('yupp-optimize-style');
    if (style) style.remove();

    // Re-enable disabled stylesheets
    document.querySelectorAll('link[rel="stylesheet"][disabled], style[disabled]').forEach(el => {
        el.disabled = false;
    });

    botConfig.optimize = false;
    saveBotConfig();
    location.reload();
}

// --- URL HASH PARSING ---
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
    const win = window.open(url, '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
    if (win) {
        showNotification('🚀 New AutoFarm window opened!');
    } else {
        showNotification('❌ Popup blocked! Allow popups.');
    }
}

// --- BOT FUNCTIONS ---
function startBot() {
    if (botInterval) return;

    botMode = loadBotMode();

    if (window.location.search.includes('stream=true') || window.location.pathname.includes('/chat/')) {
        botMode = "VOTING";
        saveBotMode("VOTING");
    }

    botInterval = setInterval(runBotLogic, 800);
    setBotRunning(true);

    console.log('🤖 Bot Started, Mode:', botMode);
    updateBotUI(true);
}

function stopBot() {
    if (botInterval) {
        clearInterval(botInterval);
        botInterval = null;
    }
    isBotWorking = false;
    setBotRunning(false);
    saveBotMode("TEXT");

    console.log('🤖 Bot Stopped');
    updateBotUI(false);
}

function updateBotUI(running) {
    const btnBotStart = document.getElementById('y-bot-start');
    const botIcon = document.getElementById('y-bot-icon');
    const botText = document.getElementById('y-bot-text');
    const statusEl = document.getElementById('y-bot-status');

    if (btnBotStart) {
        if (running) {
            btnBotStart.classList.add('on');
            if (botText) botText.innerText = "STOP BOT";
            if (botIcon) botIcon.innerHTML = `<rect x="6" y="6" width="12" height="12"></rect>`;
        } else {
            btnBotStart.classList.remove('on');
            if (botText) botText.innerText = "START BOT";
            if (botIcon) botIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
        }
    }

    if (statusEl) {
        statusEl.innerText = running ? 'Status: Running... Mode: ' + loadBotMode() : 'Status: Idle';
    }
}

// --- CRITICAL STARTUP ---

// 1. Start optimizer if enabled
if (botConfig.optimize) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startOptimizer);
    } else {
        startOptimizer();
    }
}

// 2. Check URL hash for auto-start
const hashParams = parseAutoFarmHash();
if (hashParams && hashParams.autofarm === 'on') {
    console.log('🤖 AutoFarm: Detected hash params', hashParams);

    if (hashParams.public === '1') botConfig.publicMode = true;
    if (hashParams.image === '1') botConfig.useImage = true;
    if (hashParams.optimize === '1') {
        botConfig.optimize = true;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startOptimizer);
        } else {
            startOptimizer();
        }
    }

    saveBotConfig();
    setBotRunning(true);

    const startFromHash = () => {
        startBot();
        showNotification('🤖 AutoFarm started!');
    };

    if (document.readyState === 'complete') {
        setTimeout(startFromHash, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(startFromHash, 1000));
    }
}
// 3. Resume bot if it was running before redirect
else if (isBotRunningStored()) {
    console.log('🤖 Resuming bot after redirect...');

    const resumeBot = () => {
        startBot();
        showNotification('🤖 Bot resumed!');
    };

    if (document.readyState === 'complete') {
        setTimeout(resumeBot, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(resumeBot, 1000));
    }
}

// 4. Universal Unlocker
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
                console.log("🔓 Yupp Unlocker: Loop Finished");
                return;
            }

            const disabledBtns = document.querySelectorAll('button[disabled]');
            disabledBtns.forEach(btn => {
                if (btn.innerText.includes("Send") || btn.querySelector('svg')) {
                    btn.disabled = false;
                    btn.classList.remove('disabled:cursor-not-allowed');
                }
            });
        }, 100);
    }
}

// --- CORE LISTENER ---
document.addEventListener('keydown', (e) => {
    // Emergency stop with ]
    if (e.key === EMERGENCY_KEY) {
        e.preventDefault();
        emergencyStop();
        return;
    }

    // Normal GUI toggle with [
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
        mainContent.style.transition = 'filter 0.2s ease-out';
        mainContent.style.filter = 'blur(8px)';
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

// --- STORAGE HELPERS ---
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
    localStorage.removeItem(BOT_RUNNING_KEY);
    localStorage.removeItem(BOT_MODE_KEY);
    showNotification('Config reset. Reloading...');
    setTimeout(() => location.reload(), 1000);
}

// --- STEALTH AUTO PROMPTER LOGIC ---
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

// --- BOT HELPERS ---
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

// --- BOT LOOP ---
async function runBotLogic() {
    if (isBotWorking || !botInterval) return;
    isBotWorking = true;

    const statusEl = document.getElementById('y-bot-status');
    const setStatus = (txt) => {
        if(statusEl) statusEl.innerText = txt;
        console.log('🤖', txt);
    };

    try {
        const isOnStreamPage = window.location.search.includes('stream=true') || window.location.pathname.includes('/chat/');

        if (isOnStreamPage) {
            botMode = "VOTING";
            saveBotMode("VOTING");

            setStatus("Voting Mode - Selecting All...");

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
                await sleep(500);
            }

            const canvas = document.querySelector('canvas[data-testid="new-scratch-card"]:not([data-bot-done])');
            if (canvas && canvas.offsetParent !== null) {
                canvas.setAttribute('data-bot-done', 'true');
                setStatus("Scratching...");
                await forceScratchComplete(canvas);
                await forceScratchComplete(canvas);
                await sleep(2000);

                setStatus("Going to New Chat...");
                window.location.href = '/';
                isBotWorking = false;
                return;
            }

            const prefButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent && b.textContent.toLowerCase().includes('i prefer this') && !b.disabled
            );
            if (prefButtons.length >= 2) {
                realClick(prefButtons[prefButtons.length - 1]);
                await sleep(1000);
            }

            isBotWorking = false;
            return;
        }

        botMode = "TEXT";
        saveBotMode("TEXT");

        const input = document.querySelector("[data-testid='prompt-input']");
        if (input) {
            if (botConfig.publicMode) {
                const switchBtn = document.querySelector('[data-testid="public-private-switch"]');
                if (switchBtn && switchBtn.textContent.includes("Private")) {
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

                saveBotMode("VOTING");
                setStatus("Prompt Sent - Waiting for redirect...");
            }
        } else {
            setStatus("Waiting for input...");
        }
    } catch(e) {
        console.error("Bot Error", e);
        setStatus("Error: " + e.message);
    }
    isBotWorking = false;
}

// --- UI BUILDER (ORIGINAL v6.4 STYLE) ---
function buildUI() {
    if (document.getElementById(UI_ID)) return;
    const savedState = getSavedState();
    const isUnlockActive = localStorage.getItem(UNLOCK_KEY) === 'true';
    const isBotActive = isBotRunningStored() || !!botInterval;

    const style = document.createElement('style');
    style.id = 'yupp-gui-style';
    style.innerHTML = `
        #${UI_ID} {
            position: fixed; top: 50%; left: 50%; width: 500px; height: 520px;
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

        .y-tabs { display: flex; gap: 4px; padding: 8px 16px; background: var(--color-surface-200); flex-wrap: wrap; }
        .y-tab-btn {
            flex: 1; padding: 8px; border-radius: 6px; border: none; background: transparent;
            color: var(--color-text-secondary); font-size: 0.85rem; cursor: pointer; transition: 0.2s; min-width: 60px;
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
        .y-btn svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }

        .y-btn.special { border: 1px solid var(--color-brand-orange); background: rgba(255, 165, 0, 0.05); }
        .y-btn.special:hover { background: var(--color-brand-orange); color: white; }

        .y-btn.bot { border: 1px solid #00e5ff; background: rgba(0, 229, 255, 0.05); color: #00e5ff; }
        .y-btn.bot:hover { background: #00e5ff; color: #000; }

        .y-btn.optimize { border: 1px solid #00ff88; background: rgba(0, 255, 136, 0.05); color: #00ff88; }
        .y-btn.optimize:hover { background: #00ff88; color: #000; }
        .y-btn.optimize.on { background: #00ff88; color: #000; }

        .y-btn.window { border: 1px solid #a855f7; background: rgba(168, 85, 247, 0.05); color: #a855f7; }
        .y-btn.window:hover { background: #a855f7; color: #fff; }

        .y-btn.danger { color: var(--color-destructive); border-color: var(--color-destructive); opacity: 0.8; }
        .y-btn.danger:hover { background: var(--color-destructive); color: white; opacity: 1; }

        .y-bot-status { margin-top: 10px; font-size: 0.75rem; text-align: center; color: var(--color-text-secondary); font-family: var(--font-mono); }
        .y-code { font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-text-secondary); line-height: 1.5; background: var(--color-surface-100); padding: 10px; border-radius: 8px; border: 1px solid var(--color-border); }

        .y-section { font-size: 0.8rem; margin-bottom: 12px; opacity: 0.7; }
        .y-divider { height: 1px; background: var(--color-border); margin: 12px 0; }
        .y-hash-box { margin-top: 8px; padding: 8px; background: var(--color-surface-100); border-radius: 6px; border: 1px solid var(--color-border); font-size: 0.7rem; }
        .y-hash-box code { color: #00e5ff; word-break: break-all; font-family: var(--font-mono); }

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
            <div style="font-size:0.7rem; opacity:0.5">v6.6.1 | Press ] to stop</div>
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
                <button class="y-btn special y-full-btn ${isUnlockActive ? 'on' : ''}" id="y-unlock-btn">
                    <span>Remove Model Bans</span>
                    <small>${isUnlockActive ? 'ACTIVE' : 'OFF'}</small>
                </button>
                <button class="y-btn bot y-full-btn" id="y-autoprompt-btn">
                    <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path><line x1="8" y1="16" x2="8" y2="16"></line><line x1="16" y1="16" x2="16" y2="16"></line></svg>
                    <span>Auto prompt</span>
                    <small>1-SHOT</small>
                </button>
            </div>

            <div id="tab-autofarm" class="y-page">
                <p class="y-section">AFK Farming (Press ] to emergency stop)</p>
                <div class="y-grid">
                    <button class="y-btn ${botConfig.publicMode ? 'on' : ''}" id="y-bot-public">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                        <span>Public Mode</span>
                        <small>${botConfig.publicMode ? 'ON' : 'OFF'}</small>
                    </button>
                    <button class="y-btn ${botConfig.useImage ? 'on' : ''}" id="y-bot-image">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <span>Use Image</span>
                        <small>${botConfig.useImage ? 'ON' : 'OFF'}</small>
                    </button>
                </div>
                <div style="margin-top: 10px;">
                    <button class="y-btn optimize y-full-btn ${botConfig.optimize ? 'on' : ''}" id="y-optimize-btn">
                        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                        <span>Optimize Site (hides responses)</span>
                        <small>${botConfig.optimize ? 'ACTIVE' : 'OFF'}</small>
                    </button>
                    <button class="y-btn bot y-full-btn ${isBotActive ? 'on' : ''}" id="y-bot-start">
                        <svg id="y-bot-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${isBotActive ? '<rect x="6" y="6" width="12" height="12"></rect>' : '<polygon points="5 3 19 12 5 21 5 3"></polygon>'}</svg>
                        <span id="y-bot-text">${isBotActive ? 'STOP BOT' : 'START BOT'}</span>
                        <small>LOOP</small>
                    </button>
                </div>
                <div class="y-divider"></div>
                <button class="y-btn window y-full-btn" id="y-new-window-btn">
                    <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                    <span>Open AutoFarm in New Window</span>
                    <small>∞</small>
                </button>
                <div class="y-hash-box">
                    URL: <code id="y-hash-preview">${generateAutoFarmHash()}</code>
                </div>
                <div class="y-bot-status" id="y-bot-status">Status: ${isBotActive ? 'Running... Mode: ' + loadBotMode() : 'Idle'}</div>
            </div>

            <div id="tab-misc" class="y-page">
                <div class="y-grid" id="y-misc-grid"></div>
            </div>

            <div id="tab-system" class="y-page">
                <p class="y-section">Emergency: Press ] key to stop everything</p>
                <div class="y-grid">
                    <button class="y-btn" id="y-reload-btn">Force Reload</button>
                    <button class="y-btn danger" id="y-reset-btn">Reset Config</button>
                    <button class="y-btn" id="y-copy-hash-btn">Copy Farm URL</button>
                    <button class="y-btn danger" id="y-emergency-btn">🚨 Emergency Stop</button>
                </div>
            </div>

            <div id="tab-docs" class="y-page">
                <div class="y-code">
                    <strong>// DOCUMENTATION v6.6.1</strong><br><br>
                    <strong>🚨 EMERGENCY STOP:</strong><br>
                    Press <strong>]</strong> key anytime to stop!<br><br>
                    <strong>⚡ Optimizer:</strong><br>
                    - Hides response text containers<br>
                    - Removes CSS, SVGs, images<br>
                    - Hides sidebar content<br>
                    - Removes animations<br><br>
                    <strong>🤖 AutoFarm Bot:</strong><br>
                    - Survives page redirects<br>
                    - Auto-resumes after navigation<br><br>
                    <strong>🪟 Multi-Window:</strong><br>
                    <code>#autofarm=on,optimize=1</code>
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
    document.getElementById('y-unlock-btn').addEventListener('click', function() {
        if (localStorage.getItem(UNLOCK_KEY) === 'true') {
            localStorage.removeItem(UNLOCK_KEY);
            this.classList.remove('on');
            this.querySelector('small').innerText = "OFF";
            showNotification('Unlocker Disabled. Reloading...');
        } else {
            localStorage.setItem(UNLOCK_KEY, 'true');
            this.classList.add('on');
            this.querySelector('small').innerText = "ACTIVE";
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
            console.error(e);
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

    // Optimize button
    document.getElementById('y-optimize-btn').onclick = function() {
        botConfig.optimize = !botConfig.optimize;
        saveBotConfig();
        this.classList.toggle('on', botConfig.optimize);
        this.querySelector('small').innerText = botConfig.optimize ? 'ACTIVE' : 'OFF';
        updateHashPreview();

        if (botConfig.optimize) {
            startOptimizer();
            showNotification('⚡ Optimizer Enabled! Hiding responses...');
        } else {
            stopOptimizer();
        }
    };

    // Bot start/stop
    document.getElementById('y-bot-start').onclick = function() {
        if (botInterval || isBotRunningStored()) {
            stopBot();
            showNotification('🛑 Bot Stopped');
        } else {
            startBot();
            showNotification('🤖 Bot Started!');
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

    // Emergency stop button
    document.getElementById('y-emergency-btn').onclick = emergencyStop;

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

// Expose to console
window.yuppStop = emergencyStop;
console.log('💡 Yupp GUI v6.6.1: Press [ to open, ] to emergency stop, or yuppStop() in console');

})();
