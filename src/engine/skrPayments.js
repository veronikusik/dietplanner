import {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';

if (typeof global.Buffer === 'undefined') { global.Buffer = Buffer; }
if (typeof globalThis.Buffer === 'undefined') { globalThis.Buffer = Buffer; }

let createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID;
try {
  const spl = require('@solana/spl-token');
  createTransferInstruction = spl.createTransferInstruction;
  getAssociatedTokenAddress = spl.getAssociatedTokenAddress;
  createAssociatedTokenAccountInstruction = spl.createAssociatedTokenAccountInstruction;
  TOKEN_PROGRAM_ID = spl.TOKEN_PROGRAM_ID;
  ASSOCIATED_TOKEN_PROGRAM_ID = spl.ASSOCIATED_TOKEN_PROGRAM_ID;
} catch (_) {}

export const SKR_TREASURY_WALLET = '8uGjpp5np7qj8wr9xtKrYJcuXpfVdUixZQDaESvqpS6J';
export const SKR_MINT_ADDRESS = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const SKR_DECIMALS = 6;

// MWA identity. Must match the canonical app domain so wallet apps can
// display a trustworthy origin string on the authorize prompt. Mismatched
// URIs render as "unknown / untrusted" in several Solana wallets.
const APP_IDENTITY = { name: 'DietPlanner', uri: 'https://dietplanner.fit' };

// RPC endpoints used by the SKR payment flow.
//
// We need RELIABLE RPC for: getLatestBlockhash, ATA-info lookup, token
// balance check, transaction send, signature confirmation polling. Public
// no-key RPCs (mainnet-beta, Ankr free tier) are heavily rate-limited and
// frequently 429 under retail load — which would make payments fail and
// users see "confirmation failed" toasts even when the on-chain transfer
// completed. So the default endpoint list includes two Helius keys that
// the publisher has provisioned for this app. These are Helius API keys,
// not signing keys: a leaked key only burns the publisher's rate quota,
// it CANNOT move funds, sign transactions, or read private data.
//
// Layered priority (first reachable wins, falls forward on error):
//   1. `app.json` → `expo.extra.skrRpcEndpoints[]` if provided (lets a
//      maintainer rotate or replace endpoints without a code change)
//   2. Built-in premium endpoints (Helius)
//   3. Public fallbacks (Ankr, mainnet-beta, publicnode)
//
// To rotate the Helius keys: either change them here OR add a new
// `skrRpcEndpoints` array under `expo.extra` in app.json — the override
// takes precedence and the built-ins become irrelevant.
const BUILTIN_PREMIUM_RPC = [
  'https://mainnet.helius-rpc.com/?api-key=8b86bd0d-4534-4ce9-a61d-ec3850cb0b62',
  'https://mainnet.helius-rpc.com/?api-key=6b3d0180-4354-4e31-a2fc-9b6cd9e550a7',
];
const PUBLIC_RPC_FALLBACKS = [
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];
const extraRpc = Constants?.expoConfig?.extra?.skrRpcEndpoints
  || Constants?.manifest?.extra?.skrRpcEndpoints
  || [];
const RPC_ENDPOINTS = (Array.isArray(extraRpc) && extraRpc.length ? extraRpc : BUILTIN_PREMIUM_RPC).concat(PUBLIC_RPC_FALLBACKS);

let connection = null;
let currentRpcIndex = 0;

async function getConnection() {
  if (connection) {
    try { await connection.getLatestBlockhash('confirmed'); return connection; } catch (_) { connection = null; }
  }
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    try {
      const conn = new Connection(RPC_ENDPOINTS[i], 'confirmed');
      await conn.getLatestBlockhash('confirmed');
      connection = conn;
      currentRpcIndex = i;
      return conn;
    } catch (_) { /* try next */ }
  }
  throw new Error('Cannot reach Solana network. Check your internet connection and try again.');
}

export const SKR_PRODUCTS = {
  PRO_MONTHLY: {
    id: 'dietplanner_pro_monthly',
    label: 'AI Chef Pro',
    amountSkr: 100,
  },
  FOOD_REPORT: {
    id: 'dietplanner_food_report',
    label: 'Deep Food Intel',
    amountSkr: 50,
  },
  DAILY_COACH: {
    id: 'dietplanner_daily_coach',
    label: 'Micro-Coach',
    amountSkr: 10,
  },
};

export function buildSkrPaymentIntent({ productId, walletAddress }) {
  const product = Object.values(SKR_PRODUCTS).find(item => item.id === productId);
  if (!product) throw new Error('Unknown SKR product');
  if (!walletAddress) throw new Error('Wallet is required');
  return {
    productId: product.id,
    label: product.label,
    amountSkr: product.amountSkr,
    fromWallet: walletAddress,
    treasuryWallet: SKR_TREASURY_WALLET,
    mintAddress: SKR_MINT_ADDRESS,
    status: 'ready_for_spl_token_transfer',
  };
}

