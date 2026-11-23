import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { AirnodeAttestationEnvelope } from "@/lib/types";

export const BASE_SEPOLIA_CHAIN_ID = BigInt(84532);
export const AUSD_CONTRACT = "0xbeA34973e5f67F18F656A2C6070C64326C791808";
export const AIRNODEHUB_PAY_TO = "0x1505FD562AC2Fb4307B85BC6c672FfeafB4d57A7";

function compareCodePoints(a: string, b: string): number {
  const aChars = Array.from(a);
  const bChars = Array.from(b);
  const len = Math.min(aChars.length, bChars.length);
  for (let i = 0; i < len; i++) {
    const ca = aChars[i].codePointAt(0) ?? 0;
    const cb = bChars[i].codePointAt(0) ?? 0;
    if (ca !== cb) return ca - cb;
  }
  return aChars.length - bChars.length;
}

/**
 * Airnode v0.2.0 canonical parameter serializer:
 * Objects become sorted [key, canonical(val)] entry arrays by Unicode code point; arrays keep order.
 */
export function canonicalizeAirnodeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeAirnodeValue);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort(compareCodePoints)
      .map((key) => [key, canonicalizeAirnodeValue(record[key])]);
  }
  return value;
}

export function keccak256Hex(bytes: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(keccak_256(bytes))}`;
}

export function computeAirnodeRequestHash(
  operation: string,
  parameters: Record<string, unknown>,
  responseProjection?: Record<string, string>
): `0x${string}` {
  const tuple: unknown[] = [operation, canonicalizeAirnodeValue(parameters)];
  if (responseProjection && Object.keys(responseProjection).length > 0) {
    tuple.push(canonicalizeAirnodeValue(responseProjection));
  }
  return keccak256Hex(utf8ToBytes(JSON.stringify(tuple)));
}

/**
 * digest = keccak256(abi.encodePacked(bytes32 requestHash, uint256 timestamp, bytes dataBytes))
 */
export function computeAirnodeDigest(
  requestHash: string,
  timestamp: string,
  data: string
): Uint8Array {
  const cleanReqHash = requestHash.replace(/^0x/i, "");
  if (cleanReqHash.length !== 64) {
    throw new Error("Invalid requestHash length (expected 32 bytes)");
  }
  const reqHashBytes = hexToBytes(cleanReqHash);
  const tsHex = BigInt(timestamp).toString(16).padStart(64, "0");
  const tsBytes = hexToBytes(tsHex);
  const dataBytes = utf8ToBytes(data);

  const packed = new Uint8Array(32 + 32 + dataBytes.length);
  packed.set(reqHashBytes, 0);
  packed.set(tsBytes, 32);
  packed.set(dataBytes, 64);
  return keccak_256(packed);
}

export function recoverEip191Signer(
  rawDigest32: Uint8Array,
  signatureHex: string
): `0x${string}` {
  const prefix = utf8ToBytes("\x19Ethereum Signed Message:\n32");
  const prefixed = new Uint8Array(prefix.length + 32);
  prefixed.set(prefix, 0);
  prefixed.set(rawDigest32, prefix.length);
  const ethSignedHash = keccak_256(prefixed);

  const cleanSig = signatureHex.replace(/^0x/i, "");
  if (cleanSig.length !== 130) {
    throw new Error("Invalid secp256k1 signature length (expected 65 bytes)");
  }
  const sigBytes = hexToBytes(cleanSig);
  const v = sigBytes[64];
  const recId = v >= 27 ? v - 27 : v;
  if (recId !== 0 && recId !== 1) {
    throw new Error(`Invalid signature recovery id: ${v}`);
  }

  const recoveredFormat = new Uint8Array(65);
  recoveredFormat[0] = recId;
  recoveredFormat.set(sigBytes.slice(0, 64), 1);

  const pubCompressed = secp256k1.recoverPublicKey(
    recoveredFormat,
    ethSignedHash,
    { prehash: false }
  );
  const pubUncompressed = secp256k1.Point.fromBytes(pubCompressed).toBytes(false);
  const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(12);
  return `0x${bytesToHex(addrBytes)}`;
}

export interface AttestationVerificationResult {
  valid: boolean;
  requestHashMatch: boolean;
  signerMatch: boolean;
  expectedAirnodeMatch: boolean;
  computedRequestHash: string;
  digestHex: string;
  recoveredAddress: string | null;
  reason?: string;
}

/**
 * Full client- and edge-safe AirnodeHub v0.2.0 EIP-191 attestation verifier.
 */
export function verifyAirnodeAttestation(params: {
  operation: string;
  parameters: Record<string, unknown>;
  attestation: AirnodeAttestationEnvelope;
  expectedAirnode?: string;
}): AttestationVerificationResult {
  const { operation, parameters, attestation, expectedAirnode } = params;
  const computedRequestHash = computeAirnodeRequestHash(operation, parameters);
  const requestHashMatch =
    computedRequestHash.toLowerCase() === attestation.requestHash.toLowerCase();

  try {
    const digest = computeAirnodeDigest(
      attestation.requestHash,
      attestation.timestamp,
      attestation.data
    );
    const digestHex = `0x${bytesToHex(digest)}`;
    const recoveredAddress = recoverEip191Signer(digest, attestation.signature);
    const signerMatch =
      recoveredAddress.toLowerCase() === attestation.airnode.toLowerCase();
    const expectedAirnodeMatch = expectedAirnode
      ? recoveredAddress.toLowerCase() === expectedAirnode.toLowerCase()
      : true;

    const valid = requestHashMatch && signerMatch && expectedAirnodeMatch;
    return {
      valid,
      requestHashMatch,
      signerMatch,
      expectedAirnodeMatch,
      computedRequestHash,
      digestHex,
      recoveredAddress,
      reason: valid
        ? undefined
        : !requestHashMatch
          ? "Request hash mismatch"
          : !signerMatch
            ? "Recovered signer does not match attestation airnode"
            : "Signer does not match catalog Airnode address",
    };
  } catch (err) {
    return {
      valid: false,
      requestHashMatch,
      signerMatch: false,
      expectedAirnodeMatch: false,
      computedRequestHash,
      digestHex: "",
      recoveredAddress: null,
      reason: err instanceof Error ? err.message : "Signature verification error",
    };
  }
}

export function getAddressFromPrivateKey(privateKeyHex: string): `0x${string}` {
  const clean = privateKeyHex.trim().replace(/^0x/i, "");
  if (clean.length !== 64) {
    throw new Error("AIRNODEHUB_WALLET_PRIVATE_KEY must be a 32-byte hex string");
  }
  const privBytes = hexToBytes(clean);
  const pubUncompressed = secp256k1.getPublicKey(privBytes, false);
  const addrBytes = keccak_256(pubUncompressed.slice(1)).slice(12);
  return `0x${bytesToHex(addrBytes)}`;
}

function encodeUint256(value: bigint): Uint8Array {
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function encodeAddress(addr: string): Uint8Array {
  const clean = addr.replace(/^0x/i, "").toLowerCase();
  if (clean.length !== 40) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  return hexToBytes(clean.padStart(64, "0"));
}

function encodeBytes32(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  if (clean.length !== 64) {
    throw new Error(`Invalid bytes32: ${hex}`);
  }
  return hexToBytes(clean);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export interface X402PaymentAccept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    assetTransferMethod?: string;
  };
}

export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: X402PaymentAccept[];
}

export function decodeBase64Json<T>(b64: string): T {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

export function encodeBase64Json(obj: unknown): string {
  const bytes = utf8ToBytes(JSON.stringify(obj));
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Signs an x402 v2 EIP-3009 `transferWithAuthorization` payment payload for AirnodeHub aUSD on Base Sepolia.
 */
export function signX402Eip3009Payment(params: {
  privateKeyHex: string;
  paymentRequired: X402PaymentRequired;
  maxCallUsd: number;
}): {
  paymentSignatureHeader: string;
  paidUsd: number;
  payerAddress: string;
  nonce: string;
} {
  const { privateKeyHex, paymentRequired, maxCallUsd } = params;

  if (paymentRequired.x402Version !== 2) {
    throw new Error(
      `Unsupported x402 version: ${paymentRequired.x402Version}`
    );
  }

  const accepted = paymentRequired.accepts.find(
    (entry) =>
      entry.scheme === "exact" &&
      entry.network === "eip155:84532" &&
      entry.asset.toLowerCase() === AUSD_CONTRACT.toLowerCase()
  );

  if (!accepted) {
    throw new Error(
      "No Base Sepolia exact aUSD payment option found in PAYMENT-REQUIRED"
    );
  }

  // Safety checks per AirnodeHub security guidelines
  if (accepted.payTo.toLowerCase() !== AIRNODEHUB_PAY_TO.toLowerCase()) {
    throw new Error(
      `Unexpected payment recipient ${accepted.payTo} (expected ${AIRNODEHUB_PAY_TO})`
    );
  }

  const amountUnits = BigInt(accepted.amount);
  const paidUsd = Number(amountUnits) / 1e6;
  if (paidUsd > maxCallUsd) {
    throw new Error(
      `Operation price $${paidUsd.toFixed(4)} exceeds safety cap $${maxCallUsd.toFixed(4)}`
    );
  }

  const cleanPriv = privateKeyHex.trim().replace(/^0x/i, "");
  const privBytes = hexToBytes(cleanPriv);
  const from = getAddressFromPrivateKey(privateKeyHex);
  const to = accepted.payTo;

  const nowSec = Math.floor(Date.now() / 1000);
  const timeoutSec = Math.min(accepted.maxTimeoutSeconds || 300, 300);
  const validAfter = BigInt(nowSec - 60);
  const validBefore = BigInt(nowSec + timeoutSec);

  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonceHex = `0x${bytesToHex(nonceBytes)}`;

  const domainName = accepted.extra?.name || "AirnodeHub USD";
  const domainVersion = accepted.extra?.version || "1";

  const eip712DomainTypeHash = keccak_256(
    utf8ToBytes(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    )
  );
  const domainSeparator = keccak_256(
    concatBytes(
      eip712DomainTypeHash,
      keccak_256(utf8ToBytes(domainName)),
      keccak_256(utf8ToBytes(domainVersion)),
      encodeUint256(BASE_SEPOLIA_CHAIN_ID),
      encodeAddress(accepted.asset)
    )
  );

  const transferWithAuthTypeHash = keccak_256(
    utf8ToBytes(
      "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
  );
  const structHash = keccak_256(
    concatBytes(
      transferWithAuthTypeHash,
      encodeAddress(from),
      encodeAddress(to),
      encodeUint256(amountUnits),
      encodeUint256(validAfter),
      encodeUint256(validBefore),
      encodeBytes32(nonceHex)
    )
  );

  const eip712Digest = keccak_256(
    concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator, structHash)
  );

  const sigRec = secp256k1.sign(eip712Digest, privBytes, {
    prehash: false,
    format: "recovered",
  });
  const evmSig = new Uint8Array(65);
  evmSig.set(sigRec.slice(1, 65), 0); // r + s
  evmSig[64] = sigRec[0] + 27; // v = 27 or 28
  const signatureHex = `0x${bytesToHex(evmSig)}`;

  const paymentPayload = {
    x402Version: 2,
    ...(paymentRequired.resource ? { resource: paymentRequired.resource } : {}),
    accepted,
    payload: {
      signature: signatureHex,
      authorization: {
        from,
        to,
        value: amountUnits.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce: nonceHex,
      },
    },
  };

  return {
    paymentSignatureHeader: encodeBase64Json(paymentPayload),
    paidUsd,
    payerAddress: from,
    nonce: nonceHex,
  };
}
