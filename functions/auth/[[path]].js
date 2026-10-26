import { handleRequest } from '../../server/app.js';

export const onRequest = ({ request, env }) => handleRequest(request, env);
