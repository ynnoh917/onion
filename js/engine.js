import { getPublicKeyAsync } from '@noble/ed25519';
import { sha3_256 } from '@noble/hashes/sha3';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function b32(bytes) {
  let bits = 0, v = 0, o = '';
  for (const b of bytes) {
    v = (v << 8) | b; bits += 8;
    while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) o += B32[(v << (5 - bits)) & 31];
  return o;
}

export const b64 = bytes => btoa(String.fromCharCode(...bytes));
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// 从公钥返回不含 .onion 的 56 位主体
export function onionBody(pub) {
  const pre = new TextEncoder().encode('.onion checksum');
  const buf = new Uint8Array(pre.length + 33);
  buf.set(pre); buf.set(pub, pre.length); buf[pre.length + 32] = 3;
  const c = sha3_256(buf).slice(0, 2);
  const out = new Uint8Array(35);
  out.set(pub); out.set(c, 32); out[34] = 3;
  return b32(out);
}

// 生成一次密钥对
export async function genKeyPair() {
  const sk = crypto.getRandomValues(new Uint8Array(32));
  const pk = await getPublicKeyAsync(sk);
  return { sk, pk, body: onionBody(pk) };
}

// 校验虚荣前缀（Base32 字符集，自动小写）
export const validPrefix = p => /^[a-z2-7]*$/.test(p);