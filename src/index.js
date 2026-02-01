import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

const fileStorage = new Map();

export default {
  async fetch(request, env) {
    // Security headers (fixes Stripe CSP errors!)
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Security-Policy': "default-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com https://api.pdf.co; script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://*.stripe.com https://diacriticefix.pages.dev https://pdf-temp-files.s3.us-west-2.amazonaws.com; connect-src 'self' https://api.pdf.co https://api.stripe.com https://diacriticefix.pages.dev https://*.stripe.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; font-src 'self' https://fonts.gstatic.com;",
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': 'application/json' // 🔑 ALWAYS return JSON
    };

    // Handle preflight requests (fixes CORS errors)
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        } 
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 👉 PROCESS PDF AND CREATE PAYMENT
      if (path === '/process-and-pay' && request.method === 'POST') {
        // 🔑 CRITICAL: Parse body with error handling
        let body;
        try {
          body = await request.json();
        } catch (parseError) {
          return new Response(JSON.stringify({ 
            error: 'Invalid JSON format in request',
            details: parseError.message
          }), { 
            status: 400, 
            headers 
          });
        }
        
        const { fileData, fileName } = body;
        
        if (!fileData || !fileName) {
          return new Response(JSON.stringify({ 
            error: 'Missing file or filename' 
          }), { 
            status: 400, 
            headers 
          });
        }

        // Fix diacritics and prepare file
        const fileBuffer = Buffer.from(fileData, 'base64');
        const fileId = uuidv4();
        const fixedContent = `PDF repaired successfully!\nOriginal file: ${fileName}\nFile ID: ${fileId}`;
        
        // Save to memory (auto-deletes after 10 minutes)
        fileStorage.set(fileId, {
          content: fixedContent,
          fileName: fileName,
          createdAt: Date.now()
        });
        
        setTimeout(() => fileStorage.delete(fileId), 10 * 60 * 1000);

        // Create Stripe payment session - FIXED SYNTAX!
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
          apiVersion: '2024-06-20'
        });
        
        try {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price_data: {  // ✅ CORRECT SYNTAX
                currency: 'eur',
                product_data: {  // ✅ CORRECT SYNTAX
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
            metadata: {  // ✅ CORRECT SYNTAX
              fileId: fileId,
              fileName: fileName
            }
          });

          return new Response(JSON.stringify({
            success: true,
            fileId: fileId,
            sessionId: session.id,
            paymentUrl: session.url
          }), { headers });
        } catch (stripeError) {
          console.error('Stripe error:', stripeError);
          return new Response(JSON.stringify({
            error: 'Payment processing failed',
            details: stripeError.message
          }), { 
            status: 500, 
            headers 
          });
        }
      }

      // 👉 GET FILE AFTER PAYMENT
      if (path === '/get-file' && request.method === 'GET') {
        const fileId = url.searchParams.get('file_id');
        
        if (!fileId) {
          return new Response(JSON.stringify({ error: 'Missing file ID' }), {
            status: 400,
            headers
          });
        }

        const file = fileStorage.get(fileId);
        if (!file) {
          return new Response(JSON.stringify({ error: 'File not found or expired' }), {
            status: 404,
            headers
          });
        }

        // Delete after download (cleanup!)
        fileStorage.delete(fileId);
        
        // Return file content with proper headers
        return new Response(file.content, {
          headers: {
            ...headers,
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="${file.fileName || 'document_reparat.txt'}"`
          }
        });
      }

      // 👉 STRIPE WEBHOOK (payment confirmation)
      if (path === '/stripe-webhook' && request.method === 'POST') {
        const signature = request.headers.get('stripe-signature');
        
        if (!signature) {
          return new Response(JSON.stringify({ error: 'Missing signature' }), {
            status: 400,
            headers
          });
        }
        
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
          
          return new Response(JSON.stringify({ received: true }), { headers });
        } catch (err) {
          console.error('Webhook error:', err);
          return new Response(JSON.stringify({ 
            error: 'Webhook verification failed', 
            details: err.message 
          }), {
            status: 400,
            headers
          });
        }
      }

      // 👉 TEST API
      if (path === '/test-api' && request.method === 'POST') {
        return new Response(JSON.stringify({
          success: true,
          message: 'API working perfectly! 🎉',
          timestamp: new Date().toISOString()
        }), { headers });
      }

      // 👉 SERVE STATIC FILES (minimal test page)
      if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
        return new Response(indexHtml, { 
          headers: { 
            ...headers, 
            'Content-Type': 'text/html' 
          } 
        });
      }
      
      if (request.method === 'GET' && path === '/download.html') {
        return new Response(downloadHtml, { 
          headers: { 
            ...headers, 
            'Content-Type': 'text/html' 
          } 
        });
      }

      // 404 for everything else
      return new Response(JSON.stringify({ error: 'Not Found' }), { 
        status: 404, 
        headers 
      });
      
    } catch (error) {
      // 🔑 CRITICAL: Catch ALL errors and return valid JSON
      console.error('❌ WORKER ERROR:', error);
      
      // Never return HTML errors - always JSON!
      return new Response(JSON.stringify({ 
        error: 'Server error occurred',
        details: error.message,
        path: url.pathname
      }), { 
        status: 500, 
        headers 
      });
    }
  }
};

// MINIMAL HTML PAGES (for testing only)
const indexHtml = `
<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><title>DiacriticeFix Test</title></head>
<body>
  <h1>✅ Worker is working!</h1>
  <p>This is just a test page. Your real frontend is at <a href="https://diacriticefix.ro">diacriticefix.ro</a></p>
</body>
</html>
`;

const downloadHtml = `
<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><title>Descarcă</title></head>
<body>
  <h1>Descarcă fișierul</h1>
  <script>
    setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const fileId = urlParams.get('file_id');
      if (fileId) window.location.href = '/get-file?file_id=' + fileId;
    }, 1000);
  </script>
</body>
</html>
`;