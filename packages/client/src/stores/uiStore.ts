import { create } from 'zustand';

interface ProfilePopoverState {
  userId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ServerSettingsTab = 'overview' | 'members' | 'roles' | 'channels' | 'emojis' | 'invites' | 'integrations' | 'plugins' | 'moderation' | 'automod' | 'audit-log' | 'danger' | 'boost';

interface UIState {
  showMemberList: boolean;
  showUserSettings: boolean;
  showServerSettings: boolean;
  showCreateGuild: boolean;
  showInviteModal: boolean;
  showAdminPanel: boolean;
  activeServerSettingsTab: ServerSettingsTab;
  serverSettingsContent: React.ReactNode | null;
  profilePopover: ProfilePopoverState | null;
  modalData: any;
  contextMenu: { x: number; y: number; items: any[] } | null;
  toggleMemberList: () => void;
  setShowUserSettings: (show: boolean) => void;
  setShowServerSettings: (show: boolean) => void;
  setShowCreateGuild: (show: boolean) => void;
  setShowInviteModal: (show: boolean) => void;
  setShowAdminPanel: (show: boolean) => void;
  setActiveServerSettingsTab: (tab: ServerSettingsTab) => void;
  setServerSettingsContent: (content: React.ReactNode | null) => void;
  setProfilePopover: (popover: ProfilePopoverState | null) => void;
  setModalData: (data: any) => void;
  setContextMenu: (menu: { x: number; y: number; items: any[] } | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
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

  toggleMemberList: () => set((state) => ({ showMemberList: !state.showMemberList })),
  setShowUserSettings: (show) => set({ showUserSettings: show }),
  setShowServerSettings: (show) => set({ showServerSettings: show }),
  setShowCreateGuild: (show) => set({ showCreateGuild: show }),
  setShowInviteModal: (show) => set({ showInviteModal: show }),
  setShowAdminPanel: (show) => set({ showAdminPanel: show }),
  setActiveServerSettingsTab: (tab) => set({ activeServerSettingsTab: tab }),
  setServerSettingsContent: (content) => set({ serverSettingsContent: content }),
  setProfilePopover: (popover) => set({ profilePopover: popover }),
  setModalData: (data) => set({ modalData: data }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
}));
