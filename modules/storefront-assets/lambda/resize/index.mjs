// image-resize Lambda. S3 PUT on originals/* triggers; resizes into
// resized/sm/, resized/md/, resized/lg/ with immutable cache headers.
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Readable } from "node:stream";

const SIZES = [
  { name: "sm", width: 320 },
  { name: "md", width: 640 },
  { name: "lg", width: 1280 },
];

const s3 = new S3Client({});

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream instanceof Readable ? stream : Readable.fromWeb(stream)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    if (!key.startsWith("originals/")) continue;

    try {
      const head = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const contentType = head.ContentType ?? "";
      if (!contentType.startsWith("image/")) {
        console.log(`skip non-image ${key} (${contentType})`);
        continue;
      }
      const body = await streamToBuffer(head.Body);
      const baseKey = key.replace(/^originals\//, "");

      for (const size of SIZES) {
        const resized = await sharp(body)
          .resize({ width: size.width, withoutEnlargement: true })
          .toFormat("webp")
          .toBuffer();
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `resized/${size.name}/${baseKey}.webp`,
            Body: resized,
            ContentType: "image/webp",
            CacheControl: "public, max-age=31536000, immutable",
          })
        );
      }
      console.log(`resized ${key} into ${SIZES.length} variants`);
    } catch (err) {
      console.error(`resize failed for ${key}`, err);
      throw err;
    }
  }
  return { ok: true };
};
