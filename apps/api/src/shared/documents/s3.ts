import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function buildClient(): S3Client {
  return new S3Client({
    region: process.env["S3_REGION"] ?? "af-south-1",
    ...(process.env["S3_ENDPOINT"] ? { endpoint: process.env["S3_ENDPOINT"] } : {}),
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    credentials: {
      accessKeyId: process.env["S3_ACCESS_KEY_ID"] ?? "",
      secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] ?? "",
    },
  });
}

function bucket(): string {
  const b = process.env["S3_BUCKET"];
  if (!b) throw new Error("S3_BUCKET environment variable is not set");
  return b;
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const client = buildClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const client = buildClient();
  const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!Body) throw new Error(`Empty body for S3 key: ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Returns a pre-signed GET URL that expires in 5 minutes by default.
// In production the bucket is private; this URL is the only way to download.
export async function getPresignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const client = buildClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}
