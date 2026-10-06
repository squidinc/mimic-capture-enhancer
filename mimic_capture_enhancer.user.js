// ==UserScript==
// @name         Mimic Capture Helper Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.6.1
// @updateURL    https://raw.githubusercontent.com/squidinc/mimic-capture-enhancer/main/mimic_capture_enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/squidinc/mimic-capture-enhancer/main/mimic_capture_enhancer.user.js
// @description  Add Capture Coin display, running average/high/low tracking, and center tile protection to Mimic Capture Planner
// @author       SQUIDinc & Claude
// @match        *://mimic-capture-0654f0.gitlab.io/*
// @grant        none
// ==/UserScript==

(function() {
'use strict';


console.log("Mimic Capture Helper Enhancer v1.6 loaded");

let initialized = false;

// History is stored as a JSON array of {coins, tiles} objects, one per
// recorded run. Average/high/low are all derived from this array on the
// fly, which keeps undo and clear-all trivially correct (just pop/empty
// the array) instead of juggling separate running totals that could get
// out of sync.
const STORAGE_KEY_HISTORY = 'mimicCaptureEnhancer_history';

// Lucide icons (inline SVG, MIT licensed) - kept minimal so no external script load is needed
const ICON_UNDO = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
const ICON_TRASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

// Wait for DOM to be ready
function waitForDOM() {
    const testTile = document.querySelector('#board .tile .hexagon');
    const panel = document.querySelector('table.panel');
    
    if (!testTile || !panel) {
        setTimeout(waitForDOM, 100);
        return;
    }
    
    initializeEnhancements();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForDOM);
} else {
    waitForDOM();
}

function initializeEnhancements() {
    if (initialized) return;
    initialized = true;
    
    console.log("Initializing enhancements...");
    
    // Add responsive CSS
    injectResponsiveCSS();
    
    // Protect center tile from being voided
    protectCenterTile();
    
    // Add reward coin/tile display
    addRewardDisplay();
    
    // Add running average/high/low display with store checkbox, undo, and clear-all
    addAverageTracker();
    
    // Hook into calculation completion
    interceptCalculation();
    
    // Fix the setup_turns_remaining variable shadowing bug (see comments below)
    fixSetupTurnsRemainingSync();
    
    console.log("Initialization complete");
}

function injectResponsiveCSS() {
    const style = document.createElement('style');
    style.textContent = `
        /* Fix vertical alignment in control panel */
        table.panel td {
            vertical-align: middle !important;
        }
        
        /* Ensure checkbox aligns with text */
        #thirteen_tile_override {
            vertical-align: middle !important;
            margin-left: 5px;
        }
        
        /* Responsive text sizing for mobile */
        @media (max-width: 1000px) {
            table.panel {
                font-size: clamp(11px, 2.8vw, 16px);
            }
            
            #void-turns, #override, #reset-button {
                font-size: clamp(10px, 2.5vw, 14px);
            }
            
            .developers {
                font-size: clamp(12px, 3vw, 24px) !important;
            }
            
            .host {
                font-size: clamp(11px, 2.5vw, 20px) !important;
            }
        }
        
        /* Ensure credits are always visible above board */
        .developers, .host {
            position: relative !important;
            z-index: 10 !important;
        }
        
        /* Reward display styling */
        #reward-row, #average-row {
            font-size: clamp(11px, 2.8vw, 16px);
        }
        
        /* Average tracker row layout */
        #average-row td {
            padding: 6px 4px;
        }
        
        #average-controls {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
        }
        
        #average-controls label {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            white-space: nowrap;
        }
        
        #stats-display {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            width: 100%;
            color: #bbb5ac;
        }
        
        #high-low-display {
            color: #9aa8bb;
        }
        
        .icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 26px;
            padding: 0;
            border: 1px solid #827d64c4;
            border-radius: 5px;
            background-color: transparent;
            color: #bbb5ac;
            cursor: pointer;
        }
        
        .icon-btn:hover {
            background-color: #45494f;
        }
        
        .icon-btn:disabled {
            opacity: 0.35;
            cursor: default;
        }
        
        .icon-btn:disabled:hover {
            background-color: transparent;
        }
        
        /* Confirmation modal */
        #mimic-confirm-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        #mimic-confirm-box {
            background-color: #313338;
            border: 1px solid #827d64c4;
            border-radius: 8px;
            padding: 20px 24px;
            max-width: 300px;
            text-align: center;
            color: #bbb5ac;
        }
        
        #mimic-confirm-box p {
            margin: 0 0 16px 0;
        }
        
        #mimic-confirm-buttons {
            display: flex;
            justify-content: center;
            gap: 12px;
        }
        
        #mimic-confirm-buttons button {
            padding: 6px 16px;
            border-radius: 5px;
            border: 1px solid #827d64c4;
            cursor: pointer;
            background-color: #45494f;
            color: #bbb5ac;
        }
        
        #mimic-confirm-yes {
            background-color: #a65a5a !important;
        }
    `;
    document.head.appendChild(style);
    console.log("Responsive CSS injected");
}

function protectCenterTile() {
    // Find center tile (tile 24 where mimic starts)
    const centerTile = document.querySelector('#_24 .hexagon');
    if (!centerTile) {
        console.error("Could not find center tile");
        return;
    }
    
    // Add blocking event listener with highest priority
    centerTile.addEventListener('click', function(e) {
        // Completely block clicking on center tile
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }, true); // Capture phase with highest priority
    
    console.log("Center tile protected from voiding");
}

function addRewardDisplay() {
    // Add reward display as a new row in the control panel
    const panel = document.querySelector('table.panel:last-of-type');
    if (!panel) {
        console.error("Could not find control panel");
        return;
    }

    // Create new row
    const newRow = document.createElement('tr');
    newRow.id = 'reward-row';
    newRow.innerHTML = `
        <td colspan="2" style="text-align: center; font-weight: bold; color: #a6caa6; padding: 8px 0; visibility: hidden;">
            Capture Coins: <span id="reward-count">--</span> (<span id="tile-count">--</span> Tiles)
        </td>
    `;
    
    // Add to panel
    panel.querySelector('tbody').appendChild(newRow);
    console.log("Reward display added to control panel");
}

function addAverageTracker() {
    const panel = document.querySelector('table.panel:last-of-type');
    if (!panel) {
        console.error("Could not find control panel");
        return;
    }

    const newRow = document.createElement('tr');
    newRow.id = 'average-row';
    newRow.innerHTML = `
        <td colspan="2">
            <div id="average-controls">
                <div id="stats-display">
                    <span id="average-display">Average: -- (0 runs)</span>
                    <span id="high-low-display">High: -- · Low: --</span>
                </div>
                <label>
                    <input type="checkbox" id="store-result-checkbox" checked>
                    Store result
                </label>
                <button id="undo-last-btn" class="icon-btn" title="Undo last entry">${ICON_UNDO}</button>
                <button id="clear-all-btn" class="icon-btn" title="Clear all history">${ICON_TRASH}</button>
            </div>
        </td>
    `;

    panel.querySelector('tbody').appendChild(newRow);

    // Wire up undo button - removes only the most recent entry
    document.querySelector('#undo-last-btn').addEventListener('click', function() {
        undoLastEntry();
    });

    // Wire up clear-all button - shows confirmation modal first
    document.querySelector('#clear-all-btn').addEventListener('click', function() {
        showConfirmModal(
            'Clear all stored history? This cannot be undone.',
            function() {
                localStorage.removeItem(STORAGE_KEY_HISTORY);
                console.log("Cleared all stored history");
                updateStatsDisplay();
                updateUndoButtonState();
            }
        );
    });

    // Show whatever average/high/low was already stored from previous sessions
    updateStatsDisplay();
    updateUndoButtonState();
    console.log("Average tracker added to control panel");
}

function showConfirmModal(message, onConfirm) {
    // Remove any existing modal first, just in case
    const existing = document.querySelector('#mimic-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mimic-confirm-overlay';
    overlay.innerHTML = `
        <div id="mimic-confirm-box">
            <p>${message}</p>
            <div id="mimic-confirm-buttons">
                <button id="mimic-confirm-cancel">Cancel</button>
                <button id="mimic-confirm-yes">Clear All</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.querySelector('#mimic-confirm-cancel').addEventListener('click', function() {
        overlay.remove();
    });

    document.querySelector('#mimic-confirm-yes').addEventListener('click', function() {
        onConfirm();
        overlay.remove();
    });

    // Clicking the backdrop itself also cancels
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

function getHistory() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Error parsing history, resetting:", e);
        return [];
    }
}

function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
}

function updateStatsDisplay() {
    const history = getHistory();
    const averageSpan = document.querySelector('#average-display');
    const highLowSpan = document.querySelector('#high-low-display');
    if (!averageSpan || !highLowSpan) return;

    if (history.length === 0) {
        averageSpan.textContent = 'Average: -- (0 runs)';
        highLowSpan.textContent = 'High: -- · Low: --';
        return;
    }

    const count = history.length;
    const coinTotal = history.reduce((sum, entry) => sum + entry.coins, 0);
    const tileTotal = history.reduce((sum, entry) => sum + entry.tiles, 0);
    const avgCoins = coinTotal / count;
    const avgTiles = tileTotal / count;

    const tileValues = history.map(entry => entry.tiles);
    const maxTiles = Math.max(...tileValues);
    const minTiles = Math.min(...tileValues);

    averageSpan.textContent = `Average: ${avgCoins.toLocaleString(undefined, {maximumFractionDigits: 1})} (${avgTiles.toLocaleString(undefined, {maximumFractionDigits: 1})} Tiles) · ${count} run${count === 1 ? '' : 's'}`;
    highLowSpan.textContent = `High: ${maxTiles} Tiles · Low: ${minTiles} Tiles`;
}

function updateUndoButtonState() {
    const undoBtn = document.querySelector('#undo-last-btn');
    if (!undoBtn) return;
    const history = getHistory();
    undoBtn.disabled = (history.length === 0);
}

function recordResult(captureCoins, tiles) {
    const history = getHistory();
    history.push({ coins: captureCoins, tiles: tiles });
    saveHistory(history);

    console.log("Recorded result:", captureCoins, "coins,", tiles, "tiles - total runs:", history.length);
    updateStatsDisplay();
    updateUndoButtonState();
}

function undoLastEntry() {
    const history = getHistory();
    if (history.length === 0) {
        console.log("No entry available to undo");
        return;
    }

    const removed = history.pop();
    saveHistory(history);

    console.log("Undid last entry of", removed.coins, "coins,", removed.tiles, "tiles - remaining runs:", history.length);
    updateStatsDisplay();
    updateUndoButtonState();
}

function interceptCalculation() {
    const calculateButton = document.querySelector('#calculate');
    if (!calculateButton) return;

    calculateButton.addEventListener('click', function() {
        console.log("Calculation started");
        
        // Hide reward display
        const rewardRow = document.querySelector('#reward-row td');
        if (rewardRow) {
            rewardRow.style.visibility = 'hidden';
        }

        // Start polling for completion
        pollForCompletion();
    });
}

function pollForCompletion() {
    const checkInterval = setInterval(function() {
        const progressBar = document.querySelector('#progress-bar');
        if (!progressBar) return;

        const progressText = progressBar.textContent.trim();
        
        if (progressText === '100%' || progressText === '100.00%') {
            // Clear the interval IMMEDIATELY so it can't fire again while we wait
            // (previously this was cleared inside the setTimeout below, which let
            // one extra tick sneak in and double-record the result)
            clearInterval(checkInterval);
            setTimeout(function() {
                extractAndDisplayReward();
            }, 500);
        }
    }, 500);

    // Safety timeout (5 minutes)
    setTimeout(function() {
        clearInterval(checkInterval);
    }, 300000);
}

function extractAndDisplayReward() {
    console.log("Extracting reward data...");
    
    let rewardTiles = null;
    
    try {
        if (typeof window.top_winning_state_areas !== 'undefined' && 
            window.top_winning_state_areas.length > 0) {
            rewardTiles = window.top_winning_state_areas[0];
            console.log("Extracted reward:", rewardTiles, "tiles");
        } else {
            console.log("top_winning_state_areas not found or empty");
        }
    } catch (e) {
        console.error("Error accessing top_winning_state_areas:", e);
    }

    const rewardRow = document.querySelector('#reward-row td');
    const rewardCountSpan = document.querySelector('#reward-count');
    const tileCountSpan = document.querySelector('#tile-count');
    
    if (rewardRow && rewardCountSpan && tileCountSpan) {
        if (rewardTiles !== null && rewardTiles > 0) {
            // Formula: tiles * 30 (the base rate per reward tile). The player
            // can also gain additional capture coin rewards during gameplay
            // (observed anywhere from 0-15 in increments of 5), but since that amount
            // cannot be predicted here, this displays only the base, guaranteed amount.
            const captureCoins = rewardTiles * 30;
            rewardCountSpan.textContent = captureCoins.toLocaleString();
            tileCountSpan.textContent = rewardTiles;
            rewardRow.style.visibility = 'visible';
            console.log("Displayed:", captureCoins, "coins,", rewardTiles, "tiles");

            // Record this result into the history, unless the user opted out
            const storeCheckbox = document.querySelector('#store-result-checkbox');
            if (!storeCheckbox || storeCheckbox.checked) {
                recordResult(captureCoins, rewardTiles);
            } else {
                console.log("Store result unchecked - skipping history update");
            }
        } else {
            rewardCountSpan.textContent = 'Error';
            tileCountSpan.textContent = '--';
            rewardRow.style.visibility = 'visible';
            console.log("Could not extract reward value");
        }
    } else {
        console.error("Could not find reward display elements");
    }
}

function fixSetupTurnsRemainingSync() {
    // BUG IN ORIGINAL SCRIPT: handleTileClick() declares its own local
    // `const setup_turns_remaining` which shadows the outer `var setup_turns_remaining`.
    // This means the global (window.setup_turns_remaining) never actually updates away
    // from its initial value of 0, even though the on-screen counter text is correct.
    //
    // The Calculate button's validation reads that global directly, so it always
    // sees 0 regardless of true void count. This breaks the "exactly 14 voided"
    // check (silently allows calculating with the wrong number of voids) and
    // breaks the 13-Tile Override entirely (always blocks it, since it expects 1).
    //
    // Fix: keep window.setup_turns_remaining in sync ourselves, recalculating
    // it after every click on the board (by which point the native handler has
    // already toggled the void class).
    const board = document.querySelector('#board');
    if (!board) {
        console.error("Could not find board to patch setup_turns_remaining");
        return;
    }

    function syncSetupTurnsRemaining() {
        const voidCount = document.querySelectorAll('#board .hexagon.void').length;
        window.setup_turns_remaining = 14 - voidCount;
    }

    // Recalculate on every click that bubbles up from the board (fires after
    // the tile's own toggle handler, since that's attached directly on the
    // hexagon and bubble-phase ancestor listeners fire after target listeners)
    board.addEventListener('click', syncSetupTurnsRemaining);

    // Also sync immediately in case of a fresh load or pre-existing void state
    syncSetupTurnsRemaining();

    console.log("Patched setup_turns_remaining sync bug - validation should now work correctly");
}

console.log("Mimic Capture Helper Enhancer v1.6 ready");


})();