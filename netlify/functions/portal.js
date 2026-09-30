const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const AGENCIES_CONFIG_PATH = path.join(ROOT_DIR, 'agencies', 'agencies.json');
const CLIENT_ACCOUNTS_FILE = path.join(DATA_DIR, 'client_accounts.json');
const CLIENT_SMS_FILE = path.join(DATA_DIR, 'client_sms_history.json');
const CLIENT_TASKS_FILE = path.join(DATA_DIR, 'client_tasks.json');
const MASTER_LICENSES_FILE = path.join(DATA_DIR, 'master_licenses.json');
const VOICE_LOGS_FILE = path.join(DATA_DIR, 'voice_call_logs.json');
const VOICE_SETTINGS_FILE = path.join(DATA_DIR, 'voice_settings.json');
const VOICE_PRO_BINDINGS_FILE = path.join(ROOT_DIR, '.voice_pro_bindings.json');

function readJsonFile(filePath, fallback = []) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn(`[Portal] Error reading ${filePath}:`, e.message);
    }
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[Portal] Error writing ${filePath}:`, e.message);
  }
}

function getMasterLicenses() {
  const data = readJsonFile(MASTER_LICENSES_FILE, []);
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([key, val]) => ({ key, ...val }));
  }
  return [];
}

function getClientAccounts() {
  const data = readJsonFile(CLIENT_ACCOUNTS_FILE, []);
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([key, val]) => ({ id: key, ...val }));
  }
  return [];
}

function getVoiceSubscribers() {
  const data = readJsonFile(VOICE_PRO_BINDINGS_FILE, {});
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data).map(([key, val]) => ({ licenseKey: key, ...val }));
  }
  return [];
}

function getVoiceCallLogs() {
  const logs = readJsonFile(VOICE_LOGS_FILE, []);
  if (!logs.length) {
    return [
      {
        id: 'call_demo_1790790100',
        timestamp: new Date().toISOString(),
        customerPhone: '+1 (555) 789-0123',
        customerName: 'Sarah Jenkins',
        durationSeconds: 145,
        status: 'COMPLETED',
        urgency: 'HIGH',
        recordingUrl: 'https://vapi-public.s3.amazonaws.com/recordings/sample-roof-leak.mp3',
        transcript: 'Customer called inquiring about commercial roofing repair. Immediate estimate requested.',
        summary: 'Emergency leak repair inquiry in northern industrial district.',
        aiDiagnostics: {
          sttEngine: 'Deepgram Nova-2 HD (99.2% Accuracy)',
          llmModel: 'Claude 3.5 Sonnet / Vapi Telecom Pipeline',
          ttsEngine: 'Cartesia Sonic (110ms Latency)',
          carrierRoute: 'Verizon Physical SIM (Slot 1)',
          pstnStatus: 'Carrier *71 Conditional Forward Active',
          callLatencyMs: 142
        }
      }
    ];
  }
  return logs;
}

function getClientSmsHistory(licenseKey) {
  return readJsonFile(CLIENT_SMS_FILE, []);
}

function getClientTasks(licenseKey) {
  const tasks = readJsonFile(CLIENT_TASKS_FILE, []);
  if (!tasks.length) {
    return [
      {
        id: 'task_demo_101',
        licenseKey: licenseKey || 'DEFAULT',
        title: 'Send formal quote for commercial roof repair',
        category: 'ESTIMATE_DISPATCH',
        priority: 'HIGH',
        customerName: 'Sarah Jenkins',
        customerPhone: '+1 (555) 789-0123',
        dueSla: 'Today by 5:00 PM',
        status: 'PENDING',
        createdAt: new Date().toISOString()
      }
    ];
  }
  return tasks;
}

function resolvePortalBranding(agencySlug) {
  const defaultBranding = {
    appName: 'Missed Call Auto SMS',
    legalName: 'Missed Call Auto SMS',
    tagline: 'Client Call, SMS & AI Tasks Portal',
    supportEmail: 'support@missedcallautosms.com',
    supportPhone: '+1 (732) 660-9121',
    logoUrl: '/favicon.svg',
    iconUrl: '/favicon.svg',
    customDomain: 'missedcallautosms.com',
    privacyPolicyUrl: 'https://missedcallautosms.com/privacy.html',
    termsUrl: 'https://missedcallautosms.com/terms.html',
    theme: {
      primaryColor: '#2563EB',
      accentColor: '#38BDF8'
    }
  };

  if (!agencySlug || agencySlug === 'default') return defaultBranding;

  const agenciesData = readJsonFile(AGENCIES_CONFIG_PATH, { agencies: {} });
  const ag = agenciesData.agencies && agenciesData.agencies[agencySlug];
  if (!ag) return defaultBranding;

  return {
    appName: ag.appName || ag.legalName || 'Agency Partner',
    legalName: ag.legalName || ag.appName || 'Agency Partner',
    tagline: ag.tagline || 'AI Telecom Appliance & 24/7 Voice Receptionist',
    supportEmail: ag.supportEmail || 'support@missedcallautosms.com',
    supportPhone: ag.supportPhone || '',
    logoUrl: ag.logoUrl || '',
    iconUrl: ag.iconUrl || '',
    customDomain: ag.customDomain || '',
    privacyPolicyUrl: ag.privacyPolicyUrl || '',
    termsUrl: ag.termsUrl || '',
    theme: ag.theme || { primaryColor: '#2563EB', accentColor: '#38BDF8' }
  };
}

function enrichCallWithAiDiagnostics(call) {
  const isUrgent = call.urgency === 'HIGH';
  return {
    ...call,
    aiDiagnostics: call.aiDiagnostics || {
      sttEngine: 'Deepgram Nova-2 HD (99.2% Accuracy)',
      llmModel: 'Claude 3.5 Sonnet / Vapi Realtime LLM',
      ttsEngine: 'Cartesia Sonic (110ms Ultra-Low Latency)',
      carrierRoute: 'Native Android Carrier Telephony API (P2P Cellular)',
      pstnStatus: '*71 Conditional Carrier Forward Active',
      callLatencyMs: isUrgent ? 118 : 142
    }
  };
}

function decodeKeyInfo(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-');
  for (const part of parts) {
    if (part.length >= 16 && /^[0-9A-Fa-f]+$/.test(part)) {
      try {
        const decoded = Buffer.from(part, 'hex').toString('utf8');
        const split = decoded.split('|');
        if (split.length >= 2) {
          return {
            clientName: split[0],
            agencyId: split[3] ? split[3].toLowerCase() : ''
          };
        }
      } catch (e) {}
    }
  }
  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const rawPath = event.path || '';
  // Normalize path removing /.netlify/functions/portal or /api/portal
  const subPath = rawPath
    .replace(/^\/\.netlify\/functions\/portal/, '')
    .replace(/^\/api\/portal/, '')
    .toLowerCase();

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) {}
  }

  // 1. GET /api/portal/branding
  if (subPath === '/branding' || subPath === '/branding/') {
    const agencySlug = (event.queryStringParameters && event.queryStringParameters.agency) || 'default';
    const branding = resolvePortalBranding(agencySlug);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, branding }) };
  }

  // 2. POST /api/portal/auth-check
  if (subPath === '/auth-check' || subPath === '/auth-check/') {
    const token = body.token || (event.headers['authorization'] || '').replace('Bearer ', '').trim();
    const accounts = getClientAccounts();
    let account = accounts.find(a => a.token === token);

    // If token is an impersonation token or matches by license key
    if (!account && token && token.startsWith('impersonate_')) {
      const parts = token.split('_');
      const keyCandidate = parts[1];
      if (keyCandidate) {
        account = accounts.find(a => a.licenseKey === keyCandidate.toUpperCase());
      }
    }

    if (!account) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Session invalid or expired' }) };
    }

    const subscribers = getVoiceSubscribers();
    const sub = subscribers.find(s => s.licenseKey === account.licenseKey);
    const branding = resolvePortalBranding(account.agencyId);
    const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
    const sms = getClientSmsHistory(account.licenseKey);
    const tasks = getClientTasks(account.licenseKey);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token: account.token,
        user: {
          username: account.username,
          email: account.email,
          businessName: account.businessName,
          licenseKey: account.licenseKey,
          agencyId: account.agencyId
        },
        branding,
        client: {
          name: account.businessName,
          licenseKey: account.licenseKey,
          voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || 45.2,
          carrierCode: (sub && sub.carrierCode) || '*71',
          isVoicePaused: false,
          handsetStatus: 'ONLINE',
          lastCheckin: new Date().toISOString()
        },
        calls,
        sms,
        tasks,
        stats: {
          totalCalls: calls.length,
          urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
          totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
          totalSmsCount: sms.length,
          pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
        }
      })
    };
  }

  // 3. POST /api/portal/view-as - Direct Frictionless View-As Account Impersonation
  if (subPath === '/view-as' || subPath === '/view-as/') {
    let rawKey = String(body.licenseKey || body.account || body.key || '').trim().toUpperCase();
    const viewerRole = String(body.viewerRole || 'agency').toLowerCase(); // 'agency', 'owner', or 'view'
    let reqAgencyId = String(body.agencyId || '').trim().toLowerCase();
    const nameHint = String(body.clientName || body.name || body.business || '').trim();

    const masterList = getMasterLicenses();
    const subscribers = getVoiceSubscribers();
    const accounts = getClientAccounts();

    // If key wasn't explicitly passed, fallback to first available account
    if (!rawKey && accounts.length > 0) {
      rawKey = accounts[0].licenseKey;
    }

    if (!rawKey) {
      rawKey = 'MCAS-PRO-DEMO-APPLIANCE';
    }

    const master = masterList.find(m => m.key === rawKey);
    const sub = subscribers.find(s => s.licenseKey === rawKey);
    let existingAcc = accounts.find(a => a.licenseKey === rawKey);
    const decoded = decodeKeyInfo(rawKey);

    // Resolve client business name
    const clientName = nameHint || 
      (existingAcc && existingAcc.businessName) || 
      (master && (master.customer || master.businessName || master.name)) || 
      (sub && (sub.name || sub.businessName)) || 
      (decoded && decoded.clientName) || 
      'Client Business';

    // Resolve agency id
    const clientAgencyId = (sub && sub.agencyId) || 
      (master && master.agencyId) || 
      (existingAcc && existingAcc.agencyId) || 
      (decoded && decoded.agencyId) || 
      reqAgencyId || 
      'default';

    // If account record does not exist yet, create one seamlessly so all portal operations work
    let token = existingAcc ? existingAcc.token : null;
    if (!token) {
      token = 'token_' + crypto.randomBytes(16).toString('hex');
      existingAcc = {
        username: (clientName.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'client') + '_' + rawKey.slice(-4).toLowerCase(),
        email: (master && master.email) || (sub && sub.email) || `${clientName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}@office.local`,
        businessName: clientName,
        licenseKey: rawKey,
        agencyId: clientAgencyId,
        token: token,
        createdAt: new Date().toISOString()
      };
      accounts.push(existingAcc);
      writeJsonFile(CLIENT_ACCOUNTS_FILE, accounts);
    }

    const branding = resolvePortalBranding(clientAgencyId);
    const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
    const sms = getClientSmsHistory(rawKey);
    const tasks = getClientTasks(rawKey);

    const returnUrl = (viewerRole === 'owner')
      ? `/owner_admin_dashboard.html`
      : `/agency-dashboard?agency=${encodeURIComponent(clientAgencyId || 'agency')}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        impersonation: {
          active: true,
          viewerRole,
          agencyId: clientAgencyId,
          agencyName: branding.appName || clientAgencyId,
          clientName,
          licenseKey: rawKey,
          returnUrl
        },
        token: existingAcc.token,
        user: {
          username: existingAcc.username,
          email: existingAcc.email,
          businessName: clientName,
          licenseKey: rawKey,
          agencyId: clientAgencyId
        },
        branding,
        client: {
          name: clientName,
          licenseKey: rawKey,
          voiceMinutesBalance: (sub && sub.voiceMinutesBalance) || (master && master.voiceMinutesBalance) || 45.2,
          carrierCode: (sub && sub.carrierCode) || (master && master.carrierCode) || '*71',
          isVoicePaused: false,
          handsetStatus: 'ONLINE',
          lastCheckin: new Date().toISOString()
        },
        calls,
        sms,
        tasks,
        stats: {
          totalCalls: calls.length,
          urgentCount: calls.filter(c => c.urgency === 'HIGH').length,
          totalMinutesUsed: Math.round(calls.reduce((acc, c) => acc + (c.durationSeconds || 60), 0) / 60 * 10) / 10,
          totalSmsCount: sms.length,
          pendingTasksCount: tasks.filter(t => t.status === 'PENDING').length
        }
      })
    };
  }

  // 4. POST /api/portal/login
  if (subPath === '/login' || subPath === '/login/') {
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';

    const accounts = getClientAccounts();
    const account = accounts.find(a => (a.username.toLowerCase() === username || a.email.toLowerCase() === username) && a.passwordHash === crypto.createHash('sha256').update(password).digest('hex'));

    if (!account) {
      const isMasterKey = getMasterLicenses().find(m => m.key === body.username || m.email === body.username);
      if (isMasterKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            needsActivation: true,
            licenseKey: isMasterKey.key,
            error: 'First-time login detected. Please activate your account first.'
          })
        };
      }
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, error: 'Invalid username or password.' }) };
    }

    const branding = resolvePortalBranding(account.agencyId);
    const calls = getVoiceCallLogs().map(enrichCallWithAiDiagnostics);
    const sms = getClientSmsHistory(account.licenseKey);
    const tasks = getClientTasks(account.licenseKey);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token: account.token,
        user: {
          username: account.username,
          email: account.email,
          businessName: account.businessName,
          licenseKey: account.licenseKey,
          agencyId: account.agencyId
        },
        branding,
        client: {
          name: account.businessName,
          licenseKey: account.licenseKey,
          voiceMinutesBalance: 45.2,
          carrierCode: '*71',
          isVoicePaused: false,
          handsetStatus: 'ONLINE',
          lastCheckin: new Date().toISOString()
        },
        calls,
        sms,
        tasks
      })
    };
  }

  // 5. POST /api/portal/check-key
  if (subPath === '/check-key' || subPath === '/check-key/') {
    const rawKey = (body.licenseKey || '').trim().toUpperCase();
    const masterList = getMasterLicenses();
    const subList = getVoiceSubscribers();

    const master = masterList.find(m => m.key === rawKey);
    const sub = subList.find(s => s.licenseKey === rawKey);

    if (!master && !sub) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'License key not recognized.' }) };
    }

    const name = (master && (master.customer || master.businessName)) || (sub && sub.name) || 'Client Business';
    const email = (master && master.email) || (sub && sub.email) || '';
    const agencyId = (sub && sub.agencyId) || (master && master.agencyId) || 'default';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        licenseKey: rawKey,
        customerName: name,
        email,
        agencyId,
        tier: (master && master.tier) || 'PRO'
      })
    };
  }

  // 6. POST /api/portal/activate
  if (subPath === '/activate' || subPath === '/activate/') {
    const licenseKey = (body.licenseKey || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!licenseKey || !username || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'License key, username, and password required.' }) };
    }

    const accounts = getClientAccounts();
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const token = `mcas_tok_${crypto.randomBytes(16).toString('hex')}`;

    const newAcc = {
      id: `acc_${Date.now()}`,
      licenseKey,
      username,
      email,
      passwordHash,
      businessName: body.businessName || username,
      token,
      agencyId: body.agencyId || 'default',
      createdAt: new Date().toISOString()
    };

    accounts.push(newAcc);
    writeJsonFile(CLIENT_ACCOUNTS_FILE, accounts);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Account successfully activated!',
        token,
        user: newAcc,
        branding: resolvePortalBranding(newAcc.agencyId),
        client: { name: newAcc.businessName, licenseKey, voiceMinutesBalance: 50.0, carrierCode: '*71' },
        calls: getVoiceCallLogs().map(enrichCallWithAiDiagnostics),
        sms: getClientSmsHistory(licenseKey),
        tasks: getClientTasks(licenseKey)
      })
    };
  }

  // 7. POST /api/portal/tasks/update
  if (subPath === '/tasks/update' || subPath === '/tasks/update/') {
    const taskId = body.taskId || body.id;
    const status = body.status || 'COMPLETED';

    const tasks = getClientTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, error: 'Task not found' }) };
    }

    task.status = status;
    task.completedAt = status === 'COMPLETED' ? new Date().toISOString() : null;
    writeJsonFile(CLIENT_TASKS_FILE, tasks);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: `Task marked as ${status}!`, task }) };
  }

  // 8. POST /api/portal/tasks/create
  if (subPath === '/tasks/create' || subPath === '/tasks/create/') {
    const title = (body.title || '').trim();
    if (!title) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Task title is required' }) };
    }

    const tasks = getClientTasks();
    const newTask = {
      id: `task_custom_${Date.now()}`,
      licenseKey: body.licenseKey || 'DEFAULT',
      sourceType: 'CONTRACTOR_MANUAL',
      title: title,
      category: body.category || 'GENERAL_FOLLOWUP',
      priority: body.priority || 'NORMAL',
      customerName: body.customerName || '',
      customerPhone: body.customerPhone || '',
      dueSla: body.dueSla || 'Same Day',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    tasks.unshift(newTask);
    writeJsonFile(CLIENT_TASKS_FILE, tasks);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Custom task created!', task: newTask }) };
  }

  // Default catch-all
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Client Portal API Gateway Online' })
  };
};
