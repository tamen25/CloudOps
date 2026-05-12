// Kinesis order-event publisher (closes backlog #85).
// publishOrderEvent partitions by tenantId so per-tenant ordering is
// preserved. Called post-commit (outside the RLS transaction) so a
// Kinesis outage cannot roll back the order. On final failure, the
// caller writes audit_events.result='kinesis_publish_failed' so the
// event is not lost silently.

import {
  KinesisClient,
  PutRecordCommand,
  ProvisionedThroughputExceededException,
} from '@aws-sdk/client-kinesis';

export interface OrderEvent {
  tenantId: string;
  orderId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  sequenceNumber?: string;
  shardId?: string;
  error?: string;
}

export interface PublisherDeps {
  client?: { send: (cmd: PutRecordCommand) => Promise<unknown> };
  streamName?: string;
  awsRegion?: string;
  schemaVersion?: number;
  logger?: { warn: (...a: unknown[]) => void };
}

let cachedClient: KinesisClient | null = null;

function getClient(region?: string): KinesisClient {
  if (cachedClient) return cachedClient;
  cachedClient = new KinesisClient({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' });
  return cachedClient;
}

export function createPublisher(deps: PublisherDeps = {}) {
  const streamName = deps.streamName ?? process.env.KINESIS_STREAM_NAME ?? '';
  const schemaVersion = deps.schemaVersion ?? 1;
  const logger = deps.logger;

  async function publishOrderEvent(event: OrderEvent): Promise<PublishResult> {
    if (!streamName) {
      return { ok: false, error: 'stream_not_configured' };
    }
    const data = Buffer.from(
      JSON.stringify({
        schema_version: schemaVersion,
        type: event.type,
        tenant_id: event.tenantId,
        order_id: event.orderId,
        payload: event.payload ?? {},
        ts: new Date().toISOString(),
      })
    );
    const command = new PutRecordCommand({
      StreamName: streamName,
      PartitionKey: event.tenantId,
      Data: data,
    });
    const client = deps.client ?? getClient(deps.awsRegion);

    try {
      const res = (await client.send(command)) as { SequenceNumber?: string; ShardId?: string };
      return { ok: true, sequenceNumber: res.SequenceNumber, shardId: res.ShardId };
    } catch (err) {
      const transient = err instanceof ProvisionedThroughputExceededException;
      if (transient) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          const res = (await client.send(command)) as { SequenceNumber?: string; ShardId?: string };
          return { ok: true, sequenceNumber: res.SequenceNumber, shardId: res.ShardId };
        } catch (retryErr) {
          logger?.warn?.({ err: retryErr }, 'kinesis publish retry failed');
          return { ok: false, error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
        }
      }
      logger?.warn?.({ err }, 'kinesis publish failed');
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { publishOrderEvent };
}
