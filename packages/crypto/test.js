// Simple test for crypto functions
// Run with: node test.js

import {
  generateKeyPair,
  deriveSharedKey,
  encrypt,
  decrypt,
} from "./dist/index.js";

async function testCrypto() {
  console.log("Testing crypto functions...");

  // Generate two keypairs
  const aliceKeys = await generateKeyPair();
  const bobKeys = await generateKeyPair();

  // Derive shared secrets
  const aliceShared = await deriveSharedKey(
    aliceKeys.privateKey,
    bobKeys.publicKey,
  );
  const bobShared = await deriveSharedKey(
    bobKeys.privateKey,
    aliceKeys.publicKey,
  );

  // Test that both can encrypt/decrypt with their shared keys
  const message = "Hello, world!";
  const encryptedByAlice = await encrypt(message, aliceShared);
  const decryptedByBob = await decrypt(
    encryptedByAlice.ciphertext,
    encryptedByAlice.iv,
    bobShared,
  );

  if (decryptedByBob !== message) {
    throw new Error("Cross-user encryption/decryption failed!");
  }

  const encryptedByBob = await encrypt(message, bobShared);
  const decryptedByAlice = await decrypt(
    encryptedByBob.ciphertext,
    encryptedByBob.iv,
    aliceShared,
  );

  if (decryptedByAlice !== message) {
    throw new Error("Cross-user encryption/decryption failed!");
  }

  console.log("✅ All crypto tests passed!");
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

testCrypto().catch(console.error);
