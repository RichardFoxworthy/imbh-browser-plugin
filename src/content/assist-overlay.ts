/**
 * Assist-Mode Overlay
 *
 * A floating UI injected into the page when the automation engine
 * encounters an unknown or changed form section. Tells the user what's
 * happening and records their manual navigation to improve future runs.
 *
 * Rendered as a Shadow DOM component to avoid CSS conflicts with the host page.
 */

import { startRecording, stopRecording, isRecording } from './interaction-recorder';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let overlayRoot: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let resolveAssist: ((result: AssistResult) => void) | null = null;

export interface AssistResult {
  completed: boolean;      // user clicked "Done" vs "Skip"
  interactions: ReturnType<typeof stopRecording>;
}

/**
 * Show the assist-mode overlay and start recording interactions.
 * Returns a promise that resolves when the user clicks "Done" or "Skip".
 */
export function showAssistOverlay(options: {
  adaptorName: string;
  stepName?: string;
  reason: string;
}): Promise<AssistResult> {
  return new Promise((resolve) => {
    resolveAssist = resolve;

    // Start recording interactions
    startRecording();

    // Create or update the overlay
    if (!overlayRoot) {
      createOverlay();
    }
    updateOverlayContent(options);
    overlayRoot!.style.display = 'block';
  });
}

/**
 * Hide the overlay and stop recording.
 */
export function hideAssistOverlay(): void {
  if (overlayRoot) {
    overlayRoot.style.display = 'none';
  }
  if (isRecording()) {
    stopRecording();
  }
}

/**
 * Check if the assist overlay is currently visible.
 */
export function isAssistActive(): boolean {
  return overlayRoot?.style.display === 'block';
}

// ---------------------------------------------------------------------------
// Overlay construction (Shadow DOM)
// ---------------------------------------------------------------------------

function createOverlay(): void {
  overlayRoot = document.createElement('div');
  overlayRoot.id = 'imbh-assist-overlay';
  overlayRoot.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    display: none;
  `;

  shadowRoot = overlayRoot.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = getOverlayStyles();
  shadowRoot.appendChild(style);

  // Create the panel container
  const panel = document.createElement('div');
  panel.className = 'assist-panel';
  panel.innerHTML = `
    <div class="assist-header">
      <div class="assist-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/>
          <path d="M10 6v4M10 12.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="assist-title">Navigation Help Needed</span>
      <button class="assist-minimise" title="Minimise">−</button>
    </div>
    <div class="assist-body">
      <p class="assist-provider"></p>
      <p class="assist-reason"></p>
      <p class="assist-instruction">
        Please fill out this section of the form manually, then click
        <strong>Done</strong> below. Your navigation will help future users
        get through this step automatically.
      </p>
      <div class="assist-privacy">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="6" width="10" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M4 6V4a3 3 0 016 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Your answers will be saved to your profile for future use. Only page structure (not your data) is shared to help other users.
      </div>
    </div>
    <div class="assist-actions">
      <button class="assist-btn assist-btn-skip">Skip This Step</button>
      <button class="assist-btn assist-btn-done">Done — Continue</button>
    </div>
    <div class="assist-recording">
      <span class="assist-dot"></span> Recording navigation…
    </div>
  `;

  shadowRoot.appendChild(panel);

  // Wire up event handlers
  const minimiseBtn = shadowRoot.querySelector('.assist-minimise') as HTMLElement;
  const skipBtn = shadowRoot.querySelector('.assist-btn-skip') as HTMLElement;
  const doneBtn = shadowRoot.querySelector('.assist-btn-done') as HTMLElement;
  const body = shadowRoot.querySelector('.assist-body') as HTMLElement;
  const actions = shadowRoot.querySelector('.assist-actions') as HTMLElement;

  let minimised = false;
  minimiseBtn.addEventListener('click', () => {
    minimised = !minimised;
    body.style.display = minimised ? 'none' : 'block';
    actions.style.display = minimised ? 'none' : 'flex';
    minimiseBtn.textContent = minimised ? '+' : '−';
  });

  skipBtn.addEventListener('click', () => {
    const interactions = stopRecording();
    overlayRoot!.style.display = 'none';
    resolveAssist?.({ completed: false, interactions });
    resolveAssist = null;
  });

  doneBtn.addEventListener('click', () => {
    const interactions = stopRecording();
    overlayRoot!.style.display = 'none';
    resolveAssist?.({ completed: true, interactions });
    resolveAssist = null;
  });

  // Allow dragging the panel
  makeDraggable(panel, shadowRoot.querySelector('.assist-header') as HTMLElement);

  document.body.appendChild(overlayRoot);
}

function updateOverlayContent(options: {
  adaptorName: string;
  stepName?: string;
  reason: string;
}): void {
  if (!shadowRoot) return;

  const providerEl = shadowRoot.querySelector('.assist-provider') as HTMLElement;
  const reasonEl = shadowRoot.querySelector('.assist-reason') as HTMLElement;

  providerEl.textContent = options.stepName
    ? `${options.adaptorName} — ${options.stepName}`
    : options.adaptorName;

  reasonEl.textContent = options.reason;
}

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
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    overlayRoot!.style.left = `${x}px`;
    overlayRoot!.style.right = 'auto';
    overlayRoot!.style.top = `${y}px`;
    overlayRoot!.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    handle.style.cursor = 'grab';
  });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function getOverlayStyles(): string {
  return `
    .assist-panel {
      width: 340px;
      background: #ffffff;
      border: 2px solid #3b82f6;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1e293b;
      overflow: hidden;
    }

    .assist-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #3b82f6;
      color: white;
      user-select: none;
    }

    .assist-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    .assist-title {
      flex: 1;
      font-weight: 600;
      font-size: 14px;
    }

    .assist-minimise {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      opacity: 0.8;
    }
    .assist-minimise:hover { opacity: 1; }

    .assist-body {
      padding: 16px;
    }

    .assist-provider {
      font-weight: 600;
      color: #3b82f6;
      margin: 0 0 8px;
    }

    .assist-reason {
      color: #64748b;
      margin: 0 0 12px;
      font-size: 13px;
    }

    .assist-instruction {
      margin: 0 0 12px;
      line-height: 1.5;
    }

    .assist-privacy {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #64748b;
      padding: 8px 12px;
      background: #f1f5f9;
      border-radius: 6px;
    }
    .assist-privacy svg { flex-shrink: 0; color: #64748b; }

    .assist-actions {
      display: flex;
      gap: 8px;
      padding: 0 16px 16px;
    }

    .assist-btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .assist-btn-skip {
      background: #f1f5f9;
      color: #64748b;
    }
    .assist-btn-skip:hover { background: #e2e8f0; }

    .assist-btn-done {
      background: #3b82f6;
      color: white;
    }
    .assist-btn-done:hover { background: #2563eb; }

    .assist-recording {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #fefce8;
      border-top: 1px solid #fef08a;
      font-size: 12px;
      color: #854d0e;
    }

    .assist-dot {
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
  `;
}
