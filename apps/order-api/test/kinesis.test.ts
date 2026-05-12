import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublisher } from '../src/kinesis';

class StubKinesis {
  public sent: Array<{ StreamName?: string; PartitionKey?: string; Data?: Buffer }> = [];
  public mode: 'ok' | 'throw' | 'first-throw-then-ok' = 'ok';
  public calls = 0;

  async send(cmd: any): Promise<any> {
    this.calls += 1;
    this.sent.push(cmd.input ?? cmd);
    if (this.mode === 'throw') {
      throw new Error('kinesis_unavailable');
    }
    if (this.mode === 'first-throw-then-ok' && this.calls === 1) {
      throw new Error('kinesis_unavailable');
    }
    return { SequenceNumber: 'seq-1', ShardId: 'shard-0' };
  }
}

test('publishOrderEvent uses tenantId as the partition key', async () => {
  const stub = new StubKinesis();
  const { publishOrderEvent } = createPublisher({
    client: stub,
    streamName: 'orders-events-dev',
    schemaVersion: 1,
  });

  const res = await publishOrderEvent({
    tenantId: 'acme',
    orderId: 'ORD-1',
    type: 'order.created',
    payload: { total: 42.48, item_count: 2 },
  });

  assert.equal(res.ok, true);
  assert.equal(stub.sent.length, 1);
  assert.equal(stub.sent[0].StreamName, 'orders-events-dev');
  assert.equal(stub.sent[0].PartitionKey, 'acme');
  const payload = JSON.parse(stub.sent[0].Data!.toString());
  assert.equal(payload.tenant_id, 'acme');
  assert.equal(payload.order_id, 'ORD-1');
  assert.equal(payload.type, 'order.created');
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.payload.total, 42.48);
});

test('publishOrderEvent returns ok=false when stream is not configured', async () => {
  const { publishOrderEvent } = createPublisher({ client: new StubKinesis(), streamName: '' });
  const res = await publishOrderEvent({ tenantId: 'acme', orderId: 'ORD-1', type: 'order.created' });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'stream_not_configured');
});

test('publishOrderEvent surfaces the error message on send failure', async () => {
  const stub = new StubKinesis();
  stub.mode = 'throw';
  const { publishOrderEvent } = createPublisher({ client: stub, streamName: 'orders-events-dev' });
  const res = await publishOrderEvent({ tenantId: 'acme', orderId: 'ORD-1', type: 'order.created' });
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /kinesis_unavailable/);
});
