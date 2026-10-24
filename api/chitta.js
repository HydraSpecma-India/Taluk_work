// Vercel Serverless Function: /api/chitta
// Fetches Districts, Taluks, Villages, and Chitta Extract PDF from Tamil Nilam portal (Tahsildar login)
const crypto = require('crypto');
const https = require('https');

const DEFAULT_U = 'rpt_panneerselvam';
const DEFAULT_P = 'Nemili@1970';
const DEFAULT_R = '8';

const FALLBACK_U = 'dlurpet';
const FALLBACK_P = '16-03-1992';
const FALLBACK_R = '7';

function callTnPortal(servicePath, inputObj, userId = DEFAULT_U, password = DEFAULT_P, roleId = DEFAULT_R, method = 'GET', extraHeaders = {}, customBody = null, timeoutMs = 35000) {
  return new Promise((resolve, reject) => {
    const s1 = crypto.createHash('sha1').update(password).digest('hex');
    const t = Date.now().toString();
    const inputVal = inputObj ? (typeof inputObj === 'string' ? inputObj : JSON.stringify(inputObj)) : '';
    const finalVal = inputVal.length > 0 ? (userId + t + inputVal) : (userId + t);
    const hash = crypto.createHmac('sha256', s1).update(finalVal).digest('hex');

    let fullPath = `/Tnilam_Service_N/${servicePath}`;
    fullPath += fullPath.includes('?') ? `&jsoncallback=cb` : `?jsoncallback=cb`;

    const bodyToSend = customBody !== null ? customBody : inputVal;

    const options = {
      hostname: 'tamilnilam.tn.gov.in',
      port: 443,
      path: fullPath,
      method: method,
      headers: {
        'emp_value': userId,
        'signature': hash,
        'timestamp': t,
        'roleId': String(roleId),
        'Referer': 'https://tamilnilam.tn.gov.in/Revenue/Chitta_Extract_Common.html',
        'Origin': 'https://tamilnilam.tn.gov.in',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        ...extraHeaders
      },
      rejectUnauthorized: false
    };

    if (inputVal && (method === 'GET' || method === 'POST')) {
      options.headers['inputVal'] = inputVal;
    }

    if (bodyToSend && method === 'POST') {
      options.headers['Content-Length'] = Buffer.byteLength(bodyToSend);
    }

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const jsonStr = body.replace(/^cb\(/, '').replace(/\);?$/, '');
          const data = JSON.parse(jsonStr);
          resolve(data);
        } catch (err) {
          resolve({ error: `Failed to parse response: ${body.substring(0, 300)}`, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Tamil Nilam request timed out after ${timeoutMs}ms.`));
    });

    if (bodyToSend && method === 'POST') {
      req.write(bodyToSend);
    }
    req.end();
  });
}

// Multi-login retry runner: tries requested credentials first, then Nemili Tahsildar, then District user
async function callTnPortalWithRetry(servicePath, inputObj, primaryCreds, method = 'GET', extraHeaders = {}, customBody = null, timeoutMs = 30000) {
  const candidates = [
    { username: primaryCreds.username || DEFAULT_U, password: primaryCreds.password || DEFAULT_P, roleId: primaryCreds.roleId || DEFAULT_R },
    { username: DEFAULT_U, password: DEFAULT_P, roleId: DEFAULT_R },
    { username: FALLBACK_U, password: FALLBACK_P, roleId: FALLBACK_R }
  ];

  const seen = new Set();
  let lastResult = null;

  for (const cred of candidates) {
    const key = `${cred.username}:${cred.password}:${cred.roleId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const res = await callTnPortal(servicePath, inputObj, cred.username, cred.password, cred.roleId, method, extraHeaders, customBody, timeoutMs);
      if (res && !res.error && res !== '10' && res.status !== 2 && res.Status !== 2 && res.Status !== '2') {
        if (Array.isArray(res) && res.length > 0) return res;
        if (typeof res === 'object' && (res.districts || res.taluks || res.villages || res.villageArray || res.base64Output || res.existingOwner_landdetails)) {
          return res;
        }
      }
      lastResult = res;
    } catch(err) {
      lastResult = { error: err.message };
    }
  }
  return lastResult;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const params = req.method === 'POST' ? req.body || {} : req.query || {};
    const mode = (params.mode || 'districts').toLowerCase();
    const username = params.username || DEFAULT_U;
    const password = params.password || DEFAULT_P;
    const roleId = params.roleId || DEFAULT_R;
    const creds = { username, password, roleId };

    if (mode === 'districts') {
      const data = await callTnPortalWithRetry('Master/getAllDistrict', null, creds, 'GET');
      if (Array.isArray(data)) {
        const districts = data
          .filter(d => d.dId && d.dName)
          .map(d => ({ id: d.dId, name: d.dName }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return res.status(200).json({ success: true, districts });
      }
      return res.status(200).json({ success: false, error: 'Could not load districts', raw: data });
    }

    if (mode === 'taluks') {
      const distCode = params.distCode || '37';
      const inputObj = { DistrictCode: String(distCode), dist_code: String(distCode) };
      const data = await callTnPortalWithRetry('Master/getTaluk', inputObj, creds, 'GET');
      if (Array.isArray(data)) {
        const taluks = data
          .filter(t => t.tId && t.tName)
          .map(t => ({ id: t.tId, name: t.tName }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return res.status(200).json({ success: true, distCode, taluks });
      }
      return res.status(200).json({ success: false, error: 'Could not load taluks', raw: data });
    }

    if (mode === 'villages') {
      const distCode = params.distCode || '37';
      const talukCode = params.talukCode || '12';
      const inputObj = { DistrictCode: String(distCode), talukCode: String(talukCode) };
      const data = await callTnPortalWithRetry('Master/getVillage', inputObj, creds, 'GET');
      if (data && data.villageArray) {
        try {
          const arr = typeof data.villageArray === 'string' ? JSON.parse(data.villageArray) : data.villageArray;
          const villages = arr
            .filter(v => v.vId && v.vName)
            .map(v => ({ id: v.vId, name: v.vName }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return res.status(200).json({ success: true, distCode, talukCode, villages });
        } catch (e) {
          return res.status(200).json({ success: false, error: 'Failed to parse village array: ' + e.message });
        }
      }
      return res.status(200).json({ success: false, error: 'Could not load villages', raw: data });
    }

    if (mode === 'extract_data' || mode === 'data') {
      const distCode = String(params.distCode || '37').padStart(2, '0');
      const talukCode = String(params.talukCode || '12').padStart(2, '0');
      const villageCode = String(params.villageCode || '045').padStart(3, '0');
      const pattaNo = String(params.pattaNo || '').trim();
      const transType = (params.transType || 'R').toUpperCase();

      if (!pattaNo) {
        return res.status(400).json({ success: false, error: 'Missing patta number (pattaNo)' });
      }

      const inputObj = {
        districtCode: distCode,
        talukCode: talukCode,
        villageCode: villageCode,
        pattaNo: pattaNo,
        txnType: transType,
        transType: transType
      };

      const data = await callTnPortalWithRetry('Master/getChittaExtractData', inputObj, creds, 'GET');
      if (data && (data.existingOwner_landdetails || data.status === 1)) {
        return res.status(200).json({ success: true, data, distCode, talukCode, villageCode, pattaNo, transType });
      }
      return res.status(200).json({ success: false, error: data?.error || 'Failed to fetch extract data from Tamil Nilam portal', raw: data });
    }

    if (mode === 'download' || mode === 'pdf') {
      const distCode = String(params.distCode || '37').padStart(2, '0');
      const talukCode = String(params.talukCode || '12').padStart(2, '0');
      const villageCode = String(params.villageCode || '045').padStart(3, '0');
      const pattaNo = String(params.pattaNo || '').trim();
      const transType = (params.transType || 'N').toUpperCase(); // 'N' for Natham, 'R' for Rural

      if (!pattaNo) {
        return res.status(400).json({ success: false, error: 'Missing patta number (pattaNo)' });
      }

      const inputObj = {
        districtCode: distCode,
        talukCode: talukCode,
        villageCode: villageCode,
        pattaNo: pattaNo,
        txnType: transType,
        outputType: 'pdf',
        transType: transType
      };

      let data = null;

      // 1. For Natham: Try OrderCopyService/loadChittaExtractNatham (matches the official Natham Patta layout with QR code, table and eservices verification)
      if (transType === 'N') {
        const inputValStr = JSON.stringify(inputObj);
        data = await callTnPortalWithRetry(
          'OrderCopyService/loadChittaExtractNatham',
          inputObj,
          creds,
          'POST',
          { 'flag_chk': 'N' },
          encodeURIComponent(inputValStr),
          25000
        );
      }

      // 2. If Natham returned empty/error, or if transType is Rural: fallback to Master/getChittaExtractData_pdf
      if (!data || !data.base64Output || data.Status === 2 || data.Status === '2') {
        data = await callTnPortalWithRetry('Master/getChittaExtractData_pdf', inputObj, creds, 'GET', {}, null, 25000);
      }

      if (data && data.base64Output) {
        const filename = `Chitta_${transType === 'N' ? 'Natham' : 'Rural'}_D${distCode}_T${talukCode}_V${villageCode}_Patta${pattaNo}.pdf`;
        
        // If client requested direct binary stream
        if (params.binary === 'true' || params.download === '1') {
          const pdfBuf = Buffer.from(data.base64Output, 'base64');
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('Content-Length', pdfBuf.length);
          return res.status(200).send(pdfBuf);
        }

        return res.status(200).json({
          success: true,
          filename,
          base64: data.base64Output,
          statusDesc: data.Status_Desc || 'Success',
          status: data.Status
        });
      }

      const errMsg = data?.IssuePatta || data?.Status_Desc || data?.error || 'Failed to fetch Chitta PDF from Tamil Nilam portal';
      return res.status(200).json({ success: false, error: errMsg, raw: data });
    }

    res.status(400).json({ success: false, error: `Invalid mode: ${mode}` });

  } catch (error) {
    console.error('API /api/chitta error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
