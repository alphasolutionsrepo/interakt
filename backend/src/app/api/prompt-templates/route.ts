import { NextRequest } from 'next/server';
import {
  handleListTemplates,
  handleCreateVersion,
} from '@/features/prompt-templates/prompt-template.api.handlers';

export async function GET(request: NextRequest) {
  return handleListTemplates(request);
}

export async function POST(request: NextRequest) {
  return handleCreateVersion(request);
}
