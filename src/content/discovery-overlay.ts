/**
 * Discovery Mode Overlay
 *
 * A persistent floating panel shown during full discovery mode.
 * Unlike the assist overlay (which handles a single unknown step),
 * this overlay guides the user through recording an ENTIRE form flow
 * from scratch.
 *
 * It has three phases:
 * 1. RECORDING: user fills out the current page
 * 2. STEP CAPTURED: user clicks "Next Step" to mark a page boundary
 * 3. RESULTS: user identifies the quote results page
 *
 * Rendered as Shadow DOM to avoid CSS conflicts.
 */

import {
  captureCurrentStep,
  markAsResultsPage,
  cancelDiscovery,
  getDiscoveredStepCount,
  findPremiumCandidates,
} from './discovery-engine';
import type { ExtractionHints } from '../adaptors/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let overlayRoot: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentPhase: 'recording' | 'identify-results' = 'recording';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the discovery overlay. Call once when discovery mode starts.
 */
export function showDiscoveryOverlay(adaptorName: string): void {
  if (!overlayRoot) {
    createOverlay(adaptorName);
  }
  overlayRoot!.style.display = 'block';
  updateStepCount();
}

/**
 * Hide and destroy the discovery overlay.
 */
export function hideDiscoveryOverlay(): void {
  if (overlayRoot) {
    overlayRoot.remove();
    overlayRoot = null;
    shadowRoot = null;
  }
}

/**
 * Update the overlay to reflect the current step count.
 */
export function updateStepCount(): void {
  if (!shadowRoot) return;
  const countEl = shadowRoot.querySelector('.discovery-step-count') as HTMLElement;
  if (countEl) {
    const count = getDiscoveredStepCount();
    countEl.textContent = count === 0
      ? 'No steps captured yet'
      : `${count} step${count > 1 ? 's' : ''} captured`;
  }
}

// ---------------------------------------------------------------------------
// Overlay construction
// ---------------------------------------------------------------------------

