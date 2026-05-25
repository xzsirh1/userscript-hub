module.exports = `function createSafeLogger(sourceLogger) {
  const fallbackLogger = typeof console !== 'undefined' ? console : {}
  const make = (level) => (...args) => {
    const candidate = sourceLogger && typeof sourceLogger[level] === 'function' ? sourceLogger[level].bind(sourceLogger) : null
    const fallback = typeof fallbackLogger[level] === 'function'
      ? fallbackLogger[level].bind(fallbackLogger)
      : (typeof fallbackLogger.log === 'function' ? fallbackLogger.log.bind(fallbackLogger) : null)
    const fn = candidate || fallback
    if (!fn) return
    try {
      fn(...args)
    } catch (error) {}
  }

  return {
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    debug: make('debug'),
    log: make('log'),
    trace: make('trace')
  }
}

export async function bootstrap(context) {
  const runtimeConfig = context.runtimeConfig || {}
  const logger = createSafeLogger(context.logger)
  const request = typeof context.request === 'function' ? context.request : async () => ({})
  const script = context.script || {}

  logger.info('remote-core bootstrap start', {
    scriptId: script.id,
    version: script.version,
    moduleVersion: runtimeConfig.activeModuleVersion
  })

  const selectors = runtimeConfig.selectors || {}
  const featureFlags = runtimeConfig.featureFlags || {}

  if (featureFlags.showBanner) {
    const banner = document.createElement('div')
    banner.textContent = runtimeConfig.bannerText || 'Remote core module active'
    banner.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'z-index:999999',
      'padding:8px 12px',
      'background:#1f6feb',
      'color:#fff',
      'border-radius:8px',
      'font-size:12px'
    ].join(';')
    document.body.appendChild(banner)
  }

  if (selectors.primaryButton) {
    const button = document.querySelector(selectors.primaryButton)
    if (button) {
      logger.info('target button found')
    }
  }

  const apiResponse = await request('/api/runtime/config/' + script.id)
  logger.info('remote config fetched', apiResponse);
}

export async function destroy(context) {
  const logger = createSafeLogger(context.logger)
  logger.info('remote-core destroy')
}

export function getHealth() {
  return {
    ok: true,
    timestamp: new Date().toISOString()
  }
}
`;
