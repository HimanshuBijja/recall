const textEncoder = new TextEncoder();

function base64urlEncode(str: string | Uint8Array): string {
  const binary = typeof str === "string" ? textEncoder.encode(str) : str;
  const base64 = btoa(String.fromCharCode(...binary));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const keyData = textEncoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerStr = base64urlEncode(JSON.stringify(header));
  const payloadStr = base64urlEncode(JSON.stringify(payload));
  const data = textEncoder.encode(`${headerStr}.${payloadStr}`);
  
  const key = await getCryptoKey(secret);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
  const signatureStr = base64urlEncode(new Uint8Array(signatureBuffer));
  
  return `${headerStr}.${payloadStr}.${signatureStr}`;
}

export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerStr, payloadStr, signatureStr] = parts;
    
    const data = textEncoder.encode(`${headerStr}.${payloadStr}`);
    const signature = base64urlDecode(signatureStr);
    
    const key = await getCryptoKey(secret);
    const isValid = await crypto.subtle.verify("HMAC", key, signature as unknown as BufferSource, data);
    if (!isValid) return null;
    
    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadStr));
    const payload = JSON.parse(payloadJson);
    
    // Check expiration
    if (payload.exp && Date.now() > payload.exp * 1000) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}
