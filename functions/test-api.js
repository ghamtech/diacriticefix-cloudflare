export async function onRequest(context) {
    try {
        const worker = context.env.diacriticefix_ghamtech_workers_dev;
        const response = await worker.fetch(context.request);
        return response;
    } catch (error) {
        console.error('Test API error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: 'API test failed'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}