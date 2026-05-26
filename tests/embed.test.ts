import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const { render } = await import('../src/embed.js');

class FakeWindow {
  postMessage = (...args: unknown[]) => {
    this.postCalls.push(args);
  };
  postCalls: unknown[][] = [];
}

class FakeIFrame {
  src = '';
  style: Record<string, string> = {};
  private attrs: Record<string, string> = {};
  contentWindow: FakeWindow | null = null;
  removed = false;

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }

  getAttribute(k: string): string | undefined {
    return this.attrs[k];
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeParent {
  children: FakeIFrame[] = [];

  appendChild(iframe: FakeIFrame): FakeIFrame {
    iframe.contentWindow = new FakeWindow();
    this.children.push(iframe);
    return iframe;
  }
}

let listeners: Array<(evt: { source: unknown; origin: string; data: unknown }) => void> = [];

const fakeWindow = {
  location: { origin: 'https://parent.test' },
  addEventListener(type: string, fn: (evt: { source: unknown; origin: string; data: unknown }) => void): void {
    if (type === 'message') listeners.push(fn);
  },
  removeEventListener(type: string, fn: (evt: { source: unknown; origin: string; data: unknown }) => void): void {
    if (type === 'message') {
      listeners = listeners.filter(l => l !== fn);
    }
  },
};

const fakeDocument = {
  createElement(tag: string): FakeIFrame {
    if (tag !== 'iframe') throw new Error(`unexpected tag ${tag}`);
    return new FakeIFrame();
  },
  querySelector(): null {
    return null;
  },
};

(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow;
(globalThis as unknown as { document: typeof fakeDocument }).document = fakeDocument;

const TRACE_URL = 'https://app.fullstory.test/subtext/o-ABC/trace/tr-xyz';

beforeEach(() => {
  listeners = [];
});

test('render mounts iframe when initial refreshAuthToken throws and reports auth_failed', async () => {
  const parent = new FakeParent();
  const errors: Array<{ code: string; message?: string }> = [];

  const handle = await render({
    parentElement: parent as unknown as HTMLElement,
    traceUrl: TRACE_URL,
    refreshAuthToken: async () => {
      throw new Error('mint unavailable');
    },
    onError: err => {
      errors.push(err);
    },
  });

  assert.equal(parent.children.length, 1);
  assert.equal(handle.iframe, parent.children[0]);
  assert.match(handle.iframe.src, /\/embed\?allowedParentOrigin=/);
  assert.doesNotMatch(handle.iframe.src, /#token=/);
  assert.deepEqual(errors, [{ code: 'auth_failed', message: 'mint unavailable' }]);

  handle.destroy();
  assert.equal(handle.iframe.removed, true);
});

test('render includes initial token fragment when refreshAuthToken succeeds', async () => {
  const parent = new FakeParent();

  const handle = await render({
    parentElement: parent as unknown as HTMLElement,
    traceUrl: TRACE_URL,
    refreshAuthToken: async () => ({ token: 'tok-123' }),
  });

  assert.match(handle.iframe.src, /#token=tok-123$/);
  handle.destroy();
});
