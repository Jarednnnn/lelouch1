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

    // --- DETECCIÓN DE ADMINS (VERSIÓN INFALIBLE) ---
    let groupMetadata = m.isGroup ? await client.groupMetadata(m.chat).catch(() => null) : null
    let isBotAdmins = false
    let isAdmins = false
    let groupAdmins = []

    if (m.isGroup && groupMetadata) {
        const participants = groupMetadata.participants || []
        // Extraemos solo el número puro (quitamos @s.whatsapp.net y :1)
        const parse = (id) => id.split('@')[0].split(':')[0]
        
        const senderNum = parse(m.sender)
        const botNum = parse(botJid)
        
        // Filtramos admins: si p.admin no es null, es admin o creador
        groupAdmins = participants.filter(p => p.admin !== null).map(p => parse(p.id))
        
        isBotAdmins = groupAdmins.includes(botNum)
        isAdmins = groupAdmins.includes(senderNum)
    }

    const isOwners = [botJid, ...(settings.owner ? [settings.owner] : []), ...global.owner.map(num => num + '@s.whatsapp.net')]
        .some(id => id.split('@')[0].split(':')[0] === m.sender.split('@')[0].split(':')[0])

    // --- PLUGINS BEFORE ---
    for (const name in global.plugins) {
        const plugin = global.plugins[name]
        if (plugin && !plugin.disabled && typeof plugin.before === "function") {
            try {
                if (await plugin.before.call(client, m, { client, isAdmins, isBotAdmins, isOwners })) continue
            } catch (err) { console.error(err) }
        }
    }

    if (!match) return
    let usedPrefix = (match[0] || [])[0] || ''
    let args = m.text.slice(usedPrefix.length).trim().split(" ")
    let command = (args.shift() || '').toLowerCase()
    let text = args.join(' ')

    const pushname = m.pushName || 'Sin nombre'
    const from = m.chat
    const chatData = global.db.data.chats[from] || {}

    // --- CONSOLA LOG ---
    if (!chatData.primaryBot || chatData.primaryBot === botJid) {
        const h = chalk.bold.blue('╭────────────────────────────···')
        const t = chalk.bold.blue('╰────────────────────────────···')
        const v = chalk.bold.blue('│')
        console.log(`\n${h}\n${chalk.bold.yellow(`${v} Fecha: ${chalk.whiteBright(moment().format('DD/MM/YY HH:mm:ss'))}`)}\n${chalk.bold.blueBright(`${v} Usuario: ${chalk.whiteBright(pushname)}`)}\n${chalk.bold.magentaBright(`${v} Comando: ${command}`)}\n${m.isGroup ? chalk.bold.cyanBright(`${v} Grupo: ${chalk.greenBright(groupMetadata?.subject)}\n`) : chalk.bold.greenBright(`${v} Chat privado\n`)}${t}`)
    }

    // --- VALIDACIONES DE COMANDOS ---
    if (chat?.isBanned && !isOwners) return
    if (chat.adminonly && !isAdmins) return
    
    const cmdData = global.comandos.get(command)
    if (!cmdData) return

    // Literales de error para feedback al usuario
    if (cmdData.isOwner && !isOwners) return
    if (cmdData.isAdmin && !isAdmins) return m.reply(`《✧》 Este comando solo puede ser ejecutado por los Administradores del Grupo.`)
    if (cmdData.botAdmin && !isBotAdmins) return m.reply(`《✧》 Necesito ser Administrador para ejecutar esto.`)

    try {
        await client.readMessages([m.key])
        const today = new Date().toISOString().split('T')[0]
        user.usedcommands = (user.usedcommands || 0) + 1
        
        // Ejecución del comando pasando todas las variables útiles
        await cmdData.run(client, m, args, usedPrefix, command, text, { isAdmins, isBotAdmins, isOwners, groupMetadata })
    } catch (error) {
        console.error(error)
        await client.sendMessage(m.chat, { text: `《✧》 Error al ejecutar el comando\n${error.message}` }, { quoted: m })
    }
    level(m)
}
