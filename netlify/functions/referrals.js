const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
const REFERRAL_PARTNERS_FILE = path.join(DATA_DIR, 'referral_partners.json');
const REFERRAL_LEDGER_FILE = path.join(DATA_DIR, 'referral_ledger.json');
const REFERRAL_PAYOUTS_FILE = path.join(DATA_DIR, 'referral_payouts.json');

function getReferralEconomics(productType, grossAmount = null) {
  let gross = 49.99;
  let cogs = 1.79;
  let productName = 'Base Appliance ($49.99 Lifetime)';

  switch (productType) {
    case 'base_appliance':
    case 'standard':
      gross = 49.99;
      cogs = 1.79; // $1.75 Stripe + $0.04 server delivery
      productName = 'Base Appliance ($49.99 Lifetime)';
      break;
    case 'pro_gateway':
    case 'pro':
      gross = 299.99;
      cogs = 10.00; // $9.00 Stripe fee + $1.00 relay reserve
      productName = 'Perpetual Pro Gateway ($299.99 Lifetime)';
      break;
    case 'pro_upgrade':
      gross = 249.99;
      cogs = 8.55; // $7.55 Stripe + $1.00 relay reserve
      productName = 'Perpetual Pro Upgrade ($249.99 Lifetime)';
      break;
    case 'voice_addon':
    case 'voice_sub':
      gross = 9.99;
      cogs = 2.09; // $0.59 Stripe + $1.50 DID line
      productName = 'AI Voice Receptionist ($9.99/mo)';
      break;
    case 'credit_pack':
      gross = 10.00;
      cogs = 4.79; // $0.59 Stripe + $4.20 Vapi raw 40m
      productName = 'Voice Credit Pack ($10.00 / 40 Mins)';
      break;
    default:
      if (grossAmount) {
        gross = Number(grossAmount);
        cogs = Math.round((gross * 0.035 + 0.30) * 100) / 100;
        productName = `Product ($${gross.toFixed(2)})`;
      }
      break;
  }

  if (grossAmount !== null && grossAmount !== undefined && !isNaN(grossAmount)) {
    gross = Number(grossAmount);
  }

  const netProfit = Math.max(0, Math.round((gross - cogs) * 100) / 100);
  return { gross, cogs, netProfit, productName };
}

function calculateReferralCommission(productType, grossAmount = null, revSharePct = 25) {
  const econ = getReferralEconomics(productType, grossAmount);
  const pct = Number(revSharePct) || 25;
  const commissionEarned = Math.round((econ.netProfit * (pct / 100)) * 100) / 100;
  return {
    ...econ,
    commissionPct: pct,
    commissionEarned
  };
}

function getReferralPartners() {
  if (fs.existsSync(REFERRAL_PARTNERS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REFERRAL_PARTNERS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_partners.json:', e.message);
    }
  }
  return [];
}

