import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

process.env.LOG_SILENT = '1';
vi.mock('server-only', () => ({}));

afterEach(() => {
  cleanup();
});
