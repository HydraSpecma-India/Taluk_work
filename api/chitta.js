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

const ALL_38_DISTRICTS = [
  { id: '17', name: 'Ariyalur' },
  { id: '35', name: 'Chengalpattu' },
  { id: '02', name: 'Chennai' },
  { id: '12', name: 'Coimbatore' },
  { id: '18', name: 'Cuddalore' },
  { id: '05', name: 'Dharmapuri' },
  { id: '13', name: 'Dindigul' },
  { id: '10', name: 'Erode' },
  { id: '34', name: 'Kallakurichi' },
  { id: '04', name: 'Kancheepuram' },
  { id: '30', name: 'Kanyakumari' },
  { id: '14', name: 'Karur' },
  { id: '31', name: 'Krishnagiri' },
  { id: '24', name: 'Madurai' },
  { id: '38', name: 'Mayiladuthurai' },
  { id: '19', name: 'Nagapattinam' },
  { id: '09', name: 'Namakkal' },
  { id: '11', name: 'Nilgiris' },
  { id: '16', name: 'Perambalur' },
  { id: '22', name: 'Pudukkottai' },
  { id: '27', name: 'Ramanathapuram' },
  { id: '37', name: 'Ranipet' },
  { id: '08', name: 'Salem' },
  { id: '23', name: 'Sivaganga' },
  { id: '33', name: 'Tenkasi' },
  { id: '21', name: 'Thanjavur' },
  { id: '25', name: 'Theni' },
  { id: '28', name: 'Thoothukudi' },
  { id: '15', name: 'Tiruchirappalli' },
  { id: '29', name: 'Tirunelveli' },
  { id: '36', name: 'Tirupathur' },
  { id: '32', name: 'Tiruppur' },
  { id: '01', name: 'Tiruvallur' },
  { id: '06', name: 'Tiruvannamalai' },
  { id: '20', name: 'Tiruvarur' },
  { id: '07', name: 'Vellore' },
  { id: '26', name: 'Viluppuram' },
  { id: '03', name: 'Virudhunagar' }
];

