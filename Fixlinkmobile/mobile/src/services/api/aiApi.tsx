// AI endpoints: category detection, assistant chat, recommendations.
import api from './client';

export const fetchTechnicianRecommendations = async (jobId: string): Promise<unknown> =>
  (await api.get('/ai/recommend', { params: { jobId } })).data;
export const askAssistant = async (message: string, context?: unknown): Promise<{ reply?: string; error?: string }> =>
  (await api.post('/ai/assistant', { message, context })).data;
