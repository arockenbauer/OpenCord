import type { ClientPlugin } from '@/plugins/types';

const plugin: ClientPlugin = {
  meta: {
    name: 'Always Animate',
    slug: 'always-animate',
    description: 'Anime tout ce qui peut être animé.',
    version: '1.0.0',
    type: 'CLIENT',
    author: 'Équipe OpenCord',
    icon: '✨',
    settingsSchema: {
      type: 'object',
      properties: {
        speed: {
          type: 'number',
          title: "Vitesse d'animation",
          default: 1,
          minimum: 0.1,
          maximum: 3,
        },
      },
    },
  },
  
  onEnable(context: any) {
    console.log('Always Animate plugin enabled');
  },
  
  onDisable() {
    console.log('Always Animate plugin disabled');
  },
  
  hooks: {
    'message.render'({ message, element }: { message: any; element: HTMLElement }) {
      // Ajouter des animations aux messages
      const ctx = this as any;
      element.style.animationDuration = `${1 / (ctx.getSettings?.()?.speed || 1)}s`;
    },
  },
};

export default plugin;
