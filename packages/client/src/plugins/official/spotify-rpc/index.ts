import { ClientPlugin, PluginContext } from '../../types';

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
  duration_ms: number;
}

interface SpotifyPlayerState {
  track_window: {
    current_track: SpotifyTrack;
  };
  position: number;
  paused: boolean;
}

const spotifyRpcPlugin: ClientPlugin = {
  id: 'spotify-rpc',
  meta: {
    name: 'Spotify Rich Presence',
    version: '1.0.0',
  },
  onEnable: async (context: PluginContext) => {
    console.log('[spotify-rpc] Plugin activé');

    // Vérifier si le token Spotify est disponible
    const spotifyToken = localStorage.getItem('spotify_access_token');
    if (!spotifyToken) {
      console.warn('[spotify-rpc] Aucun token Spotify trouvé. Connectez Spotify dans les paramètres.');
      return;
    }

    // Charger le SDK Spotify si nécessaire
    if (!window.Spotify) {
      await loadSpotifySDK();
    }

    // Créer le lecteur Spotify
    const player = new window.Spotify.Player({
      name: 'OpenCord Spotify RPC',
      getOAuthToken: (cb: (token: string) => void) => { cb(spotifyToken); },
    });

    player.addListener('player_state_changed', (state: SpotifyPlayerState) => {
      if (!state) return;

      const track = state.track_window.current_track;
      const now = Date.now();
      const start = now - state.position;
      const end = start + track.duration_ms;

      const activity = {
        name: 'Spotify',
        type: 2, // LISTENING
        details: track.name,
        state: track.artists.map(a => a.name).join(', '),
        timestamps: {
          start: Math.floor(start / 1000),
          end: Math.floor(end / 1000),
        },
        assets: {
          large_image: track.album.images[0]?.url || '',
          large_text: track.album.name,
        },
      };

      // Mettre à jour la présence via le contexte du plugin
      context.updatePresence('online', [activity]);
    });

    player.addListener('ready', () => {
      console.log('[spotify-rpc] Lecteur Spotify prêt');
    });

    player.connect();
    (window as any)._spotifyPlayer = player;
  },

  onDisable: async (context: PluginContext) => {
    console.log('[spotify-rpc] Plugin désactivé');
    const player = (window as any)._spotifyPlayer;
    if (player) {
      player.disconnect();
      delete (window as any)._spotifyPlayer;
    }
    // Effacer l'activité Spotify
    context.updatePresence('online', []);
  },

  hooks: {
    // Pas de hooks spécifiques pour ce plugin
  },
};

function loadSpotifySDK(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };
  });
}

export default spotifyRpcPlugin;
