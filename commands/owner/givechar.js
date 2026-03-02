// plugins/owner-givechar.js
import { resolveLidToRealJid } from "../../lib/utils.js"

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
            const characterName = args.find(arg => !arg.startsWith('@') && !arg.includes('@'));
            if (!characterName) {
                return client.reply(m.chat, formatMessage('ꕥ Ingresa el nombre o ID del personaje.\nEjemplo: #givechar Naruto @usuario'), m);
            }

            await m.react('🕒');

            // ========== 1. GUARDAR EN EL OBJETO GLOBAL characters ==========
            if (!global.db.data.characters) global.db.data.characters = {};
            
            // Generar ID único para el personaje
            const characterId = `char_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            
            global.db.data.characters[characterId] = {
                name: characterName,
                owner: who,
                obtainedAt: new Date().toISOString(),
                source: 'givechar'
            };

            // ========== 2. GUARDAR EN EL CHAT ACTUAL (para compatibilidad) ==========
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
            // Evitar duplicados (opcional)
            if (!global.db.data.chats[m.chat].users[who].characters.includes(characterId)) {
                global.db.data.chats[m.chat].users[who].characters.push(characterId);
            }

            // ========== 3. TAMBIÉN GUARDAR EN users GLOBAL (por si acaso) ==========
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
                    characters: [] // Añadimos campo por si acaso
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
            client.reply(m.chat, formatMessage(`❀ Personaje *${characterName}* añadido a @${who.split('@')[0]}. ID: ${characterId}`), m, { mentions: [who] });

        } catch (error) {
            console.error(error);
            await m.react('✖️');
            client.reply(m.chat, `⚠︎ Se ha producido un problema.\n${error.message}`, m);
        }
    }
}
