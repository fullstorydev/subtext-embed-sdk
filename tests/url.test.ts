import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEmbedSrc, parseTraceUrl, InvalidTraceUrlError } from '../src/url.js';

const PARENT_ORIGIN = 'https://customer.example:3000';

test('parseTraceUrl extracts appHost, orgId, traceId', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345');
  assert.equal(parts.appHost, 'https://app.fullstory.com');
  assert.equal(parts.orgId, 'o-ABC');
  assert.equal(parts.traceId, 'tr-xyz12345');
});

test('parseTraceUrl handles ports and deep URLs', () => {
  const parts = parseTraceUrl(
    'https://app.fullstory.test:8043/subtext/local/trace/c4b5b8102a9e',
  );
  assert.equal(parts.appHost, 'https://app.fullstory.test:8043');
  assert.equal(parts.orgId, 'local');
  assert.equal(parts.traceId, 'c4b5b8102a9e');
});

test('parseTraceUrl ignores query + hash when present', () => {
  const parts = parseTraceUrl(
    'https://app.fullstory.com/subtext/o/trace/t?foo=bar#baz',
  );
  assert.equal(parts.orgId, 'o');
  assert.equal(parts.traceId, 't');
});

test('parseTraceUrl throws on non-URLs', () => {
  assert.throws(() => parseTraceUrl('not a url'), InvalidTraceUrlError);
});

test('parseTraceUrl throws on paths missing /trace/ segment', () => {
  assert.throws(
    () => parseTraceUrl('https://app.fullstory.com/subtext/o-ABC'),
    InvalidTraceUrlError,
  );
});

test('parseTraceUrl throws when /trace/ is first segment (no orgId preceding it)', () => {
  assert.throws(
    () => parseTraceUrl('https://app.fullstory.com/trace/t'),
    InvalidTraceUrlError,
  );
});

test('buildEmbedSrc includes allowedParentOrigin before fragment', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o/trace/t');
  const src = buildEmbedSrc(parts, {
    initialToken: null,
    allowedParentOrigin: PARENT_ORIGIN,
  });
  assert.equal(
    src,
    'https://app.fullstory.com/subtext/o/trace/t/embed?allowedParentOrigin=https%3A%2F%2Fcustomer.example%3A3000',
  );
  assert.ok(!src.includes('#'));
});

test('buildEmbedSrc includes token as raw fragment (no URL-encoding of + or /)', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o/trace/t');
  const token = 'na1.ss!ss-wb:XCAS+Gj/abc:r/UEG/4+66f9';
  const src = buildEmbedSrc(parts, { initialToken: token, allowedParentOrigin: PARENT_ORIGIN });
  assert.ok(src.startsWith('https://app.fullstory.com/subtext/o/trace/t/embed?'));
  assert.ok(src.includes('allowedParentOrigin=https%3A%2F%2Fcustomer.example%3A3000'));
  assert.equal(src, `${src.split('#')[0]}#token=${token}`);
});

test('buildEmbedSrc omits hash when no token provided', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o/trace/t');
  const src = buildEmbedSrc(parts, { initialToken: null, allowedParentOrigin: 'https://a.com' });
  assert.ok(!src.includes('#'));
});

test('buildEmbedSrc passes through ID segments verbatim on the happy path', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz');
  const src = buildEmbedSrc(parts, { initialToken: null, allowedParentOrigin: 'https://a.com' });
  assert.equal(
    src,
    'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz/embed?allowedParentOrigin=https%3A%2F%2Fa.com',
  );
});
