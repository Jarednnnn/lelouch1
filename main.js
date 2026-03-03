import moment from 'moment';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import gradient from 'gradient-string';
import seeCommands from './lib/system/commandLoader.js';
import initDB from './lib/system/initDB.js';
import antilink from './commands/antilink.js';
import level from './commands/level.js';

seeCommands();

export default async (client, m) => {
  if (!m.message) return;

  const sender = m.sender;
  let body = m.message.conversation || m.message.extendedTextMessage?.text || 
             m.message.imageMessage?.caption || m.message.videoMessage?.caption || 
             m.message.buttonsResponseMessage?.selectedButtonId || 
             m.message.listResponseMessage?.singleSelectReply?.selectedRowId || 
             m.message.templateButtonReplyMessage?.selectedId || '';

  m.text = body;                    // ← CRÍTICO: esto arregla el comando

  initDB(m, client);
  antilink(client, m);

  // Plugins .all
  for (const name in global.plugins) {
    const plugin = global.plugins[name];
    if (plugin?.all) {
      try { await plugin.all.call(client, m, { client }); } catch (e) {}
    }
  }

  const from = m.key.remoteJid;
  const botJid = client.user.id.split(':')[0] + '@s.whatsapp.net';
  const chat = global.db.data.chats[m.chat] || {};
  const settings = global.db.data.settings[botJid] || {};
  const user = global.db.data.users[sender] ||= {};
  const users = chat.users[sender] || {};

  // ==================== PREFIX ====================
  const rawBotname = settings.namebot || 'Yuki';
  const tipo = settings.type || 'Sub';
  const namebot = /^[\w\s]+$/.test(rawBotname) ? rawBotname : 'Yuki';

  const shortForms = [namebot.charAt(0), namebot.split(" ")[0], tipo.split(" ")[0], 
                      namebot.split(" ")[0].slice(0,2), namebot.split(" ")[0].slice(0,3)];
  const prefixes = [...new Set([namebot, ...shortForms.map(n => n)])];

  let pluginPrefix = client.prefix || 
    (Array.isArray(settings.prefix) || typeof settings.prefix === 'string' 
      ? new RegExp('^(' + prefixes.join('|') + ')?(' + 
          (Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix])
            .map(p => p.replace(/[|\\{}()[\]^$+*.\-\^]/g, '\\$&')).join('|') + ')', 'i')
      : settings.prefix === true 
        ? /^/i 
        : new RegExp('^(' + prefixes.join('|') + ')?', 'i'));

  const match = (Array.isArray(pluginPrefix) ? pluginPrefix : [pluginPrefix])
    .map(p => [p instanceof RegExp ? p : new RegExp(p), p.exec(m.text)])
    .find(([_, exec]) => exec);

  if (!match) return;

  let usedPrefix = match[1][0] || '';
  let args = m.text.slice(usedPrefix.length).trim().split(/\s+/);
  let command = (args.shift() || '').toLowerCase();
  let text = args.join(' ');

  // ==================== GRUPO METADATA (con LID fix) ====================
  let groupMetadata = null;
  let groupAdmins = [];
  let groupName = '';

  if (m.isGroup) {
    try {
      groupMetadata = await client.groupMetadata(m.chat);
      groupName = groupMetadata.subject || '';
      groupAdmins = groupMetadata.participants.filter(p => 
        p.admin === 'admin' || p.admin === 'superadmin'
      );
    } catch (err) {
      console.error('Error groupMetadata:', err);
    }
  }

  // ✅ DETECCIÓN DE ADMIN ROBUSTA (arregla el #close, !close, etc.)
  const normalize = (jid) => (jid || '').replace(/@lid$/, '@s.whatsapp.net');

  const isBotAdmins = m.isGroup ? groupAdmins.some(p => 
    normalize(p.id) === botJid || 
    normalize(p.jid) === botJid || 
    normalize(p.lid) === botJid
  ) : false;

  const isAdmins = m.isGroup ? groupAdmins.some(p => 
    normalize(p.id) === sender || 
    normalize(p.jid) === sender || 
    normalize(p.lid) === sender
  ) : false;

  // ==================== LOG CONSOLE ====================
  const pushname = m.pushName || 'Sin nombre';
  if (!chat.primaryBot || chat.primaryBot === botJid) {
    const h = chalk.bold.blue('╭────────────────────────────···');
    const t = chalk.bold.blue('╰────────────────────────────···');
    const v = chalk.bold.blue('│');
    console.log(`\n${h}\n${chalk.bold.yellow(`${v} Fecha: ${moment().format('DD/MM/YY HH:mm:ss')}`)}\n${chalk.bold.blueBright(`${v} Usuario: ${pushname}`)}\n${chalk.bold.magentaBright(`${v} Remitente: ${gradient('deepskyblue','darkorchid')(sender)}`)}\n${m.isGroup ? chalk.bold.cyanBright(`${v} Grupo: ${groupName}\n${v} ID: ${gradient('violet','midnightblue')(from)}\n`) : chalk.bold.greenBright(`${v} Chat privado\n`)}${t}`);
  }

  // ==================== RESTO DEL CÓDIGO (sin cambios importantes) ====================
  // ... (el resto del código que ya tenías: primaryBot, ignore 3EB0/BAE5, owners, banned, etc.)

  if (chat?.isBanned && !(command === 'bot' && text === 'on') && !global.owner.includes(sender.split('@')[0])) {
    return m.reply(`ꕥ El bot *${settings.botname || 'Yuki'}* está desactivado en este grupo.\n\n> ✎ Un administrador puede activarlo con:\n> » *${usedPrefix}bot on*`);
  }

  if (chat.adminonly && !isAdmins) return;

  if (!command) return;

  const cmdData = global.comandos.get(command);
  if (!cmdData) {
    if (settings.prefix === true) return;
    await client.readMessages([m.key]);
    return m.reply(`ꕤ El comando *${command}* no existe.\n✎ Usa *${usedPrefix}help*`);
  }

  if (cmdData.isAdmin && !isAdmins) {
    return client.reply(m.chat, mess.admin || '《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.', m);
  }

  if (cmdData.botAdmin && !isBotAdmins) {
    return client.reply(m.chat, mess.botAdmin || '《✧》 Necesito ser administrador para ejecutar este comando.', m);
  }

  // Ejecución del comando
  try {
    await client.readMessages([m.key]);
    user.usedcommands = (user.usedcommands || 0) + 1;
    settings.commandsejecut = (settings.commandsejecut || 0) + 1;
    user.exp = (user.exp || 0) + Math.floor(Math.random() * 100);
    user.name = m.pushName;

    await cmdData.run(client, m, args, usedPrefix, command, text);
  } catch (error) {
    console.error(error);
    await client.sendMessage(m.chat, { text: `《✧》 Error al ejecutar el comando:\n${error.message}` }, { quoted: m });
  }

  level(m);
};
