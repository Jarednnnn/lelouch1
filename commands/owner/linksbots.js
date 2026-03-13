// plugins/grupo/linkb.js
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
// <-- NUEVO: Importar la función de actualización de grupos
import { updateBotGroups } from '../../lib/system/groupUpdater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para obtener todos los bots (Owner + Subs) desde las carpetas de sesión
function getAllBots() {
  const basePath = path.join(__dirname, '../../Sessions');
  const bots = [];

  // Owner (si existe)
  const ownerCreds = path.join(basePath, 'Owner', 'creds.json');
  if (fs.existsSync(ownerCreds)) {
    try {
      const ownerJid = global.client.user.id.split(':')[0] + '@s.whatsapp.net';
      bots.push({
        jid: ownerJid,
        type: 'Owner',
        name: global.db.data.settings[ownerJid]?.namebot || 'Bot principal'
      });
    } catch { }
  }

  // Subs
  const subsPath = path.join(basePath, 'Subs');
  if (fs.existsSync(subsPath)) {
    const subDirs = fs.readdirSync(subsPath);
    for (const sub of subDirs) {
      const credsPath = path.join(subsPath, sub, 'creds.json');
      if (fs.existsSync(credsPath)) {
        const number = sub.replace(/\D/g, '');
        const jid = number + '@s.whatsapp.net';
        bots.push({
          jid,
          type: 'Sub',
          name: global.db.data.settings[jid]?.namebot || 'Sub-Bot'
        });
      }
    }
  }

  return bots;
}

export default {
  command: ['linkb', 'linkbot'],
  category: 'grupo',
  description: 'Muestra los links de los grupos donde un bot específico es administrador.',
  run: async (client, m, args, usedPrefix, command) => {
    // Si no hay argumentos, mostrar lista de bots disponibles
    if (!args[0]) {
      const bots = getAllBots();
      let msg = '✦ *Bots disponibles:*\n\n';
      bots.forEach(bot => {
        msg += `➭ ${bot.type} › *${bot.name}*\n   » @${bot.jid.split('@')[0]}\n`;
      });
      msg += `\n✎ Uso: *${usedPrefix + command} <nombre o número del bot>*`;
      return client.reply(m.chat, msg, m, { mentions: bots.map(b => b.jid) });
    }

    const query = args.join(' ').toLowerCase().trim();
    
    // Buscar el bot que coincida con el argumento (por número o por nombre)
    const bots = getAllBots();
    let targetBot = null;

    // 1. Buscar por número (sin @)
    const cleanNumber = query.replace(/\D/g, '');
    if (cleanNumber) {
      targetBot = bots.find(bot => bot.jid.split('@')[0] === cleanNumber);
    }

    // 2. Si no, buscar por nombre (coincidencia parcial insensible)
    if (!targetBot) {
      targetBot = bots.find(bot => bot.name.toLowerCase().includes(query));
    }

    if (!targetBot) {
      return client.reply(m.chat, `✖️ No se encontró ningún bot con el criterio: *${query}*`, m);
    }

    const botJid = targetBot.jid;
    const botName = targetBot.name;
    
    // <-- NUEVO: Si el bot consultado es el mismo que ejecuta el comando, actualizar grupos ahora
    const currentBotJid = client.user.id.split(':')[0] + '@s.whatsapp.net';
    if (botJid === currentBotJid) {
      await updateBotGroups(client);
    }

    const botData = global.db.data.settings[botJid];

    // Verificar si el bot tiene información de grupos guardada
    if (!botData || !botData.groups || Object.keys(botData.groups).length === 0) {
      return client.reply(m.chat, `❀ El bot *${botName}* no tiene grupos registrados en este momento.\nAsegúrate de que el bot haya actualizado su lista de grupos.`, m);
    }

    // Filtrar grupos donde el bot es admin
    const adminGroups = Object.values(botData.groups).filter(g => g.admin === true);

    if (adminGroups.length === 0) {
      return client.reply(m.chat, `ꕥ El bot *${botName}* no es administrador en ningún grupo actualmente.`, m);
    }

    // Construir mensaje
    let replyMsg = `❖ *Grupos donde ${botName} es administrador:*\n\n`;
    adminGroups.forEach((group, index) => {
      replyMsg += `${index + 1}. *${group.name || 'Sin nombre'}*\n   🔗 ${group.link || 'No disponible'}\n\n`;
    });
    replyMsg += `✎ Total: *${adminGroups.length}* grupos.`;

    await client.reply(m.chat, replyMsg, m);
  }
};
