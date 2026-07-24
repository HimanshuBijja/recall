import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { randomUUID } from "crypto";

let client: S3Client | null = null;
function r2(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID!;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 5000,
      socketTimeout: 5000,
    }),
  });
  return client;
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) throw new Error("not a base64 data URL");
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}

export async function uploadFrame(dataUrl: string, keyPrefix = "frames"): Promise<string> {
  const { buffer, contentType } = parseDataUrl(dataUrl);
  const ext = contentType.split("/")[1] ?? "png";
  const key = `${keyPrefix}/${randomUUID()}.${ext}`;
  await r2().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}
