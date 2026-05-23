import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function scrollIntoView() {};

afterEach(() => {
  cleanup();
});

export {};
