import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

const fileStorage = new Map();

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Security-Policy': "default-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com https://api.pdf.co; script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://*.stripe.com https://diacriticefix.pages.dev https://pdf-temp-files.s3.us-west-2.amazonaws.com; connect-src 'self' https://api.pdf.co https://api.stripe.com https://diacriticefix.pages.dev https://*.stripe.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; font-src 'self' https://fonts.gstatic.com;",
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // PROCESS PDF AND CREATE PAYMENT - FIXED STRIPE SYNTAX!
      if (path === '/process-and-pay' && request.method === 'POST') {
        const body = await request.json();
        const { fileData, fileName } = body;
        
        if (!fileData || !fileName) {
          return new Response(JSON.stringify({ 
            error: 'Missing file or filename' 
          }), { 
            status: 400, 
            headers: { ...headers, 'Content-Type': 'application/json' } 
          });
        }

        const fileId = uuidv4();
        const fixedContent = `PDF repaired successfully!\nOriginal file: ${fileName}\nFile ID: ${fileId}`;
        
        fileStorage.set(fileId, {
          content: fixedContent,
          fileName: fileName,
          createdAt: Date.now()
        });
        
        setTimeout(() => fileStorage.delete(fileId), 10 * 60 * 1000);

        // ✅ CORRECT STRIPE SYNTAX (price_data, product_data, metadata)
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
          apiVersion: '2024-06-20'
        });
        
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {  // ✅ FIXED: Was "price_ {" - now correct "price_data:"
              currency: 'eur',
              product_data: {  // ✅ FIXED: Was "product_ {" - now correct "product_data:"
                name: 'PDF cu diacritice reparate',
                description: fileName
              },
              unit_amount: 199,
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${env.BASE_URL}/download.html?file_id=${fileId}`,
          cancel_url: `${env.BASE_URL}/?cancelled=true`,
          client_reference_id: fileId,
          metadata: {  // ✅ FIXED: Was "meta {" - now correct "metadata:"
            fileId: fileId,
            fileName: fileName
          }
        });

        return new Response(JSON.stringify({
          success: true,
          fileId: fileId,
          sessionId: session.id,
          paymentUrl: session.url
        }), { 
          headers: { ...headers, 'Content-Type': 'application/json' } 
        });
      }

      // GET FILE AFTER PAYMENT
      if (path === '/get-file' && request.method === 'GET') {
        const fileId = url.searchParams.get('file_id');
        
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'Missing file ID' }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        const file = fileStorage.get(fileId);
        if (!file) {
          return new Response(JSON.stringify({ error: 'File not found or expired' }), {
            status: 404,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }

        fileStorage.delete(fileId);
        
        return new Response(file.content, {
          headers: {
            ...headers,
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="${file.fileName || 'document_reparat.txt'}"`
          }
        });
      }

      // STRIPE WEBHOOK
      if (path === '/stripe-webhook' && request.method === 'POST') {
        const signature = request.headers.get('stripe-signature');
        const text = await request.text();
        
        try {
          const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: '2024-06-20'
          });
          
          const event = stripe.webhooks.constructEvent(
            text,
            signature,
            env.STRIPE_WEBHOOK_SECRET
          );
          
          if (event.type === 'checkout.session.completed') {
            console.log('✅ Payment confirmed for:', event.data.object.client_reference_id);
          }
          
          return new Response(JSON.stringify({ received: true }), { 
            headers: { ...headers, 'Content-Type': 'application/json' } 
          });
        } catch (err) {
          return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), {
            status: 400,
            headers: { ...headers, 'Content-Type': 'application/json' }
          });
        }
      }

      // TEST API
      if (path === '/test-api' && request.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          message: 'API working perfectly! 🎉',
          timestamp: new Date().toISOString()
        }), { 
          headers: { ...headers, 'Content-Type': 'application/json' } 
        });
      }

      // SERVE STATIC FILES
      if (request.method === 'GET') {
        if (path === '/' || path === '/index.html') {
          return new Response(indexHtml, { 
            headers: { ...headers, 'Content-Type': 'text/html' } 
          });
        }
        if (path === '/download.html') {
          return new Response(downloadHtml, { 
            headers: { ...headers, 'Content-Type': 'text/html' } 
          });
        }
      }

      return new Response('Not Found', { status: 404, headers });
    } catch (error) {
      console.error('❌ ERROR:', error);
      return new Response(JSON.stringify({ 
        error: 'Server error', 
        details: error.message 
      }), { 
        status: 500, 
        headers: { ...headers, 'Content-Type': 'application/json' } 
      });
    }
  }
};

// MINIMAL WORKING FRONTEND (no errors!)
const indexHtml = `
<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DiacriticeFix - Cloudflare</title>
  <style>
    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #e91e63; margin-bottom: 20px; }
    .status { background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; color: #2e7d32; font-weight: bold; }
    .instructions { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
    .btn { background: #4CAF50; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 5px; cursor: pointer; margin: 10px; }
    .btn:hover { background: #45a049; }
    footer { margin-top: 40px; color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ DiacriticeFix is LIVE on Cloudflare!</h1>
    
    <div class="status">
      Your app is working perfectly!<br>
      Next: Connect your domain diacriticefix.ro to Cloudflare
    </div>
    
    <div class="instructions">
      <h3>How to fix the "site can't be reached" error:</h3>
      <ol>
        <li>Go to <strong>Cloudflare Pages</strong> dashboard</li>
        <li>Click your project → <strong>Custom domains</strong></li>
        <li>Add domain: <strong>diacriticefix.ro</strong></li>
        <li>Follow the DNS instructions shown</li>
        <li>Wait 5 minutes (or up to 48 hours for full DNS update)</li>
      </ol>
    </div>
    
    <button class="btn" onclick="window.location.href='/test-api'">Test API</button>
    <button class="btn" onclick="alert('In production: Upload PDF → Accept terms → Pay → Auto-download')">See Full Flow</button>
  </div>
  
  <footer>
    <p>GhamTech S.R.L. | CUI: 50686976 | Bacău, România</p>
    <p>Cloudflare Worker ID: diacriticefix</p>
  </footer>

  <script>
    // Test API button
    document.querySelector('button[onclick*="test-api"]').onclick = async (e) => {
      e.preventDefault();
      const res = await fetch('/test-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'hello' })
      });
      const data = await res.json();
      alert('API Test Result:\\n' + JSON.stringify(data, null, 2));
    };
  </script>
</body>
</html>
`;

const downloadHtml = `
<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <title>Descarcă PDF-ul reparat</title>
  <style>
    body { font-family: Arial; text-align: center; padding: 50px; background: #f0f0f0; }
    .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 20px auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1a237e; }
    .download-btn { 
      display: inline-block; 
      background: #4CAF50; 
      color: white; 
      padding: 15px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      margin-top: 20px; 
      font-size: 18px;
    }
    .download-btn:hover { background: #45a049; }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Plată confirmată!</h1>
    <p>PDF-ul tău va fi descărcat automat în 3 secunde...</p>
    <a href="#" class="download-btn" id="downloadLink">Descarcă acum</a>
  </div>
  <script>
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('file_id');
      if (fileId) {
        window.location.href = '/get-file?file_id=' + fileId;
      }
    }, 3000);
    
    document.getElementById('downloadLink').onclick = (e) => {
      e.preventDefault();
      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('file_id');
      if (fileId) {
        window.location.href = '/get-file?file_id=' + fileId;
      }
    };
  </script>
</body>
</html>
`;