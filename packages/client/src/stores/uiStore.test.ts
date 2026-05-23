import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: 'dark',
      sidebarCollapsed: false,
      activeModal: null,
      modals: {},
    });
  });

  it('toggles theme', () => {
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('light');
    useUIStore.getState().toggleTheme();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('toggles sidebar', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('opens modal', () => {
    useUIStore.getState().openModal('create-guild');
    expect(useUIStore.getState().activeModal).toBe('create-guild');
  });

  it('closes modal', () => {
    useUIStore.getState().openModal('create-guild');
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });

  it('sets custom property', () => {
    useUIStore.getState().setProperty('customSetting', true);
    expect(useUIStore.getState().customSetting).toBe(true);
  });
});
