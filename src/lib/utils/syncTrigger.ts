/**
 * A lightweight callback registration module to avoid circular imports
 * between individual stores and the central prefsSync hub.
 *
 * Stores still call triggerSync() after local saves for compatibility. Server
 * preference transfer is now explicit, so this module intentionally does not
 * register or invoke an automatic upload handler.
 */

/** Compatibility no-op. Uploads only happen from the explicit settings action. */
export function triggerSync(): void {}
