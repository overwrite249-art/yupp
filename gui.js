// ==UserScript==
// @name         Yupp.ai Ultimate GUI (v4.0 - Persistent)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Native, stealth UI with persistent state. Press '[' to open.
// @author       You
// @match        https://yupp.ai/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const TRIGGER_KEY = '[';
    const UI_ID = 'yupp-ultimate-gui';
    const STORAGE_KEY = 'yupp_gui_state_v1';

    // --- STATE ---
    let isBuilt = false;
    let isVisible = false;

    // --- DEFINITIONS: VISUAL FEATURES ---
    // We define logic here so we can loop through it for saving/loading
    const FEATURE_MAP = {
        'feat-wide': {
            label: 'Wide Mode',
            action: (on) => {
                const box = document.querySelector('.max-w-prompt-box');
                if(box) box.style.maxWidth = on ? '100%' : '';
            }
        },
        'feat-blur': {
            label: 'Privacy Blur',
            action: (on) => {
                const main = document.querySelector('main');
                if(main) main.style.filter = on ? 'blur(8px)' : '';
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
        },
        'feat-contrast': {
            label: 'High Contrast',
            action: (on) => {
                document.body.style.filter = on ? 'contrast(1.4) saturate(1.2)' : '';
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
        isVisible = !isVisible;
        el.style.opacity = isVisible ? '1' : '0';
        el.style.transform = isVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -45%) scale(0.95)';
        el.style.pointerEvents = isVisible ? 'auto' : 'none';
    }

    // --- 2. STORAGE HELPERS ---
    function getSavedState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch (e) { return {}; }
    }

    function saveFeatureState(id, isOn) {
        const state = getSavedState();
        state[id] = isOn;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearStorage() {
        localStorage.removeItem(STORAGE_KEY);
        alert('Config reset. Refresh page.');
        location.reload();
    }

    // --- 3. UI BUILDER ---
    function buildUI() {
        const savedState = getSavedState();

        // Inject Styles
        const style = document.createElement('style');
        style.innerHTML = `
            #${UI_ID} {
                position: fixed; top: 50%; left: 50%; width: 500px; height: 500px;
                transform: translate(-50%, -45%) scale(0.95); opacity: 0;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 99999; pointer-events: none;
                background: var(--color-surface-300);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-card);
                box-shadow: var(--shadow-surface-l2);
                color: var(--color-text-primary);
                font-family: var(--font-inter), sans-serif;
                backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
                display: flex; flex-direction: column; overflow: hidden;
            }
            .y-head { padding: 16px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; }
            .y-title { font-family: var(--font-poly-sans); font-size: 1.1rem; font-weight: 600; display: flex; gap: 8px; align-items: center; }
            .y-dot { width: 8px; height: 8px; background: var(--color-brand-orange); border-radius: 50%; box-shadow: 0 0 8px var(--color-brand-orange); }
            
            .y-tabs { display: flex; gap: 4px; padding: 8px 16px; background: var(--color-surface-200); }
            .y-tab-btn {
                flex: 1; padding: 6px; border-radius: 6px; border: none; background: transparent;
                color: var(--color-text-secondary); font-size: 0.8rem; cursor: pointer; transition: 0.2s;
            }
            .y-tab-btn:hover { background: var(--color-element-hover); color: var(--color-text-primary); }
            .y-tab-btn.active { background: var(--color-element); color: var(--color-text-primary); font-weight: 600; box-shadow: 0 1px 2px #00000010; }

            .y-content { flex: 1; padding: 16px; overflow-y: auto; }
            .y-page { display: none; animation: fadeIn 0.2s; }
            .y-page.active { display: block; }
            
            .y-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .y-btn {
                padding: 10px; border-radius: 12px; border: 1px solid var(--color-border);
                background: var(--color-surface-100); color: var(--color-text-primary);
                font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.15s;
                text-align: left; display: flex; align-items: center; gap: 8px;
            }
            .y-btn:hover { background: var(--color-element-hover); border-color: var(--color-text-secondary); }
            .y-btn.on { background: var(--color-brand-orange); color: white; border-color: transparent; }
            .y-btn small { opacity: 0.6; font-size: 0.7em; margin-left: auto; }
            .y-btn.danger { color: var(--color-destructive); border-color: var(--color-destructive); opacity: 0.8; }
            .y-btn.danger:hover { background: var(--color-destructive); color: white; opacity: 1; }

            .y-code { font-family: var(--font-mono); font-size: 0.75rem; color: var(--color-text-secondary); line-height: 1.5; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        `;
        document.head.appendChild(style);

        // Build DOM
        const gui = document.createElement('div');
        gui.id = UI_ID;
        gui.innerHTML = `
            <div class="y-head">
                <div class="y-title"><div class="y-dot"></div> Yupp Ultimate</div>
                <div style="font-size:0.7rem; opacity:0.5">v4.0</div>
            </div>
            
            <div class="y-tabs">
                <button class="y-tab-btn active" onclick="window.ySwitch('visual', this)">Visual</button>
                <button class="y-tab-btn" onclick="window.ySwitch('system', this)">System</button>
                <button class="y-tab-btn" onclick="window.ySwitch('docs', this)">Docs</button>
            </div>

            <div class="y-content">
                <!-- VISUAL TAB (Generated Dynamically) -->
                <div id="tab-visual" class="y-page active">
                    <div class="y-grid" id="y-visual-grid"></div>
                </div>

                <!-- SYSTEM TAB -->
                <div id="tab-system" class="y-page">
                    <div class="y-grid">
                        <button class="y-btn" onclick="location.reload()">Force Reload</button>
                        <button class="y-btn" onclick="document.documentElement.classList.toggle('dark')">Toggle Theme</button>
                        <button class="y-btn danger" id="y-reset-btn">Reset All Settings</button>
                    </div>
                </div>

                <!-- DOCS TAB -->
                <div id="tab-docs" class="y-page">
                     <div class="y-code">
                        <strong>// Documentation</strong><br>
                        Stealth mode active. State is persisted in localStorage.<br><br>
                        <strong>Persistence:</strong><br>
                        Features enabled here are saved to <code>${STORAGE_KEY}</code>.<br>
                        They are re-applied automatically the next time you press <code>[</code>.<br><br>
                        <strong>Targeting:</strong><br>
                        Uses Yupp's native variables: <code>var(--color-surface-*)</code>.<br>
                        Matches Dark/Light mode automatically.
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(gui);

        // --- 4. DYNAMIC BUTTON GENERATION & STATE RESTORATION ---
        const grid = document.getElementById('y-visual-grid');
        
        Object.keys(FEATURE_MAP).forEach(key => {
            const feat = FEATURE_MAP[key];
            const btn = document.createElement('button');
            btn.className = 'y-btn';
            btn.id = key;
            
            // Check if this feature was enabled previously
            const isEnabled = savedState[key] === true;
            
            // Apply visual state to button
            if (isEnabled) btn.classList.add('on');
            
            // Create inner HTML
            btn.innerHTML = `${feat.label} <small>${isEnabled ? 'ON' : 'OFF'}</small>`;
            
            // Attach click handler
            btn.onclick = () => {
                const nowOn = btn.classList.toggle('on');
                btn.querySelector('small').innerText = nowOn ? 'ON' : 'OFF';
                
                // Run Logic
                feat.action(nowOn);
                // Save State
                saveFeatureState(key, nowOn);
            };

            grid.appendChild(btn);

            // **CRITICAL**: Apply the logic immediately if it was saved as ON
            if (isEnabled) {
                feat.action(true);
            }
        });

        // System Tab Logic
        document.getElementById('y-reset-btn').onclick = clearStorage;

        // Global Tab Switcher (attached to window for HTML access)
        window.ySwitch = (tabName, btnRef) => {
            document.querySelectorAll('.y-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.y-page').forEach(p => p.classList.remove('active'));
            btnRef.classList.add('active');
            document.getElementById('tab-' + tabName).classList.add('active');
        };

        isBuilt = true;
    }
})();
