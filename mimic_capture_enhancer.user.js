// ==UserScript==
// @name         Mimic Capture Helper Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add Capture Coin display and center tile protection to Mimic Capture  Helper
// @author       SQUIDinc & Claude
// @match        *://mimic-capture-0654f0.gitlab.io/*
// @grant        none
// ==/UserScript==

(function() {
'use strict';


console.log("Mimic Capture Helper Enhancer v1.0 loaded");

let initialized = false;

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
    
    // Hook into calculation completion
    interceptCalculation();
    
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
        #reward-row {
            font-size: clamp(11px, 2.8vw, 16px);
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
            setTimeout(function() {
                extractAndDisplayReward();
                clearInterval(checkInterval);
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
            const captureCoins = rewardTiles * 30 + 5;
            rewardCountSpan.textContent = captureCoins.toLocaleString();
            tileCountSpan.textContent = rewardTiles;
            rewardRow.style.visibility = 'visible';
            console.log("Displayed:", captureCoins, "coins,", rewardTiles, "tiles");
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

console.log("Mimic Capture Helper Enhancer v1.0 ready");


})();