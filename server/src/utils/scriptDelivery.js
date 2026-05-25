const RELEASE_MODES = new Set([
  'direct_raw',
  'direct_obfuscated',
  'verified_loader',
  'remote_core'
]);

const AUTH_MODES = new Set(['none', 'approval']);
const BINDING_STRATEGIES = new Set(['browser', 'host']);

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(fallback);
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function normalizeReleaseMode(value) {
  const mode = String(value || '').trim();
  return RELEASE_MODES.has(mode) ? mode : 'direct_obfuscated';
}

function normalizeAuthMode(value) {
  const mode = String(value || '').trim();
  return AUTH_MODES.has(mode) ? mode : 'none';
}

function normalizeBindingStrategy(value) {
  const strategy = String(value || '').trim();
  return BINDING_STRATEGIES.has(strategy) ? strategy : 'browser';
}

function normalizeDeviceLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

function normalizeScriptDeliveryConfig(payload = {}, existing = {}) {
  const releaseMode = normalizeReleaseMode(payload.release_mode ?? existing.release_mode);
  const authMode = normalizeAuthMode(payload.auth_mode ?? existing.auth_mode);
  const usageTrackingEnabled = toBoolean(payload.usage_tracking_enabled, existing.usage_tracking_enabled);
  const runtimeEnabled = toBoolean(payload.runtime_enabled, existing.runtime_enabled);
  const allowDeviceBinding = toBoolean(payload.allow_device_binding, existing.allow_device_binding);
  const enableObfuscation = toBoolean(payload.enable_obfuscation, existing.enable_obfuscation);
  const bindingStrategy = normalizeBindingStrategy(payload.binding_strategy ?? existing.binding_strategy);
  const defaultDeviceLimit = normalizeDeviceLimit(payload.default_device_limit ?? existing.default_device_limit);

  const normalized = {
    release_mode: releaseMode,
    auth_mode: authMode,
    runtime_enabled: runtimeEnabled,
    allow_device_binding: allowDeviceBinding,
    binding_strategy: bindingStrategy,
    default_device_limit: defaultDeviceLimit,
    usage_tracking_enabled: usageTrackingEnabled,
    enable_obfuscation: enableObfuscation
  };

  if (releaseMode === 'direct_raw') {
    normalized.enable_obfuscation = false;
    normalized.auth_mode = 'none';
    normalized.runtime_enabled = false;
    normalized.allow_device_binding = false;
    normalized.binding_strategy = 'browser';
    normalized.default_device_limit = 1;
    normalized.usage_tracking_enabled = false;
    return normalized;
  }

  if (releaseMode === 'direct_obfuscated') {
    normalized.enable_obfuscation = true;
    normalized.auth_mode = 'none';
    normalized.runtime_enabled = false;
    normalized.allow_device_binding = false;
    normalized.binding_strategy = 'browser';
    normalized.default_device_limit = 1;
    normalized.usage_tracking_enabled = false;
    return normalized;
  }

  if (releaseMode === 'verified_loader') {
    normalized.enable_obfuscation = true;
    normalized.runtime_enabled = true;
  }

  if (releaseMode === 'remote_core') {
    normalized.enable_obfuscation = false;
    normalized.auth_mode = 'approval';
    normalized.runtime_enabled = true;
    normalized.usage_tracking_enabled = true;
  }

  if (normalized.auth_mode !== 'approval') {
    normalized.allow_device_binding = false;
  }

  if (!normalized.allow_device_binding) {
    normalized.binding_strategy = 'browser';
    normalized.default_device_limit = 1;
  }

  if (!normalized.runtime_enabled) {
    normalized.allow_device_binding = false;
    normalized.binding_strategy = 'browser';
    normalized.default_device_limit = 1;
    normalized.usage_tracking_enabled = false;
  }

  return normalized;
}

module.exports = {
  normalizeScriptDeliveryConfig
};
