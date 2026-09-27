/**
 * Injected into the page via page.evaluateOnNewDocument() BEFORE any
 * page script runs, so paint/LCP observers are registered from time zero. [ms values]
 */
class MetricsCollector {
  constructor(onUpdate) {
    this.metrics = {
      ttfb: null,
      fcp: null,
      lcp: null,
      cls: 0,
      fid: null,
      domContentLoaded: null,
      renderingTime: null,
      loadTime: null,
    };
    this.onUpdate = onUpdate || function () {};
    this._observers = [];
    this._init();
  }

  _emit() {
    this.onUpdate({ ...this.metrics });
  }

  _init() {
    const navEntries = performance.getEntriesByType('navigation');
    if (navEntries.length) {
      const nav = navEntries[0];
      this.metrics.ttfb = round(nav.responseStart - nav.requestStart);
    }

    this._observe('paint', (entries) => {
      for (const entry of entries) {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.fcp = round(entry.startTime);
          this._emit();
        }
      }
    });

    this._observe('largest-contentful-paint', (entries) => {
      const last = entries[entries.length - 1];
      if (last) {
        this.metrics.lcp = round(last.renderTime || last.loadTime || last.startTime);
        this._emit();
      }
    });

    this._observe('layout-shift', (entries) => {
      for (const entry of entries) {
        if (!entry.hadRecentInput) {
          this.metrics.cls = round(this.metrics.cls + entry.value, 4);
        }
      }
      this._emit();
    });

    this._observe('first-input', (entries) => {
      const first = entries[0];
      if (first) {
        this.metrics.fid = round(first.processingStart - first.startTime);
        this._emit();
      }
    });

    if (document.readyState === 'complete') {
      this._captureLoadTimes();
    } else {
      window.addEventListener('load', () => this._captureLoadTimes());
    }
    document.addEventListener('DOMContentLoaded', () => {
      this.metrics.domContentLoaded = round(performance.now());
      this._emit();
    });
  }

  _captureLoadTimes() {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      this.metrics.renderingTime = round(nav.loadEventEnd - nav.startTime);
      this.metrics.loadTime = round(nav.loadEventEnd - nav.startTime);
    } else {
      this.metrics.renderingTime = round(performance.now());
      this.metrics.loadTime = round(performance.now());
    }
    this._emit();
  }

  _observe(type, callback) {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      this._observers.push(observer);
    } catch (err) {
      // Entry type not supported in this browser/context; skip silently.
    }
  }
}

function round(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

window.MetricsCollector = MetricsCollector;
