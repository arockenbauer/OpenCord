/**
 * Annonce un message aux lecteurs d'écran via les régions aria-live.
 */

type Region = 'messages' | 'mentions';

/**
 * Annonce un nouveau message.
 * @param username - Nom de l'auteur.
 * @param content - Contenu du message (peut être vide pour les pièces jointes).
 */
export function announceMessage(username: string, content: string): void {
  const region = document.getElementById('aria-live-messages');
  if (!region) return;
  const text = content.trim() ? `${username} : ${content}` : `${username} a envoyé une pièce jointe`;
  region.textContent = text;
  // Réinitialiser pour permettre la prochaine annonce
  setTimeout(() => { region.textContent = ''; }, 1000);
}

/**
 * Annonce qu'un utilisateur est en train d'écrire.
 * @param username - Nom de l'utilisateur.
 */
export function announceTyping(username: string): void {
  const region = document.getElementById('aria-live-mentions');
  if (!region) return;
  region.textContent = `${username} est en train d'écrire…`;
  // Réinitialiser après un délai
  setTimeout(() => { region.textContent = ''; }, 3000);
}

/**
 * Annonce un changement de canal.
 * @param channelName - Nom du canal sélectionné.
 */
export function announceChannelChange(channelName: string): void {
  const region = document.getElementById('aria-live-messages');
  if (!region) return;
  region.textContent = `Canal ${channelName} sélectionné`;
  setTimeout(() => { region.textContent = ''; }, 1000);
}
