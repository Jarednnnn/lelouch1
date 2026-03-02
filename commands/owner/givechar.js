// plugins/owner-givechar.js
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

export default {
    command: ['givechar', 'addchar', 'givecharacter'],
    isOwner: true,
    run: async (client, m, args, usedPrefix, command) => {
        try {
            // Obtener usuario destino (mención o cita)
            const mentioned = m.mentionedJid;
            const who2 = mentioned.length > 0 ? mentioned[0] : (m.quoted ? m.quoted.sender : null);
            if (!who2) {
                return client.reply(m.chat, formatMessage('❀ Por favor, menciona al usuario o cita un mensaje.'), m);
            }
            const who = await resolveLidToRealJid(who2, client, m.chat);

            // El primer argumento debe ser el ID del personaje (ej. 173827)
            const characterId = args.find(arg => !arg.startsWith('@') && !arg.includes('@'));
            if (!characterId) {
                return client.reply(m.chat, formatMessage('ꕥ Ingresa el ID del personaje.\nEjemplo: #givechar 173827 @usuario'), m);
            }

            await m.react('🕒');

            // Cargar catálogo de personajes
            let catalog;
            try {
                catalog = await loadCharacters();
            } catch (e) {
                console.error('Error al cargar characters.json:', e);
                return client.reply(m.chat, formatMessage('❀ Error al cargar el catálogo de personajes.'), m);
            }

            // Aplanar para buscar por ID
            const allCharacters = flattenCharacters(catalog);
            const character = allCharacters.find(ch => ch.id == characterId); // comparación flexible

            if (!character) {
                await m.react('✖️');
                return client.reply(m.chat, formatMessage(`❀ No se encontró ningún personaje con ID *${characterId}*.`), m);
            }

            // ========== GUARDAR EN EL CHAT ACTUAL ==========
            if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = { users: {} };
            if (!global.db.data.chats[m.chat].users) global.db.data.chats[m.chat].users = {};
            if (!global.db.data.chats[m.chat].users[who]) {
                global.db.data.chats[m.chat].users[who] = {
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
            if (!global.db.data.chats[m.chat].users[who].characters) {
                global.db.data.chats[m.chat].users[who].characters = [];
            }

            // Evitar duplicados
            if (global.db.data.chats[m.chat].users[who].characters.includes(characterId)) {
                await m.react('✖️');
                return client.reply(m.chat, formatMessage(`❀ El usuario ya tiene el personaje *${character.name}* (ID: ${characterId}).`), m);
            }

            // Añadir el ID al array del chat
            global.db.data.chats[m.chat].users[who].characters.push(characterId);

            // ========== TAMBIÉN GUARDAR EN users GLOBAL (por compatibilidad) ==========
            if (!global.db.data.users[who]) {
                global.db.data.users[who] = {
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
            if (!global.db.data.users[who].characters) {
                global.db.data.users[who].characters = [];
            }
            if (!global.db.data.users[who].characters.includes(characterId)) {
                global.db.data.users[who].characters.push(characterId);
            }

            // Guardar cambios
            global.saveDatabase();

            await m.react('✔️');
            client.reply(m.chat, formatMessage(`❀ Personaje *${character.name}* (ID: ${characterId}) añadido a @${who.split('@')[0]}.`), m, { mentions: [who] });

        } catch (error) {
            console.error(error);
            await m.react('✖️');
            client.reply(m.chat, `⚠︎ Se ha producido un problema.\n${error.message}`, m);
        }
    }
}
