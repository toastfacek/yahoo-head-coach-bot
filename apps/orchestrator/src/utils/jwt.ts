import * as crypto from 'crypto';

type JwtHeader = {
  alg: 'HS256';
  typ: 'JWT';
  kid?: string;
};

type JwtPayload = Record<string, any> & {
  iat?: number;
  exp?: number;
  jti?: string;
};

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function signJWT(payload: JwtPayload, secret: string, kid?: string): string {
  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  if (kid) header.kid = kid;
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  const sigB64 = base64url(sig);
  return `${data}.${sigB64}`;
}

export function verifyJWT<T extends JwtPayload = JwtPayload>(token: string, secret: string): T {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [headerB64, payloadB64, sigB64] = parts;
  
  try {
    // Validate base64url format (should only contain A-Z, a-z, 0-9, -, _)
    const base64urlRegex = /^[A-Za-z0-9_-]*$/;
    if (!base64urlRegex.test(headerB64) || !base64urlRegex.test(payloadB64) || !base64urlRegex.test(sigB64)) {
      throw new Error('Invalid token');
    }
    
    // Try to decode and parse JSON from header and payload
    const headerStr = Buffer.from(headerB64, 'base64').toString();
    const payloadStr = Buffer.from(payloadB64, 'base64').toString();
    JSON.parse(headerStr); // Validate header is valid JSON
    const payload = JSON.parse(payloadStr); // Validate payload is valid JSON
    
    const data = `${headerB64}.${payloadB64}`;
    const expected = base64url(crypto.createHmac('sha256', secret).update(data).digest());
    const sigBuffer = Buffer.from(sigB64);
    const expectedBuffer = Buffer.from(expected);
    
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error('Invalid signature');
    }
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) throw new Error('Token expired');
    return payload as T;
  } catch (error) {
    if (error instanceof Error && (error.message === 'Invalid signature' || error.message === 'Token expired')) {
      throw error;
    }
    throw new Error('Invalid token');
  }
}

export function randomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

