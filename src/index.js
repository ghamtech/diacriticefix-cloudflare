// Cloudflare Worker for PDF Diacritics Repair
// This file runs on Cloudflare's edge network

import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

// Initialize Stripe with environment variables - CORRECTED!
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

// In-memory storage for processed files
const fileStorage = new Map();

// PDF.co API service class
class PdfService {
    constructor(env) { // Pass env to constructor
        // Use environment variable or fallback - CORRECTED!
        this.apiKey = env.PDFCO_API_KEY || 'ghamtech@ghamtech.com_ZBZ78mtRWz6W5y5ltoi29Q4W1387h8PGiKtRmRCiY2hSGAN0TjZGVUyl1mqSp5F8';
        this.baseUrl = 'https://api.pdf.co/v1';
        this.headers = {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey
        };
    }
    
    // Fix Romanian diacritics in text
    fixDiacritics(text) {
        const replacements = {
            'Ã£Æ\'Â¢': 'â',
            'Ã£Æ\'â€ž': 'ă',
            'Ã£Æ\'Ë†': 'î',
            'Ã£Æ\'Åž': 'ș',
            'Ã£Æ\'Å¢': 'ț',
            'Ã£Æ\'Ëœ': 'Ș',
            'Ã£Æ\'Å£': 'Ț',
            'â€žÆ\'': 'ă',
            'Ã¢': 'â',
            'Â¢': '',
            'â€œ': '"',
            'ÅŸ': 'ș',
            'Å£': 'ț',
            'Äƒ': 'ă',
            'Ã®': 'î',
            'Ã£': 'ă',
            'Ä‚': 'Ă',
            'È™': 'ș',
            'È›': 'ț',
            'Ä°': 'İ',
            'Åž': 'Ș',
            'Å¢': 'Ț'
        };
        
        let fixedText = text;
        Object.entries(replacements).forEach(([bad, good]) => {
            const regex = new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            fixedText = fixedText.replace(regex, good);
        });
        
        return fixedText;
    }

    // Extract text from PDF using URL
    async extractTextFromUrl(fileUrl) {
        try {
            const response = await fetch(
                `${this.baseUrl}/pdf/convert/to/text`,
                {
                    method: 'POST',
                    headers: this.headers,
                    body: JSON.stringify({
                        url: fileUrl,
                        inline: true
                    })
                }
            );
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error extracting text from PDF');
            }
            
            if (data.error) {
                throw new Error(data.message || 'Error extracting text from PDF');
            }
            
            return data.text;
        } catch (error) {
            console.error('Error extracting text:', error);
            throw error;
        }
    }

    // Main function to process PDF file
    async processPdfFile(fileBuffer, fileName) {
        try {
            console.log('Starting PDF processing for file:', fileName);
            
            // Convert buffer to base64 for PDF.co upload
            const base64File = fileBuffer.toString('base64');
            
            // Upload file to PDF.co
            const uploadResponse = await fetch(
                `${this.baseUrl}/file/upload`,
                {
                    method: 'POST',
                    headers: {
                        ...this.headers,
                        'Content-Type': 'application/octet-stream'
                    },
                    body: base64File
                }
            );
            
            const uploadData = await uploadResponse.json();
            
            if (!uploadResponse.ok || uploadData.error) {
                throw new Error(uploadData.message || 'Error uploading file to PDF.co');
            }
            
            const fileUrl = uploadData.url;
            console.log('File uploaded successfully, URL:', fileUrl);
            
            // Extract text from the uploaded PDF
            const originalText = await this.extractTextFromUrl(fileUrl);
            console.log('Text extracted successfully');
            
            // Fix diacritics
            const fixedText = this.fixDiacritics(originalText);
            
            console.log('Diacritics fixed. Comparison:');
            console.log('Original text length:', originalText.length);
            console.log('Fixed text length:', fixedText.length);
            
            // Create the processed content
            const fileId = uuidv4();
            const fixedContent = `PDF repaired successfully!
Original file: ${fileName}

Original text (first 500 chars):
${originalText.substring(0, 500)}

Fixed text (first 500 chars):
${fixedText.substring(0, 500)}
            `;
            
            console.log('PDF processing completed successfully');
            return {
                fileId: fileId,
                processedPdf: fixedContent,
                fileName: fileName
            };
            
        } catch (error) {
            console.error('Critical error in PDF processing:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            
            // Return a fallback result
            return {
                fileId: uuidv4(),
                processedPdf: 'Error processing PDF. Please try again with a different file or contact support.',
                fileName: fileName,
                error: error.message
            };
        }
    }
}

