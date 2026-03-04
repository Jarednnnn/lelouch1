// plugins/owner-dar.js
import { resolveLidToRealJid } from "../../lib/utils.js"
import { promises as fs } from 'fs'

const charactersFilePath = './lib/characters.json'

async function loadCharacters() {
    const data = await fs.readFile(charactersFilePath, 'utf-8')
    return JSON.parse(data)
}

function flattenCharacters(structure) {
    return Object.values(structure).flatMap(s => Array.isArray(s.characters) ? s.characters : [])
}

const formatMessage = (text) => `《✧》 ${text}`;

const normalizeNumber = (num) => {
    let cleaned = num.replace(/\s+/g, '');
    if (!cleaned.includes('@')) {
        cleaned = cleaned + '@s.whatsapp.net';
    }
    return cleaned;
};

export default {
    command: ['dar', 'regalo', 'darputa'],
    isOwner: true,
    run: async (client, m, args, usedPrefix, command) => {
        try {
            // --- 1. Determinar el destinatario ---
            let targetId = null;
            let argsFiltrados = [...args]; // copia para modificar

            // Prioridad 1: Menciones
            if (m.mentionedJid && m.mentionedJid.length > 0) {
                targetId = await resolveLidToRealJid(m.mentionedJid[0], client, m.chat);
                // Eliminar de args cualquier argumento que sea una mención (contenga @)
                argsFiltrados = argsFiltrados.filter(arg => !arg.includes('@'));
            }
            // Prioridad 2: Mensaje citado
            else if (m.quoted) {
                targetId = await resolveLidToRealJid(m.quoted.sender, client, m.chat);
                // En este caso no hay mención en args, así que no filtramos
            }
            // Prioridad 3: Último argumento si parece un número (sin @)
            else if (args.length > 0) {
                // El último argumento podría ser el número
                const lastArg = args[args.length - 1];
                // Si no tiene @ y parece un número (solo dígitos y quizás +)
                if (!lastArg.includes('@') && /^[0-9+]+$/.test(lastArg)) {
                    targetId = normalizeNumber(lastArg);
                    // Quitamos ese argumento de la lista
                    argsFiltrados.pop();
                }
            }

            if (!targetId) {
                return client.reply(m.chat, formatMessage('❀ Debes mencionar, citar o escribir el número del destinatario.'), m);
            }

            // --- 2. Identificador del personaje (lo que queda en argsFiltrados) ---
            if (argsFiltrados.length === 0) {
                return client.reply(m.chat, formatMessage('ꕥ Ingresa el ID o nombre del personaje.\nEjemplo: #dar 100001 @usuario  o  #dar Lelouch @usuario'), m);
            }

            const identifier = argsFiltrados.join(' ').trim();

            await m.react('🕒');

            // Cargar catálogo
            let catalog;
            try {
                catalog = await loadCharacters();
            } catch (e) {
                console.error('Error al cargar characters.json:', e);
                return client.reply(m.chat, formatMessage('❀ Error al cargar el catálogo de personajes.'), m);
            }

            const allCharacters = flattenCharacters(catalog);

            // Buscar personaje
            let character;
            if (/^\d+$/.test(identifier)) {
                character = allCharacters.find(c => String(c.id) === identifier);
            } else {
                character = allCharacters.find(c => c.name.toLowerCase() === identifier.toLowerCase()) ||
                            allCharacters.find(c => c.name.toLowerCase().includes(identifier.toLowerCase()));
            }

            if (!character) {
                await m.react('✖️');
                return client.reply(m.chat, formatMessage(`❀ No se encontró ningún personaje con el identificador: *${identifier}*.`), m);
            }

            const charId = String(character.id);
            const charName = character.name;

            // ========== PREPARAR ESTRUCTURAS ==========
            if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = { users: {}, characters: {} };
            if (!global.db.data.chats[m.chat].users) global.db.data.chats[m.chat].users = {};
            if (!global.db.data.chats[m.chat].characters) global.db.data.chats[m.chat].characters = {};

            // Asegurar entrada del personaje en el chat
            if (!global.db.data.chats[m.chat].characters[charId]) {
                global.db.data.chats[m.chat].characters[charId] = {
                    name: charName,
                    value: character.value || 100,
                    user: null,
                    claimedAt: null
                };
            }

            // Asegurar usuario destino
            if (!global.db.data.chats[m.chat].users[targetId]) {
                global.db.data.chats[m.chat].users[targetId] = {
                    stats: {},
                    usedTime: null,
                    lastCmd: 0,
                    coins: 0,
                    bank: 0,
                    afk: -1,
                    afkReason: "",
                    characters: []
                };
            }
            if (!Array.isArray(global.db.data.chats[m.chat].users[targetId].characters)) {
                global.db.data.chats[m.chat].users[targetId].characters = [];
            }

            // --- Verificar si ya lo tiene (opcional, puedes omitir si quieres permitir duplicados) ---
            if (global.db.data.chats[m.chat].users[targetId].characters.includes(charId)) {
                await m.react('✖️');
                return client.reply(m.chat, formatMessage(`❀ El usuario ya tiene el personaje *${charName}* (ID: ${charId}).`), m);
            }

            // --- Buscar al dueño actual del personaje ---
            const currentOwner = global.db.data.chats[m.chat].characters[charId].user;
            let oldOwnerName = null;
            let oldOwnerId = null;

            if (currentOwner) {
                // Guardamos datos del antiguo dueño
                oldOwnerId = currentOwner;
                oldOwnerName = global.db.data.users[currentOwner]?.name || currentOwner.split('@')[0];

                // Quitar el personaje del array del antiguo dueño
                if (global.db.data.chats[m.chat].users[currentOwner]) {
                    const userChars = global.db.data.chats[m.chat].users[currentOwner].characters;
                    if (Array.isArray(userChars)) {
                        const index = userChars.indexOf(charId);
                        if (index !== -1) userChars.splice(index, 1);
                    }
                }
                // También de users global si existe
                if (global.db.data.users[currentOwner] && Array.isArray(global.db.data.users[currentOwner].characters)) {
                    const index = global.db.data.users[currentOwner].characters.indexOf(charId);
                    if (index !== -1) global.db.data.users[currentOwner].characters.splice(index, 1);
                }

                // Limpiar favorito si era su favorito
                if (global.db.data.chats[m.chat].users[currentOwner]?.favorite === charId) {
                    delete global.db.data.chats[m.chat].users[currentOwner].favorite;
                }
                if (global.db.data.users[currentOwner]?.favorite === charId) {
                    delete global.db.data.users[currentOwner].favorite;
                }

                // Limpiar de ventas si estaba en venta
                if (global.db.data.chats[m.chat].sales?.[charId] && global.db.data.chats[m.chat].sales[charId].user === currentOwner) {
                    delete global.db.data.chats[m.chat].sales[charId];
                }
            }

            // Añadir el personaje al nuevo dueño
            global.db.data.chats[m.chat].users[targetId].characters.push(charId);
            global.db.data.chats[m.chat].characters[charId].user = targetId;
            global.db.data.chats[m.chat].characters[charId].claimedAt = Date.now();

            // También en users global
            if (!global.db.data.users[targetId]) {
                global.db.data.users[targetId] = {
                    name: null,
                    exp: 0,
                    level: 0,
                    usedcommands: 0,
                    pasatiempo: "",
                    description: "",
                    marry: "",
                    genre: "",
                    birth: "",
                    metadatos: null,
                    metadatos2: null,
                    characters: []
                };
            }
            if (!Array.isArray(global.db.data.users[targetId].characters)) {
                global.db.data.users[targetId].characters = [];
            }
            if (!global.db.data.users[targetId].characters.includes(charId)) {
                global.db.data.users[targetId].characters.push(charId);
            }

            // Guardar cambios
            global.saveDatabase();

            await m.react('✔️');

            // Mensaje de respuesta
            const targetName = global.db.data.users[targetId]?.name || targetId.split('@')[0];
            let replyMsg = `❀ Personaje *${charName}* (ID: ${charId}) ha sido dado a @${targetId.split('@')[0]}.`;
            if (oldOwnerId) {
                replyMsg = `❀ Personaje *${charName}* (ID: ${charId}) transferido de ${oldOwnerName} a @${targetId.split('@')[0]}.`;
            }

            client.reply(m.chat, formatMessage(replyMsg), m, { mentions: [targetId] });

        } catch (error) {
            console.error(error);
            await m.react('✖️');
            client.reply(m.chat, `⚠︎ Se ha producido un problema.\n${error.message}`, m);
        }
    }
}
