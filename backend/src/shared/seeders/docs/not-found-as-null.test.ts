// src/shared/seeders/docs/not-found-as-null.test.ts

import { describe, expect, it } from 'vitest';

import { notFoundAsNull } from './not-found-as-null';

import { NotFoundError as SearchExperienceNotFound } from '@/features/search-experience/search-experience.service';
import { NotFoundError } from '@/shared/errors/app-error';

describe('notFoundAsNull', () => {
  it("answers null for the not-found error the caller names, and the answer for a found row", async () => {
    expect(await notFoundAsNull(Promise.reject(new SearchExperienceNotFound('Search experience', 'x')), SearchExperienceNotFound)).toBeNull();
    expect(await notFoundAsNull(Promise.resolve({ id: 1 }), SearchExperienceNotFound)).toEqual({ id: 1 });
  });

  it("passes on any other error, including another service's not-found error", async () => {
    await expect(notFoundAsNull(Promise.reject(new Error('connection terminated')), SearchExperienceNotFound)).rejects.toThrow('connection terminated');
    await expect(notFoundAsNull(Promise.reject(new NotFoundError('other')), SearchExperienceNotFound)).rejects.toThrow('other');
  });
});
