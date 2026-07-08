import i18n from './i18n';

const FUNC_KEYS = new Set([
  'bulk.uploadButton.idle',
  'bulk.stats.ready',
  'bulk.stats.analyzing',
  'bulk.stats.errors',
  'bulk.messages.tagSuccess',
  'bulk.messages.tagPartial',
  'bulk.messages.uploadSuccess',
  'bulk.messages.dupError',
  'dashboard.trackCount',
  'recommend.recCount',
  'recommend.track',
]);

const PARAM_NAMES = {
  'bulk.uploadButton.idle': ['count'],
  'bulk.stats.ready': ['done', 'total'],
  'bulk.stats.analyzing': ['count'],
  'bulk.stats.errors': ['count'],
  'bulk.messages.tagSuccess': ['count'],
  'bulk.messages.tagPartial': ['success', 'failed'],
  'bulk.messages.uploadSuccess': ['count'],
  'bulk.messages.dupError': ['detail'],
  'dashboard.trackCount': ['count'],
  'recommend.recCount': ['count'],
  'recommend.track': ['id'],
};

function resolveResource(key) {
  try {
    return i18n.getResource(i18n.language, 'translation', key);
  } catch {
    return undefined;
  }
}

function resolveKey(key) {
  if (FUNC_KEYS.has(key)) {
    return (...args) => {
      const params = {};
      (PARAM_NAMES[key] || []).forEach((name, i) => {
        if (args[i] !== undefined) params[name] = args[i];
      });
      return i18n.t(key, params);
    };
  }

  const res = resolveResource(key);
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') return createProxy(key);
  return i18n.t(key);
}

function createProxy(prefix) {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === '$$typeof' || prop === 'prototype' || prop === 'constructor') {
          return undefined;
        }
        const key = prefix ? `${prefix}.${prop}` : prop;
        return resolveKey(key);
      },
    }
  );
}

const strings = createProxy('');
export default strings;
