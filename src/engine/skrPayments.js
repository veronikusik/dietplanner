import {
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

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

const RPC_ENDPOINTS = [
  'https://mainnet.helius-rpc.com/?api-key=8b86bd0d-4534-4ce9-a61d-ec3850cb0b62',
  'https://mainnet.helius-rpc.com/?api-key=6b3d0180-4354-4e31-a2fc-9b6cd9e550a7',
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
];

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
      identity: { name: 'DietPlanner', uri: 'https://dietplanner.app' },
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

  let confirmed = false;
  try {
    const { blockhash, lastValidBlockHeight } = await workingConnection.getLatestBlockhash('confirmed');
    const confirmation = await workingConnection.confirmTransaction({ signature: txSignature, blockhash, lastValidBlockHeight }, 'confirmed');
    confirmed = !confirmation.value.err;
  } catch (_) {
    confirmed = true;
  }

  if (!confirmed) {
    return { success: false, intent, signature: txSignature, error: 'Transaction sent but confirmation failed. Check Solscan.' };
  }

  return {
    success: true,
    signature: txSignature,
    intent: { ...intent, status: 'paid', mintAddress: SKR_MINT_ADDRESS },
  };
}
