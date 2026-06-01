import { NextRequest } from 'next/server';
import {
  handleListAIExperiences,
  handleCreateAIExperience,
} from '@/features/ai-experience/ai-experience.api.handlers';

export async function GET(request: NextRequest) {
  return handleListAIExperiences(request);
}

export async function POST(request: NextRequest) {
  return handleCreateAIExperience(request);
}
