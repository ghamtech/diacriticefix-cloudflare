// This function routes requests from Pages to your Worker via Service Binding
export async function onRequest(context) {
    try {
        // Get the Worker binding from environment
        const worker = context.env.diacriticefix_ghamtech_workers_dev;
        
        // Forward the request to your Worker
        const response = await worker.fetch(context.request);
        
        // Return the Worker's response
        return response;
        
    } catch (error) {
        console.error('Pages function error:', error);
        return new Response(JSON.stringify({
            error: 'Server error',
            message: error.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
}