function createOverlay(adaptorName: string): void {
  overlayRoot = document.createElement('div');
  overlayRoot.id = 'imbh-discovery-overlay';
  overlayRoot.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    display: none;
  `;

  shadowRoot = overlayRoot.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = getStyles();
  shadowRoot.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'discovery-panel';
  panel.innerHTML = `
    <div class="discovery-header">
      <div class="discovery-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
          <circle cx="10" cy="10" r="3" fill="currentColor"/>
        </svg>
      </div>
      <span class="discovery-title">Discovery Mode</span>
      <button class="discovery-minimise" title="Minimise">−</button>
    </div>

    <div class="discovery-body">
      <p class="discovery-provider">${escapeHtml(adaptorName)}</p>

      <!-- RECORDING PHASE -->
      <div class="discovery-phase phase-recording">
        <p class="discovery-instruction">
          Fill out this page of the form normally. When you're done and ready to
          move to the next page, click <strong>Capture & Next</strong> below.
        </p>
        <p class="discovery-step-count">No steps captured yet</p>
      </div>

      <!-- RESULTS IDENTIFICATION PHASE -->
      <div class="discovery-phase phase-results" style="display:none;">
        <p class="discovery-instruction">
          Is this the <strong>quote results</strong> page? If you can see a premium
          amount, click on it and then confirm below.
        </p>
        <div class="discovery-candidates"></div>
      </div>

      <div class="discovery-privacy">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="6" width="10" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4 6V4a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Only page structure is recorded — never your personal data.
      </div>
    </div>

    <div class="discovery-actions">
      <button class="discovery-btn discovery-btn-cancel">Cancel</button>
      <button class="discovery-btn discovery-btn-capture">Capture & Next</button>
      <button class="discovery-btn discovery-btn-results" style="display:none;">This is the Results Page</button>
    </div>

    <div class="discovery-recording">
      <span class="discovery-dot"></span> Discovery in progress…
    </div>
  `;

  shadowRoot.appendChild(panel);

  // Wire events
  const minimiseBtn = shadowRoot.querySelector('.discovery-minimise') as HTMLElement;
  const body = shadowRoot.querySelector('.discovery-body') as HTMLElement;
  const actions = shadowRoot.querySelector('.discovery-actions') as HTMLElement;
  const cancelBtn = shadowRoot.querySelector('.discovery-btn-cancel') as HTMLElement;
  const captureBtn = shadowRoot.querySelector('.discovery-btn-capture') as HTMLElement;
  const resultsBtn = shadowRoot.querySelector('.discovery-btn-results') as HTMLElement;

  let minimised = false;
  minimiseBtn.addEventListener('click', () => {
    minimised = !minimised;
    body.style.display = minimised ? 'none' : 'block';
    actions.style.display = minimised ? 'none' : 'flex';
    minimiseBtn.textContent = minimised ? '+' : '−';
  });

  cancelBtn.addEventListener('click', () => {
    cancelDiscovery();
    hideDiscoveryOverlay();
  });

  captureBtn.addEventListener('click', () => {
    captureCurrentStep();
    updateStepCount();
  });

  resultsBtn.addEventListener('click', () => {
    switchToResultsPhase();
  });

  makeDraggable(panel, shadowRoot.querySelector('.discovery-header') as HTMLElement);

  document.body.appendChild(overlayRoot);
}

function switchToResultsPhase(): void {
  if (!shadowRoot) return;
  currentPhase = 'identify-results';

  const recordingPhase = shadowRoot.querySelector('.phase-recording') as HTMLElement;
  const resultsPhase = shadowRoot.querySelector('.phase-results') as HTMLElement;
  const captureBtn = shadowRoot.querySelector('.discovery-btn-capture') as HTMLElement;
  const resultsBtn = shadowRoot.querySelector('.discovery-btn-results') as HTMLElement;

  recordingPhase.style.display = 'none';
  resultsPhase.style.display = 'block';
  captureBtn.style.display = 'none';
  resultsBtn.style.display = 'none';

  // Find premium candidates
  const candidates = findPremiumCandidates();
  const container = shadowRoot.querySelector('.discovery-candidates') as HTMLElement;

  if (candidates.length > 0) {
    container.innerHTML = candidates.slice(0, 5).map((c, i) => `
      <button class="candidate-btn" data-index="${i}" data-selector="${escapeHtml(c.selector)}">
        <span class="candidate-text">${escapeHtml(c.text)}</span>
      </button>
    `).join('');

    // Add a "None of these" button
    container.innerHTML += `
      <button class="candidate-btn candidate-none">
        Skip — I'll identify it later
      </button>
    `;

    container.querySelectorAll('.candidate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selector = (btn as HTMLElement).dataset.selector;
        const text = btn.querySelector('.candidate-text')?.textContent || '';

        const hints: ExtractionHints = {
          premiumSelector: selector || undefined,
          premiumText: text || undefined,
          pageUrl: sanitiseUrl(window.location.href),
        };

        markAsResultsPage(hints);
        hideDiscoveryOverlay();
      });
    });

    container.querySelector('.candidate-none')?.addEventListener('click', () => {
      markAsResultsPage({ pageUrl: sanitiseUrl(window.location.href) });
      hideDiscoveryOverlay();
    });
  } else {
    container.innerHTML = `
      <p class="no-candidates">No premium amounts detected on this page.</p>
      <button class="candidate-btn candidate-none">
        Complete discovery without extraction hints
      </button>
    `;

    container.querySelector('.candidate-none')?.addEventListener('click', () => {
      markAsResultsPage({ pageUrl: sanitiseUrl(window.location.href) });
      hideDiscoveryOverlay();
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    handle.style.cursor = 'grabbing';
    const rect = overlayRoot!.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    overlayRoot!.style.left = `${e.clientX - offsetX}px`;
    overlayRoot!.style.right = 'auto';
    overlayRoot!.style.top = `${e.clientY - offsetY}px`;
    overlayRoot!.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    handle.style.cursor = 'grab';
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitiseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function getStyles(): string {
  return `
    .discovery-panel {
      width: 360px;
      background: #ffffff;
      border: 2px solid #8b5cf6;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1e293b;
      overflow: hidden;
    }

    .discovery-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #8b5cf6;
      color: white;
      user-select: none;
    }

    .discovery-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    .discovery-title {
      flex: 1;
      font-weight: 600;
      font-size: 14px;
    }

    .discovery-minimise {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      opacity: 0.8;
    }
    .discovery-minimise:hover { opacity: 1; }

    .discovery-body {
      padding: 16px;
    }

    .discovery-provider {
      font-weight: 600;
      color: #8b5cf6;
      margin: 0 0 12px;
      font-size: 15px;
    }

    .discovery-instruction {
      margin: 0 0 12px;
      line-height: 1.5;
    }

    .discovery-step-count {
      display: inline-block;
      padding: 4px 10px;
      background: #f3e8ff;
      color: #7c3aed;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin: 0 0 12px;
    }

    .discovery-privacy {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #64748b;
      padding: 8px 12px;
      background: #f1f5f9;
      border-radius: 6px;
    }
    .discovery-privacy svg { flex-shrink: 0; color: #64748b; }

    .discovery-actions {
      display: flex;
      gap: 8px;
      padding: 0 16px 16px;
    }

    .discovery-btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .discovery-btn-cancel {
      background: #f1f5f9;
      color: #64748b;
    }
    .discovery-btn-cancel:hover { background: #e2e8f0; }

    .discovery-btn-capture {
      background: #8b5cf6;
      color: white;
    }
    .discovery-btn-capture:hover { background: #7c3aed; }

    .discovery-btn-results {
      background: #10b981;
      color: white;
    }
    .discovery-btn-results:hover { background: #059669; }

    .discovery-recording {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #f5f3ff;
      border-top: 1px solid #e9d5ff;
      font-size: 12px;
      color: #6d28d9;
    }

    .discovery-dot {
      width: 8px;
      height: 8px;
      background: #8b5cf6;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .candidate-btn {
      display: block;
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 6px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      text-align: left;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .candidate-btn:hover {
      border-color: #8b5cf6;
      background: #f5f3ff;
    }

    .candidate-text {
      color: #1e293b;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .candidate-none {
      color: #64748b;
      text-align: center;
      border-style: dashed;
    }

    .no-candidates {
      color: #64748b;
      font-size: 13px;
      text-align: center;
      margin: 8px 0;
    }
  `;
}
