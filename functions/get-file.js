export async function onRequest(context) {
    try {
        const worker = context.env.diacriticefix_ghamtech_workers_dev;
        const response = await worker.fetch(context.request);
        return response;
    } catch (error) {
        console.error('Get file error:', error);
        return new Response(JSON.stringify({
            error: 'File retrieval failed'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}