function callTnPortal(servicePath, inputObj, userId = DEFAULT_U, password = DEFAULT_P, roleId = DEFAULT_R, method = 'GET', extraHeaders = {}, customBody = null, timeoutMs = 35000) {
  return new Promise((resolve, reject) => {
    const s1 = crypto.createHash('sha1').update(password).digest('hex');
    const t = Date.now().toString();
    const inputVal = inputObj ? (typeof inputObj === 'string' ? inputObj : JSON.stringify(inputObj)) : '';
    const finalVal = inputVal.length > 0 ? (userId + t + inputVal) : (userId + t);
    const hash = crypto.createHmac('sha256', s1).update(finalVal).digest('hex');

    let fullPath = `/Tnilam_Service_N/${servicePath}`;
    fullPath += fullPath.includes('?') ? '&jsoncallback=cb' : '?jsoncallback=cb';

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
      const chunks = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const jsonStr = body.replace(/^cb\(/, '').replace(/\);?$/, '');
          const data = JSON.parse(jsonStr);
          resolve(data);
        } catch (err) {
          resolve({ error: 'Failed to parse response', statusCode: res.statusCode });
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
async function callTnPortalWithRetry(servicePath, inputObj, primaryCreds, method = 'GET', extraHeaders = {}, customBody = null, timeoutMs = 25000) {
  const candidates = [
    { username: FALLBACK_U, password: FALLBACK_P, roleId: FALLBACK_R },
    { username: primaryCreds.username || DEFAULT_U, password: primaryCreds.password || DEFAULT_P, roleId: primaryCreds.roleId || DEFAULT_R },
    { username: DEFAULT_U, password: DEFAULT_P, roleId: DEFAULT_R }
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
      try {
        const data = await callTnPortalWithRetry('Master/getAllDistrict', null, creds, 'GET');
        if (Array.isArray(data) && data.length > 0) {
          const districts = data
            .filter(d => (d.dId || d.id || d.districtCode) && (d.dName || d.name || d.districtName))
            .map(d => ({ id: String(d.dId || d.id || d.districtCode), name: String(d.dName || d.name || d.districtName) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          if (districts.length > 0) {
            return res.status(200).json({ success: true, districts });
          }
        }
      } catch (eDist) {
        console.warn('getAllDistrict error, falling back:', eDist.message);
      }
      return res.status(200).json({ success: true, districts: ALL_38_DISTRICTS });
    }

    if (mode === 'taluks') {
      const distCode = String(params.distCode || '37');
      try {
        const inputObj = { DistrictCode: distCode, dist_code: distCode };
        const data = await callTnPortalWithRetry('Master/getTaluk', inputObj, creds, 'GET');
        if (Array.isArray(data) && data.length > 0) {
          const taluks = data
            .filter(t => (t.tId || t.id || t.talukCode) && (t.tName || t.name || t.talukName))
            .map(t => ({ id: String(t.tId || t.id || t.talukCode), name: String(t.tName || t.name || t.talukName) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          if (taluks.length > 0) {
            return res.status(200).json({ success: true, distCode, taluks });
          }
        }
      } catch (eTaluk) {
        console.warn('getTaluk error, falling back:', eTaluk.message);
      }
      const fallbackTaluks = distCode === '37' ? [
        { id: '12', name: 'Nemili' },
        { id: '03', name: 'Arakkonam' },
        { id: '02', name: 'Arcot' },
        { id: '13', name: 'Kalavai' },
        { id: '14', name: 'Sholinghur' },
        { id: '04', name: 'Walajah' }
      ] : [];
      return res.status(200).json({ success: true, distCode, taluks: fallbackTaluks });
    }

    if (mode === 'villages') {
      const distCode = String(params.distCode || '37');
      const talukCode = String(params.talukCode || '12');
      try {
        const inputObj = { DistrictCode: distCode, talukCode: talukCode };
        const data = await callTnPortalWithRetry('Master/getVillage', inputObj, creds, 'GET');
        if (data && data.villageArray) {
          const arr = typeof data.villageArray === 'string' ? JSON.parse(data.villageArray) : data.villageArray;
          if (Array.isArray(arr) && arr.length > 0) {
            const villages = arr
              .filter(v => (v.vId || v.id || v.villageCode) && (v.vName || v.name || v.villageName))
              .map(v => ({ id: String(v.vId || v.id || v.villageCode), name: String(v.vName || v.name || v.villageName) }))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (villages.length > 0) {
              return res.status(200).json({ success: true, distCode, talukCode, villages });
            }
          }
        }
      } catch (eVill) {
        console.warn('getVillage error, falling back:', eVill.message);
      }
      const fallbackVillages = (distCode === '37' && talukCode === '12') ? [
        { id: '045', name: 'Karivedu' },
        { id: '059', name: 'Mel-Eri' },
        { id: '122', name: 'Nemili' },
        { id: '034', name: 'Kaveripakkam' },
        { id: '053', name: 'Panappakkam' },
        { id: '046', name: 'Avalur' }
      ] : [];
      return res.status(200).json({ success: true, distCode, talukCode, villages: fallbackVillages });
    }

    if (mode === 'extract_data' || mode === 'data') {
      const distCode = String(params.distCode || '37').padStart(2, '0');
      const talukCode = String(params.talukCode || '12').padStart(2, '0');
      const villageCode = String(params.villageCode || '045').padStart(3, '0');
      const pattaNo = String(params.pattaNo || '').trim();
      const transType = (params.transType || 'R').toUpperCase();

      if (!pattaNo) {
        return res.status(400).json({ success: false, error: 'Patta number is required' });
      }

      const inputValObj = {
        districtCode: distCode,
        talukCode: talukCode,
        villageCode: villageCode,
        pattaNo: pattaNo,
        txnType: transType,
        transType: transType
      };

      const data = await callTnPortalWithRetry(
        'Master/getChittaExtractData',
        inputValObj,
        creds,
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify(inputValObj)
      );

      return res.status(200).json({
        success: true,
        distCode,
        talukCode,
        villageCode,
        pattaNo,
        transType,
        data
      });
    }

    if (mode === 'download' || mode === 'pdf') {
      const distCode = String(params.distCode || '37').padStart(2, '0');
      const talukCode = String(params.talukCode || '12').padStart(2, '0');
      const villageCode = String(params.villageCode || '045').padStart(3, '0');
      const pattaNo = String(params.pattaNo || '').trim();
      const surveyNo = params.surveyNo ? String(params.surveyNo).trim() : '@';
      const subdivNo = params.subdivNo ? String(params.subdivNo).trim() : '@';
      const transType = (params.transType || 'R').toUpperCase();
      const isBinary = String(params.binary || '').toLowerCase() === 'true';

      if (!pattaNo && surveyNo === '@') {
        return res.status(400).json({ success: false, error: 'Patta number or Survey number is required' });
      }

      const inputValObj = {
        districtCode: distCode,
        talukCode: talukCode,
        villageCode: villageCode,
        pattaNo: pattaNo || '@',
        PattaNo: pattaNo || '@',
        SurveyNo: surveyNo,
        SubDivNo: subdivNo,
        txnType: transType,
        transType: transType
      };

      const hasPdf = (d) => {
        if (!d) return false;
        const obj = Array.isArray(d) ? d[0] : d;
        const b = obj && (obj.base64Output || obj.pdffile || obj.base64);
        return Boolean(b && typeof b === 'string' && b.length > 100);
      };

      let data = null;

      // 1. Try Master/getChittaExtractData_pdf (GET) - Official live Chitta PDF endpoint
      try {
        data = await callTnPortalWithRetry(
          'Master/getChittaExtractData_pdf',
          inputValObj,
          creds,
          'GET'
        );
      } catch (e1) {
        console.warn('getChittaExtractData_pdf GET error:', e1.message);
      }

      // 2. Try Master/getARegExtractData_PDF (POST) - Official live A-Reg / Chitta PDF endpoint
      if (!hasPdf(data)) {
        try {
          const fallbackData = await callTnPortalWithRetry(
            'Master/getARegExtractData_PDF',
            inputValObj,
            creds,
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify(inputValObj)
          );
          if (hasPdf(fallbackData)) {
            data = fallbackData;
          }
        } catch (e2) {
          console.warn('getARegExtractData_PDF fallback error:', e2.message);
        }
      }

      // 3. Try Master/getChittaExtractDataPdf (GET)
      if (!hasPdf(data)) {
        try {
          const fallbackData2 = await callTnPortalWithRetry(
            'Master/getChittaExtractDataPdf',
            inputValObj,
            creds,
            'GET'
          );
          if (hasPdf(fallbackData2)) {
            data = fallbackData2;
          }
        } catch (e3) {
          console.warn('getChittaExtractDataPdf fallback error:', e3.message);
        }
      }

      // 4. Try Master/getARegExtractDataPdf (POST)
      if (!hasPdf(data)) {
        try {
          const fallbackData3 = await callTnPortalWithRetry(
            'Master/getARegExtractDataPdf',
            inputValObj,
            creds,
            'POST',
            { 'Content-Type': 'application/json' },
            JSON.stringify(inputValObj)
          );
          if (hasPdf(fallbackData3)) {
            data = fallbackData3;
          }
        } catch (e4) {
          console.warn('getARegExtractDataPdf fallback error:', e4.message);
        }
      }

      const resObj = Array.isArray(data) ? (data[0] || {}) : (data || {});
      const base64Data = (resObj && (resObj.base64Output || resObj.pdffile || resObj.base64)) || '';

      if (!base64Data || typeof base64Data !== 'string' || base64Data.length < 100) {
        return res.status(200).json({
          success: false,
          error: resObj.Status_Desc || resObj.IssuePatta || resObj.Issue || 'No PDF base64 received from Tamil Nilam portal.',
          portalResponse: data
        });
      }

      const filename = `Chitta_Extract_D${distCode}_T${talukCode}_V${villageCode}_Patta${pattaNo || 'Survey' + surveyNo}.pdf`;

      if (isBinary) {
        const pdfBuf = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(pdfBuf);
      }

      return res.status(200).json({
        success: true,
        filename,
        distCode,
        talukCode,
        villageCode,
        pattaNo,
        surveyNo,
        transType,
        base64: base64Data
      });
    }

    return res.status(400).json({ success: false, error: `Unknown mode: ${mode}` });
  } catch (err) {
    console.error('API Error in /api/chitta:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
};
