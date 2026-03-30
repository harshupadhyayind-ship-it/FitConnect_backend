/**
 * SMS Service — Fast2SMS (India, ~₹0.15/SMS)
 * Uses the dedicated OTP API endpoint for reliable delivery.
 *
 * Setup:
 *   1. Sign up at https://www.fast2sms.com
 *   2. Dev API → copy your API Key
 *   3. Add to .env:  FAST2SMS_API_KEY=your_api_key
 */

const https = require('https');

async function sendOtp(phone, otp) {
  // Strip country code — Fast2SMS accepts 10-digit Indian numbers only
  // +919876543210 → 9876543210
  const mobile = phone.replace(/^\+91/, '').replace(/\D/g, '');

  if (!process.env.FAST2SMS_API_KEY) {
    // Development fallback — log OTP to server console
    console.warn(`\n⚠️  [SMS DEV MODE] FAST2SMS_API_KEY not set`);
    console.warn(`📱 OTP for ${phone} → [ ${otp} ]\n`);
    return;
  }

  // Fast2SMS DEV route — works without website verification
  // Message format: plain text with OTP embedded
  const message = encodeURIComponent(`Your FitConnect OTP is ${otp}. Valid for 10 minutes. Do not share with anyone.`);
  const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&route=v3&message=${message}&flash=0&numbers=${mobile}`;

  await _get(url);
}

function _get(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'GET',
      headers:  { 'cache-control': 'no-cache' },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.return === true) {
            resolve(parsed);
          } else {
            // Log error but don't crash the app — user will see "OTP sent"
            // and can retry. Avoids leaking SMS provider errors to client.
            console.error('[SMS] Fast2SMS error:', parsed.message || data);
            reject(new Error(parsed.message || 'SMS sending failed'));
          }
        } catch {
          console.error('[SMS] Fast2SMS parse error:', data);
          reject(new Error('SMS service error'));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { sendOtp };
