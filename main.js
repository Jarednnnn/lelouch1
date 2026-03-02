import ws from 'ws';
import moment from 'moment';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import gradient from 'gradient-string';
import seeCommands from './lib/system/commandLoader.js';
import initDB from './lib/system/initDB.js';
import antilink from './commands/antilink.js';
import level from './commands/level.js';
import { getGroupAdmins } from './lib/message.js';

seeCommands()

export default async (client, m) => {
    if (!m.message) return
    const sender = m.sender 
    let body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || m.message.buttonsResponseMessage?.selectedButtonId || m.message.listResponseMessage?.singleSelectReply?.selectedRowId || m.message.templateButtonReplyMessage?.selectedId || ''

    initDB(m, client)
    antilink(client, m)

    for (const name in global.plugins) {
        const plugin = global.plugins[name]
        if (plugin && typeof plugin.all === "function") {
            try {
                await plugin.all.call(client, m, { client })
            } catch (err) {
                console.error(`Error en plugin.all -> ${name}`, err)
            }
        }
    }
  
    const from = m.key.remoteJid
    const botJid = client.user.id.split(':')[0] + '@s.whatsapp.net'
    const chat = global.db.data.chats[m.chat] || {}
    const settings = global.db.data.settings[botJid] || {}  
    const user = global.db.data.users[sender] ||= {}
    const users = chat.users?.[sender] || {}
    const rawBotname = settings.namebot || 'Yuki'
    const tipo = settings.type || 'Sub'
    const isValidBotname = /^[\w\s]+$/.test(rawBotname)
    const namebot = isValidBotname ? rawBotname : 'Yuki'

    // --- LÓGICA DE PREFIJOS ---
    const shortForms = [namebot.charAt(0), namebot.split(" ")[0], tipo.split(" ")[0], namebot.split(" ")[0].slice(0, 2), namebot.split(" ")[0].slice(0, 3)]
    const prefixes = shortForms.map(name => `${name}`)
    prefixes.unshift(namebot)
    let prefix
    if (Array.isArray(settings.prefix) || typeof settings.prefix === 'string') {
        const prefixArray = Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix]
        prefix = new RegExp('^(' + prefixes.join('|') + ')?(' + prefixArray.map(p => p.replace(/[|\\{}()[\]^$+*.\-\^]/g, '\\$&')).join('|') + ')', 'i')
    } else if (settings.prefix === true) {
        prefix = new RegExp('^', 'i')
    } else {
        prefix = new RegExp('^(' + prefixes.join('|') + ')?', 'i')
    }

    const strRegex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    let pluginPrefix = client.prefix ? client.prefix : prefix
    let matchs = pluginPrefix instanceof RegExp ? [[pluginPrefix.exec(m.text || ''), pluginPrefix]] : Array.isArray(pluginPrefix) ? pluginPrefix.map(p => {
        let regex = p instanceof RegExp ? p : new RegExp(strRegex(p))
        return [regex.exec(m.text || ''), regex]
    }) : typeof pluginPrefix === 'string' ? [[new RegExp(strRegex(pluginPrefix)).exec(m.text || ''), new RegExp(strRegex(pluginPrefix))]] : [[null, null]]
    let match = matchs.find(p => p[0])

    // ---------------------------------------------------------
    // ⭐ SECCIÓN CORREGIDA: DETECCIÓN DE ADMINS
    // ---------------------------------------------------------
    let groupMetadata = null
    let groupAdmins = []
    let groupName = ''
    let isBotAdmins = false
    let isAdmins = false

    if (m.isGroup) {
        groupMetadata = await client.groupMetadata(m.chat).catch(() => null)
        groupName = groupMetadata?.subject || ''
        
        // Función para limpiar JIDs de literales de dispositivo (:1, :2...)
        const cleanJid = (id) => id ? id.split('@')[0].split(':')[0] + '@s.whatsapp.net' : ''
        
        const senderClean = cleanJid(m.sender)
        const botClean = cleanJid(botJid)
        
        // Obtenemos la lista de participantes que son admins
        const adminsList = groupMetadata?.participants.filter(p => (p.admin === 'admin' || p.admin === 'superadmin')) || []
        
        // Verificamos si el bot o el usuario están en esa lista usando JIDs limpios
        isBotAdmins = adminsList.some(p => cleanJid(p.id) === botClean)
        isAdmins = adminsList.some(p => cleanJid(p.id) === senderClean)
    }
    // ---------------------------------------------------------

    const isOwners = [botJid, ...(settings.owner ? [settings.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')]
        .some(id => id.split('@')[0].split(':')[0] === m.sender.split('@')[0].split(':')[0])

    if (!match) return
    let usedPrefix = (match[0] || [])[0] || ''
    let args = m.text.slice(usedPrefix.length).trim().split(" ")
    let command = (args.shift() || '').toLowerCase()
    let text = args.join(' ')

    const pushname = m.pushName || 'Sin nombre'
    const chatData = global.db.data.chats[from] || {}

    // --- CONSOLA LOG ---
    if (!chatData.primaryBot || chatData.primaryBot === botJid) {
        const h = chalk.bold.blue('╭────────────────────────────···')
        const t = chalk.bold.blue('╰────────────────────────────···')
        const v = chalk.bold.blue('│')
        console.log(`\n${h}\n${chalk.bold.yellow(`${v} Fecha: ${chalk.whiteBright(moment().format('DD/MM/YY HH:mm:ss'))}`)}\n${chalk.bold.blueBright(`${v} Usuario: ${chalk.whiteBright(pushname)}`)}\n${chalk.bold.magentaBright(`${v} Comando: ${command}`)}\n${m.isGroup ? chalk.bold.cyanBright(`${v} Grupo: ${chalk.greenBright(groupName)}\n`) : chalk.bold.greenBright(`${v} Chat privado\n`)}${t}`)
    }

    if (chat?.isBanned && !isOwners) return
    if (chat.adminonly && !isAdmins) return
    
    const cmdData = global.comandos.get(command)
    if (!cmdData) return

    // Validaciones de permisos
    if (cmdData.isOwner && !isOwners) return
    if (cmdData.isAdmin && !isAdmins) return client.sendMessage(m.chat, { text: `《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.` }, { quoted: m })
    if (cmdData.botAdmin && !isBotAdmins) return client.sendMessage(m.chat, { text: `《✧》 Necesito ser Administrador para ejecutar esto.` }, { quoted: m })

    try {
        await client.readMessages([m.key])
        user.usedcommands = (user.usedcommands || 0) + 1
        await cmdData.run(client, m, args, usedPrefix, command, text, { isAdmins, isBotAdmins, isOwners, groupMetadata })
    } catch (error) {
        console.error(error)
        await client.sendMessage(m.chat, { text: `《✧》 Error: ${error.message}` }, { quoted: m })
    }
    level(m)
}
