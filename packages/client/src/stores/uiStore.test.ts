import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

function resetUIStore() {
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
}

describe('uiStore', () => {
  beforeEach(() => {
    resetUIStore();
  });

  it('toggles core modal and panel state', () => {
    useUIStore.getState().toggleMemberList();
    useUIStore.getState().setShowUserSettings(true);
    useUIStore.getState().setShowServerSettings(true);
    useUIStore.getState().setShowInviteModal(true);
    useUIStore.getState().setActiveServerSettingsTab('roles');

    expect(useUIStore.getState().showMemberList).toBe(false);
    expect(useUIStore.getState().showUserSettings).toBe(true);
    expect(useUIStore.getState().showServerSettings).toBe(true);
    expect(useUIStore.getState().showInviteModal).toBe(true);
    expect(useUIStore.getState().activeServerSettingsTab).toBe('roles');
  });

  it('stores popovers, modal data and context menus', () => {
    useUIStore.getState().setProfilePopover({ userId: 'user-1', x: 1, y: 2, width: 3, height: 4 });
    useUIStore.getState().setModalData({ guildId: 'guild-1' });
    useUIStore.getState().setContextMenu({ x: 10, y: 20, items: [{ label: 'Open' }] });

    expect(useUIStore.getState().profilePopover?.userId).toBe('user-1');
    expect(useUIStore.getState().modalData).toEqual({ guildId: 'guild-1' });
    expect(useUIStore.getState().contextMenu?.items).toHaveLength(1);
  });
});