function saveReferralPartners(partners) {
  fs.mkdirSync(path.dirname(REFERRAL_PARTNERS_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_PARTNERS_FILE, JSON.stringify(partners, null, 2), 'utf8');
}

function getReferralLedger() {
  if (fs.existsSync(REFERRAL_LEDGER_FILE)) {
    try {
      const ledger = JSON.parse(fs.readFileSync(REFERRAL_LEDGER_FILE, 'utf8'));
      const now = new Date();
      let changed = false;
      ledger.forEach(tx => {
        if (tx.status === 'PENDING_BUFFER' && tx.clearsAt && new Date(tx.clearsAt) <= now) {
          tx.status = 'AVAILABLE';
          changed = true;
        }
      });
      if (changed) {
        saveReferralLedger(ledger);
      }
      return ledger;
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_ledger.json:', e.message);
    }
  }
  return [];
}

function saveReferralLedger(ledger) {
  fs.mkdirSync(path.dirname(REFERRAL_LEDGER_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf8');
}

function getReferralPayouts() {
  if (fs.existsSync(REFERRAL_PAYOUTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REFERRAL_PAYOUTS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[Referrals] Failed to parse referral_payouts.json:', e.message);
    }
  }
  return [];
}

function saveReferralPayouts(payouts) {
  fs.mkdirSync(path.dirname(REFERRAL_PAYOUTS_FILE), { recursive: true });
  fs.writeFileSync(REFERRAL_PAYOUTS_FILE, JSON.stringify(payouts, null, 2), 'utf8');
}

function syncPartnerMetrics() {
  const partners = getReferralPartners();
  const ledger = getReferralLedger();

  partners.forEach(partner => {
    const txs = ledger.filter(t => t.partnerCode && t.partnerCode.toUpperCase() === partner.code.toUpperCase());
    let totalGross = 0;
    let totalNet = 0;
    let totalEarned = 0;
    let totalPaid = 0;
    let pendingBuffer = 0;
    let availablePayout = 0;

    txs.forEach(t => {
      if (t.status !== 'REFUNDED') {
        totalGross += Number(t.grossAmount) || 0;
        totalNet += Number(t.netProfit) || 0;
        totalEarned += Number(t.commissionEarned) || 0;
        if (t.status === 'PAID') {
          totalPaid += Number(t.commissionEarned) || 0;
        } else if (t.status === 'AVAILABLE') {
          availablePayout += Number(t.commissionEarned) || 0;
        } else if (t.status === 'PENDING_BUFFER') {
          pendingBuffer += Number(t.commissionEarned) || 0;
        }
      }
    });

    partner.totalGrossReferred = Math.round(totalGross * 100) / 100;
    partner.totalNetProfitReferred = Math.round(totalNet * 100) / 100;
    partner.totalEarnedCommission = Math.round(totalEarned * 100) / 100;
    partner.totalPaidCommission = Math.round(totalPaid * 100) / 100;
    partner.pendingBufferCommission = Math.round(pendingBuffer * 100) / 100;
    partner.availablePayoutCommission = Math.round(availablePayout * 100) / 100;
  });

  saveReferralPartners(partners);
  return partners;
}

function addReferralTransaction({ partnerCode, orderId, customerEmail, productType, grossAmount }) {
  if (!partnerCode) return null;
  const cleanCode = String(partnerCode).trim().toUpperCase();
  const partners = getReferralPartners();
  const partner = partners.find(p => p.code.toUpperCase() === cleanCode);
  if (!partner) {
    console.log(`⚠️ [Referral Engine] Code "${cleanCode}" not found in registered partners. Skipping ledger.`);
    return null;
  }

  const commission = calculateReferralCommission(productType, grossAmount, partner.revSharePct || 25);
  const now = new Date();
  const clearsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14-day anti-fraud buffer

  const newTx = {
    id: `ref_tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    orderId: orderId || `order_${Date.now()}`,
    date: now.toISOString(),
    partnerCode: partner.code,
    partnerName: partner.name,
    customerEmail: customerEmail || 'customer@unknown.com',
    productType: productType,
    productName: commission.productName,
    grossAmount: commission.gross,
    cogs: commission.cogs,
    netProfit: commission.netProfit,
    commissionPct: commission.commissionPct,
    commissionEarned: commission.commissionEarned,
    status: 'PENDING_BUFFER',
    clearsAt: clearsAt,
    payoutBatchId: null,
    payoutDate: null
  };

  const ledger = getReferralLedger();
  ledger.unshift(newTx);
  saveReferralLedger(ledger);
  syncPartnerMetrics();
  console.log(`🤝 [REFERRAL LOGGED] Partner ${partner.code} credited $${newTx.commissionEarned} (25% on net profit $${newTx.netProfit}) from order ${orderId}`);
  return newTx;
}

exports.getReferralEconomics = getReferralEconomics;
exports.calculateReferralCommission = calculateReferralCommission;
exports.getReferralPartners = getReferralPartners;
exports.saveReferralPartners = saveReferralPartners;
exports.getReferralLedger = getReferralLedger;
exports.saveReferralLedger = saveReferralLedger;
exports.getReferralPayouts = getReferralPayouts;
exports.saveReferralPayouts = saveReferralPayouts;
exports.syncPartnerMetrics = syncPartnerMetrics;
exports.addReferralTransaction = addReferralTransaction;

exports.handler = async function(event, context) {
  const method = event.httpMethod || 'GET';
  const query = event.queryStringParameters || {};
  const action = query.action || 'summary';

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) {}
  }

  if (action === 'summary' || action === 'partners') {
    if (method === 'GET') {
      const partners = syncPartnerMetrics();
      const ledger = getReferralLedger();
      const summary = {
        totalPartners: partners.length,
        activePartners: partners.filter(p => p.status === 'ACTIVE').length,
        totalGrossReferred: Math.round(partners.reduce((s, p) => s + (p.totalGrossReferred || 0), 0) * 100) / 100,
        totalNetProfitReferred: Math.round(partners.reduce((s, p) => s + (p.totalNetProfitReferred || 0), 0) * 100) / 100,
        totalEarnedCommission: Math.round(partners.reduce((s, p) => s + (p.totalEarnedCommission || 0), 0) * 100) / 100,
        totalPaidCommission: Math.round(partners.reduce((s, p) => s + (p.totalPaidCommission || 0), 0) * 100) / 100,
        pendingBufferCommission: Math.round(partners.reduce((s, p) => s + (p.pendingBufferCommission || 0), 0) * 100) / 100,
        availablePayoutCommission: Math.round(partners.reduce((s, p) => s + (p.availablePayoutCommission || 0), 0) * 100) / 100,
        totalTransactions: ledger.length
      };
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, summary, partners }) };
    }

    if (method === 'POST') {
      if (!body.code || !body.name) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Partner code and name are required' }) };
      }
      const partners = getReferralPartners();
      const cleanCode = String(body.code).trim().toUpperCase();
      let existingIndex = partners.findIndex(p => p.code.toUpperCase() === cleanCode);

      const partnerRecord = {
        code: cleanCode,
        name: String(body.name).trim(),
        email: String(body.email || '').trim(),
        phone: String(body.phone || '').trim(),
        revSharePct: Number(body.revSharePct) || 25,
        payoutMethod: body.payoutMethod || 'cash_app',
        payoutHandle: String(body.payoutHandle || '').trim(),
        notes: String(body.notes || '').trim(),
        status: body.status || 'ACTIVE',
        createdAt: (existingIndex >= 0 ? partners[existingIndex].createdAt : new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        totalGrossReferred: existingIndex >= 0 ? partners[existingIndex].totalGrossReferred : 0,
        totalNetProfitReferred: existingIndex >= 0 ? partners[existingIndex].totalNetProfitReferred : 0,
        totalEarnedCommission: existingIndex >= 0 ? partners[existingIndex].totalEarnedCommission : 0,
        totalPaidCommission: existingIndex >= 0 ? partners[existingIndex].totalPaidCommission : 0,
        pendingBufferCommission: existingIndex >= 0 ? partners[existingIndex].pendingBufferCommission : 0,
        availablePayoutCommission: existingIndex >= 0 ? partners[existingIndex].availablePayoutCommission : 0
      };

      if (existingIndex >= 0) {
        partners[existingIndex] = partnerRecord;
      } else {
        partners.push(partnerRecord);
      }

      saveReferralPartners(partners);
      syncPartnerMetrics();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, partner: partnerRecord }) };
    }
  }

  if (action === 'ledger') {
    const ledger = getReferralLedger();
    syncPartnerMetrics();
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, ledger }) };
  }

  if (action === 'payout' && method === 'POST') {
    const targetPartner = (body.partnerCode || 'ALL').trim().toUpperCase();
    const note = body.note || 'Missed Call Auto SMS Net-Profit Rev-Share Payout';
    const ledger = getReferralLedger();
    const partners = getReferralPartners();

    const eligibleTxs = ledger.filter(tx => {
      if (tx.status !== 'AVAILABLE') return false;
      if (targetPartner !== 'ALL' && tx.partnerCode.toUpperCase() !== targetPartner) return false;
      return true;
    });

    if (eligibleTxs.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'No cleared commissions currently available for payout' }) };
    }

    const batchId = `payout_batch_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const grouped = {};

    eligibleTxs.forEach(tx => {
      if (!grouped[tx.partnerCode]) {
        const partner = partners.find(p => p.code.toUpperCase() === tx.partnerCode.toUpperCase()) || {};
        grouped[tx.partnerCode] = {
          partnerCode: tx.partnerCode,
          partnerName: tx.partnerName || partner.name || tx.partnerCode,
          payoutMethod: partner.payoutMethod || 'cash_app',
          payoutHandle: partner.payoutHandle || 'N/A',
          amount: 0,
          transactionIds: [],
          processedAt: nowIso,
          referenceNote: note
        };
      }
      grouped[tx.partnerCode].amount = Math.round((grouped[tx.partnerCode].amount + tx.commissionEarned) * 100) / 100;
      grouped[tx.partnerCode].transactionIds.push(tx.id);

      tx.status = 'PAID';
      tx.payoutBatchId = batchId;
      tx.payoutDate = nowIso;
    });

    const payoutItems = Object.values(grouped);
    const totalBatchAmount = Math.round(payoutItems.reduce((s, item) => s + item.amount, 0) * 100) / 100;

    const batchRecord = {
      batchId,
      createdAt: nowIso,
      totalAmount: totalBatchAmount,
      payoutCount: payoutItems.length,
      status: 'COMPLETED',
      notes: note,
      payouts: payoutItems
    };

    const payouts = getReferralPayouts();
    payouts.unshift(batchRecord);
    saveReferralPayouts(payouts);
    saveReferralLedger(ledger);
    syncPartnerMetrics();

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, batch: batchRecord }) };
  }

  return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Endpoint not found' }) };
};