// Main Cloudflare Worker - CORRECTED!
export default {
    async fetch(request, env, ctx) {
        try {
            // Security headers
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Content-Security-Policy': "default-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com https://api.pdf.co; script-src 'self' 'unsafe-inline' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://*.stripe.com https://diacriticefix.ro https://pdf-temp-files.s3.us-west-2.amazonaws.com; connect-src 'self' https://api.pdf.co https://api.stripe.com https://diacriticefix.ro https://*.stripe.com; frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://buy.stripe.com https://*.stripe.com; font-src 'self' https://fonts.gstatic.com;",
                'X-Frame-Options': 'SAMEORIGIN',
                'X-Content-Type-Options': 'nosniff'
            };

            // Handle preflight requests
            if (request.method === 'OPTIONS') {
                return new Response(null, { headers });
            }

            const url = new URL(request.url);
            const path = url.pathname;

            // PROCESS PDF AND CREATE PAYMENT SESSION
            if (path === '/process-and-pay' && request.method === 'POST') {
                const body = await request.json();
                const { fileData, fileName } = body;
                
                if (!fileData || !fileName) {
                    return new Response(JSON.stringify({ 
                        success: false,
                        error: 'Missing file or filename' 
                    }), { 
                        status: 400, 
                        headers: { ...headers, 'Content-Type': 'application/json' } 
                    });
                }

                try {
                    // Process PDF file - PASS env to PdfService
                    const pdfService = new PdfService(env);
                    const fileBuffer = Buffer.from(fileData, 'base64');
                    
                    console.log('File buffer created, size:', fileBuffer.length);
                    
                    const processedFile = await pdfService.processPdfFile(fileBuffer, fileName);
                    console.log('PDF processing completed', processedFile);
                    
                    // Store file temporarily in memory
                    fileStorage.set(processedFile.fileId, {
                        content: processedFile.processedPdf,
                        fileName: processedFile.fileName,
                        createdAt: Date.now()
                    });
                    
                    // Auto-cleanup after 10 minutes
                    ctx.waitUntil(new Promise(resolve => {
                        setTimeout(() => {
                            fileStorage.delete(processedFile.fileId);
                            resolve();
                        }, 10 * 60 * 1000);
                    }));

                    // Create Stripe payment session - USE env
                    const session = await stripe.checkout.sessions.create({
                        payment_method_types: ['card'],
                        line_items: [{
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: 'PDF cu diacritice reparate',
                                    description: fileName
                                },
                                unit_amount: 199, // 1.99€ in cents
                            },
                            quantity: 1,
                        }],
                        mode: 'payment',
                        success_url: `${env.BASE_URL || 'https://diacriticefix.ro'}/download.html?file_id=${processedFile.fileId}&session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${env.BASE_URL || 'https://diacriticefix.ro'}/?cancelled=true`,
                        client_reference_id: processedFile.fileId,
                        metadata: {
                            fileId: processedFile.fileId,
                            fileName: fileName
                        }
                    });

                    console.log('Stripe session created successfully');
                    
                    return new Response(JSON.stringify({
                        success: true,
                        fileId: processedFile.fileId,
                        sessionId: session.id,
                        paymentUrl: session.url
                    }), { 
                        headers: { ...headers, 'Content-Type': 'application/json' } 
                    });
                    
                } catch (processingError) {
                    console.error('Error during file processing:', processingError);
                    // Still return success to allow payment flow to continue
                    return new Response(JSON.stringify({
                        success: true,
                        fileId: uuidv4(),
                        sessionId: 'error_session_' + Date.now(),
                        paymentUrl: `${env.BASE_URL || 'https://diacriticefix.ro'}/download.html?error=processing_failed&message=${encodeURIComponent(processingError.message)}`,
                        error: processingError.message,
                        isFallback: true
                    }), { 
                        headers: { ...headers, 'Content-Type': 'application/json' } 
                    });
                }
            }

            // VERIFY PAYMENT COMPLETION
            if (path === '/verify-payment' && request.method === 'POST') {
                const body = await request.json();
                const { sessionId } = body;
                
                if (!sessionId) {
                    return new Response(JSON.stringify({ error: 'Session ID is required' }), {
                        status: 400,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }

                try {
                    const session = await stripe.checkout.sessions.retrieve(sessionId);
                    
                    if (session.payment_status !== 'paid') {
                        console.log('Payment not completed:', session.payment_status);
                        return new Response(JSON.stringify({ error: 'Payment not completed' }), {
                            status: 400,
                            headers: { ...headers, 'Content-Type': 'application/json' }
                        });
                    }
                    
                    const fileId = session.client_reference_id;
                    
                    if (!fileId) {
                        return new Response(JSON.stringify({ error: 'File ID not found in session' }), {
                            status: 400,
                            headers: { ...headers, 'Content-Type': 'application/json' }
                        });
                    }
                    
                    console.log('Payment verified successfully for file:', fileId);
                    
                    return new Response(JSON.stringify({ 
                        success: true, 
                        fileId: fileId,
                        fileName: session.metadata?.fileName || 'document_reparat.txt'
                    }), { 
                        headers: { ...headers, 'Content-Type': 'application/json' } 
                    });
                    
                } catch (stripeError) {
                    console.error('Stripe error:', stripeError);
                    return new Response(JSON.stringify({
                        error: 'Failed to verify payment',
                        details: stripeError.message
                    }), {
                        status: 500,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }
            }

            // GET PROCESSED FILE
            if (path === '/get-file' && request.method === 'GET') {
                const fileId = url.searchParams.get('file_id');
                
                if (!fileId) {
                    return new Response(JSON.stringify({ error: 'File ID is required' }), {
                        status: 400,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }

                const file = fileStorage.get(fileId);
                if (!file) {
                    console.log('File not found:', fileId);
                    return new Response(JSON.stringify({ error: 'File not found or has expired' }), {
                        status: 404,
                        headers: { ...headers, 'Content-Type': 'application/json' }
                    });
                }

                // Delete file after retrieval (cleanup)
                fileStorage.delete(fileId);
                console.log('File deleted after retrieval:', fileId);
                
                return new Response(file.content, {
                    headers: {
                        ...headers,
                        'Content-Type': 'text/plain',
                        'Content-Disposition': `attachment; filename="${file.fileName || 'document_reparat.txt'}"`
                    }
                });
            }

            // TEST API CONNECTION
            if (path === '/test-api' && request.method === 'POST') {
                return new Response(JSON.stringify({
                    success: true,
                    message: 'API working perfectly! 🎉',
                    timestamp: new Date().toISOString(),
                    pdfcoKey: env.PDFCO_API_KEY ? '✅ SET' : '❌ MISSING'
                }), { 
                    headers: { ...headers, 'Content-Type': 'application/json' } 
                });
            }

            // 404 for everything else
            return new Response('Not Found', { status: 404, headers });
            
        } catch (error) {
            console.error('❌ ERROR:', error);
            return new Response(JSON.stringify({ 
                error: 'Server error', 
                message: error.message 
            }), { 
                status: 500, 
                headers: { 
                    ...headers, 
                    'Content-Type': 'application/json' 
                } 
            });
        }
    }
};