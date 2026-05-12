import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sessionCookieName, verifySession, isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = process.env.ASSETS_BUCKET_NAME ?? "";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

const s3 = BUCKET ? new S3Client({ region: REGION }) : null;

export async function POST(req: Request) {
  if (!s3 || !BUCKET) {
    return NextResponse.json({ error: "uploads_disabled" }, { status: 503 });
  }
  const jar = await cookies();
  const session = jar.get(sessionCookieName)?.value;
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const claims = await verifySession(session);
  if (!claims || !isAdmin(claims)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
  } | null;
  if (!body || typeof body.filename !== "string" || typeof body.contentType !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!ALLOWED.has(body.contentType)) {
    return NextResponse.json({ error: "content_type_not_allowed" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9._\-]{1,128}$/.test(body.filename)) {
    return NextResponse.json({ error: "invalid_filename" }, { status: 400 });
  }

  const key = `originals/${Date.now()}-${body.filename}`;
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: body.contentType,
    ContentLength: undefined,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 60 });

  return NextResponse.json({ url, key, maxBytes: MAX_BYTES });
}
