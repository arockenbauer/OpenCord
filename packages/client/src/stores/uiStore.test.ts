import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      showMemberList: true,
      showUserSettings: false,
      showServerSettings: false,
      showCreateGuild: false,
      showInviteModal: false,
      showAdminPanel: false,
      activeServerSettingsTab: 'overview',
      serverSettingsContent: null,
      profilePopover: null,
      modalData: null,
      contextMenu: null,
    });
  });

  it('toggles the member list and opens user settings', () => {
    useUIStore.getState().toggleMemberList();
    useUIStore.getState().setShowUserSettings(true);

    expect(useUIStore.getState().showMemberList).toBe(false);
    expect(useUIStore.getState().showUserSettings).toBe(true);
  });

  it('tracks server settings tab and modal data', () => {
    useUIStore.getState().setShowServerSettings(true);
    useUIStore.getState().setActiveServerSettingsTab('roles');
    useUIStore.getState().setModalData({ guildId: 'guild-1' });

    expect(useUIStore.getState().showServerSettings).toBe(true);
    expect(useUIStore.getState().activeServerSettingsTab).toBe('roles');
    expect(useUIStore.getState().modalData).toEqual({ guildId: 'guild-1' });
  });

  it('stores and clears contextual UI overlays', () => {
    useUIStore.getState().setProfilePopover({ userId: 'user-1', x: 1, y: 2, width: 3, height: 4 });
    useUIStore.getState().setContextMenu({ x: 10, y: 20, items: [{ label: 'Open' }] });

    expect(useUIStore.getState().profilePopover?.userId).toBe('user-1');
    expect(useUIStore.getState().contextMenu?.items[0].label).toBe('Open');

    useUIStore.getState().setProfilePopover(null);
    useUIStore.getState().setContextMenu(null);
    expect(useUIStore.getState().profilePopover).toBeNull();
    expect(useUIStore.getState().contextMenu).toBeNull();
  });
});