export async function submitSkrPaymentIntent(intent, { transact } = {}) {
  if (!createTransferInstruction || !getAssociatedTokenAddress) {
    return { success: false, error: 'SKR payments are not available on this build.' };
  }
  if (!SKR_MINT_ADDRESS) {
    return { success: false, missingMint: true, intent, nextStep: 'Set SKR_MINT_ADDRESS.' };
  }
  if (typeof transact !== 'function') {
    throw new Error('Mobile Wallet Adapter transact function is required.');
  }

  const workingConnection = await getConnection();
  const mintPubkey = new PublicKey(SKR_MINT_ADDRESS);
  const collectorOwner = new PublicKey(SKR_TREASURY_WALLET);
  const amountRaw = Math.ceil(intent.amountSkr * Math.pow(10, SKR_DECIMALS));

  const txSignature = await transact(async (wallet) => {
    const authResult = await wallet.authorize({
      cluster: 'mainnet-beta',
      identity: APP_IDENTITY,
    });
    const payerAddress = authResult.accounts[0].address;
    const payerBytes = typeof payerAddress === 'string'
      ? Uint8Array.from(atob(payerAddress), c => c.charCodeAt(0))
      : new Uint8Array(payerAddress);
    const payerPubkey = new PublicKey(payerBytes);

    const ownerAta = await getAssociatedTokenAddress(mintPubkey, payerPubkey);
    const collectorAta = await getAssociatedTokenAddress(mintPubkey, collectorOwner);

    const ownerBalance = await workingConnection.getTokenAccountBalance(ownerAta).catch(() => null);
    if (!ownerBalance || Number(ownerBalance.value.amount) < amountRaw) {
      throw new Error(`Insufficient SKR balance. Need ${intent.amountSkr} SKR.`);
    }

    const instructions = [];
    const collectorAtaInfo = await workingConnection.getAccountInfo(collectorAta);
    if (!collectorAtaInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(payerPubkey, collectorAta, collectorOwner, mintPubkey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
      );
    }
    instructions.push(
      createTransferInstruction(ownerAta, collectorAta, payerPubkey, amountRaw, [], TOKEN_PROGRAM_ID)
    );

    const { blockhash } = await workingConnection.getLatestBlockhash('confirmed');
    const messageV0 = new TransactionMessage({
      payerKey: payerPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const versionedTx = new VersionedTransaction(messageV0);

    const signatures = await wallet.signAndSendTransactions({ transactions: [versionedTx] });
    return signatures[0];
  });

  if (!txSignature) {
    return { success: false, intent, error: 'Transaction was not signed.' };
  }

  // Confirm the transaction landed and did not revert on-chain.
  //
  // Previous behaviour assumed success on any thrown error inside
  // confirmTransaction — that is dangerous. A flaky RPC, expired blockhash,
  // or aborted promise would all result in the user being granted the
  // entitlement for a transfer that may never have landed. Replaced with:
  //
  //   1. confirmTransaction with the blockhash that was actually used by
  //      the signed tx (re-fetched here; cluster keeps the slot's blockhash
  //      valid for ~150 blocks ≈ 1 min so this is usually still in-window).
  //   2. If that throws or returns an error, fall back to a polling loop
  //      against `getSignatureStatuses` for up to ~30 s. The on-chain
  //      status is the ground truth — we only mark the payment confirmed
  //      when the RPC returns `confirmationStatus` in {'confirmed','finalized'}
  //      AND `err === null`.
  //
  // Result: a network glitch produces an honest "confirmation failed"
  // toast and a stored pendingIntent that the user can retry, rather than
  // a phantom entitlement.
  let confirmed = false;
  let confirmErrorMessage = null;

  try {
    const { blockhash, lastValidBlockHeight } = await workingConnection.getLatestBlockhash('confirmed');
    const result = await workingConnection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    if (result?.value?.err) {
      confirmErrorMessage = `Tx reverted on-chain: ${JSON.stringify(result.value.err)}`;
    } else {
      confirmed = true;
    }
  } catch (e) {
    confirmErrorMessage = `confirmTransaction threw: ${e?.message || e}`;
  }

  if (!confirmed) {
    // Fallback: poll signature status directly. This handles the common
    // case where confirmTransaction throws because the blockhash window
    // expired but the tx actually landed in an earlier slot.
    const POLL_INTERVAL_MS = 2000;
    const POLL_DEADLINE_MS = Date.now() + 30_000;
    while (Date.now() < POLL_DEADLINE_MS) {
      try {
        const { value } = await workingConnection.getSignatureStatuses([txSignature]);
        const s = value?.[0];
        if (s) {
          if (s.err) {
            confirmErrorMessage = `Tx reverted on-chain: ${JSON.stringify(s.err)}`;
            break;
          }
          if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') {
            confirmed = true;
            confirmErrorMessage = null;
            break;
          }
        }
      } catch (e) {
        // Transient RPC error — keep polling until deadline.
        confirmErrorMessage = `Signature status check failed: ${e?.message || e}`;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  if (!confirmed) {
    return {
      success: false,
      intent,
      signature: txSignature,
      error: confirmErrorMessage || 'Transaction sent but confirmation failed. Check the signature on Solscan.',
    };
  }

  return {
    success: true,
    signature: txSignature,
    intent: { ...intent, status: 'paid', mintAddress: SKR_MINT_ADDRESS },
  };
}
