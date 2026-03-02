/**
 * MAIN-world content script injected at document_start.
 * Patches browser fingerprinting APIs to return subtly different values
 * on each page load, making it harder for anti-fraud systems to link visits.
 *
 * Runs before any page JavaScript executes.
 * Built as a standalone IIFE — no imports allowed.
 */

(function () {
  // Per-page random seed from crypto API
  const seedArray = new Uint32Array(1);
  crypto.getRandomValues(seedArray);
  let seed = seedArray[0];

  // Simple seeded PRNG (xorshift32) for deterministic noise
  function nextRand(): number {
    seed ^= seed << 13;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xFFFFFFFF;
  }

  // --- Read UA override from data attributes set by the relay script ---
  const html = document.documentElement;
  const fpUa = html.dataset.fpUa;
  const fpPlatform = html.dataset.fpPlatform;

  // --- Navigator overrides ---
  if (fpUa) {
    try {
      Object.defineProperty(Navigator.prototype, 'userAgent', {
        get() { return fpUa; },
        configurable: true,
      });
    } catch { /* non-critical */ }
  }
  if (fpPlatform) {
    try {
      Object.defineProperty(Navigator.prototype, 'platform', {
        get() { return fpPlatform; },
        configurable: true,
      });
    } catch { /* non-critical */ }
  }

  // --- Canvas fingerprint noise ---
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (
    this: HTMLCanvasElement,
    ...args: [string?, number?]
  ) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        const data = imageData.data;
        // Apply subtle noise to a sparse set of pixels
        for (let i = 0; i < data.length; i += 4) {
          if (nextRand() < 0.02) {
            // Nudge one channel by +-1
            const channel = i + Math.floor(nextRand() * 3);
            data[channel] = Math.max(0, Math.min(255, data[channel] + (nextRand() > 0.5 ? 1 : -1)));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }
    } catch {
      // Canvas may be tainted (cross-origin); skip noise
    }
    return origToDataURL.apply(this, args);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    ...args: [string?, number?]
  ) {
    try {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          if (nextRand() < 0.02) {
            const channel = i + Math.floor(nextRand() * 3);
            data[channel] = Math.max(0, Math.min(255, data[channel] + (nextRand() > 0.5 ? 1 : -1)));
          }
        }
        ctx.putImageData(imageData, 0, 0);
      }
    } catch {
      // Canvas may be tainted; skip noise
    }
    return origToBlob.call(this, callback, ...args);
  };

  // --- WebGL parameter spoofing ---
  const WEBGL_PARAMS: Record<number, boolean> = {
    0x1F00: true, // VENDOR
    0x1F01: true, // RENDERER
    0x9245: true, // UNMASKED_VENDOR_WEBGL
    0x9246: true, // UNMASKED_RENDERER_WEBGL
  };

  function patchGetParameter(proto: any) {
    const origGetParameter = proto.getParameter;
    if (!origGetParameter) return;

    proto.getParameter = function (pname: number) {
      const result = origGetParameter.call(this, pname);
      if (WEBGL_PARAMS[pname] && typeof result === 'string') {
        // Append invisible zero-width chars based on seed for uniqueness
        const suffix = String.fromCharCode(0x200B + (seed & 0x7));
        return result + suffix;
      }
      return result;
    };
  }

  try { patchGetParameter(WebGLRenderingContext.prototype); } catch { /* WebGL1 not available */ }
  try { patchGetParameter(WebGL2RenderingContext.prototype); } catch { /* WebGL2 not available */ }

  // --- AudioContext fingerprint noise ---
  try {
    const origGetFloat = AnalyserNode.prototype.getFloatTimeDomainData;
    AnalyserNode.prototype.getFloatTimeDomainData = function (array) {
      origGetFloat.call(this, array);
      for (let i = 0; i < array.length; i++) {
        array[i] += (nextRand() - 0.5) * 0.0002;
      }
    };
  } catch { /* AudioContext not available */ }

  // Clean up data attributes after reading
  if (html.dataset.fpUa) delete html.dataset.fpUa;
  if (html.dataset.fpPlatform) delete html.dataset.fpPlatform;
})();
