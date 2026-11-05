// The trickle's traces started with the instrumented fetch's CLIENT span,
// which Argus flags as a dropped trace context (SPA-004). Each request must
// start an INTERNAL span and make the fetch inside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { LoadRunner } from '../src/runner';

const exporter = new InMemorySpanExporter();
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));

test('each request is the child of an INTERNAL root span', async () => {
  exporter.reset();
  let activeDuringFetch = '';
  const fakeFetch = (async () => {
    activeDuringFetch = trace.getActiveSpan()?.spanContext().spanId ?? '';
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  await new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: fakeFetch }).fireOne('place-order');

  const spans = exporter.getFinishedSpans();
  assert.equal(spans.length, 1);
  const root = spans[0];
  assert.equal(root.kind, SpanKind.INTERNAL);
  assert.equal(root.parentSpanContext, undefined, 'the request span must be a root');
  assert.equal(root.attributes['loadgen.scenario'], 'place-order');
  assert.equal(activeDuringFetch, root.spanContext().spanId, 'the fetch must run inside the root span');
});

test('an unexpected failure marks the root span as an error', async () => {
  exporter.reset();
  const failing = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
  await new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: failing }).fireOne('place-order');
  assert.equal(exporter.getFinishedSpans()[0].status.code, SpanStatusCode.ERROR);
});
